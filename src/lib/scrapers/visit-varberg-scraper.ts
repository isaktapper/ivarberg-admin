import { BaseScraper } from './base-scraper';
import { ScrapedEvent } from './types';
import { resolveIsFree } from '../services/priceResolver';
import * as cheerio from 'cheerio';

interface VisitVarbergDate {
  startDate: string; // ISO 8601, UTC
  endDate?: string;
}

interface VisitVarbergEventData {
  name: string;
  dates: VisitVarbergDate[];
  venue: string;
  address: string;
  description: string;
  photos?: Array<{
    url: string;
    alt?: string;
  }>;
  website?: string;
  bookingLink?: string;
  price?: string | number; // Visit Varberg skickar ibland tal, ibland sträng
  email?: string;
  phone?: string;
  isFree?: boolean;
  longTerm?: boolean;
  useDefaultStartTime?: boolean; // True = heldag utan specifik tid
  useDefaultEndTime?: boolean;
  organizer?: string | { name?: string; surname?: string }; // Gammalt format: sträng. Nytt format: person-objekt
  organization?: string; // Nytt format (hösten 2026): arrangörens namn
}

/**
 * Plockar ut alla JSON-objekt som skickas till AppRegistry.registerInitialState(...)
 * i ett script. Använder klammer-räkning i stället för regex - objekten är
 * 10 000+ tecken och innehåller "});" i beskrivningstexter.
 */
export function extractInitialStates(scriptContent: string): unknown[] {
  const results: unknown[] = [];
  const marker = /registerInitialState\(\s*['"][^'"]*['"]\s*,\s*/g;
  let match: RegExpExecArray | null;

  while ((match = marker.exec(scriptContent)) !== null) {
    const start = match.index + match[0].length;
    if (scriptContent[start] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < scriptContent.length; i++) {
      const ch = scriptContent[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            results.push(JSON.parse(scriptContent.slice(start, i + 1)));
          } catch {
            // Inte giltig JSON - inte det vi letar efter
          }
          break;
        }
      }
    }
  }
  return results;
}

/**
 * Visit Varberg bytte eventplattform hösten 2026: eventdatan låg tidigare på
 * toppnivå, nu ligger den i `{ event: {...}, breadcrumbs: [...] }`. Stöd båda.
 */
export function pickEventData(candidate: unknown): VisitVarbergEventData | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, unknown>;
  const inner = (obj.event && typeof obj.event === 'object' ? obj.event : obj) as Record<string, unknown>;
  if (typeof inner.name === 'string' && Array.isArray(inner.dates)) {
    return inner as unknown as VisitVarbergEventData;
  }
  return null;
}

/** "2026-10-26T03:30:00Z" -> { date: "2026-10-26", time: "04:30:00" } i svensk tid */
function toStockholm(iso: string): { date: string; time: string } {
  const local = new Date(iso).toLocaleString('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const [date, time] = local.split(' ');
  return { date, time };
}

/** Starttider före 06:00 räknas som "öppet hela dagen" om tillfället varar så här länge */
const OPEN_HOURS_MIN_DURATION_MS = 12 * 60 * 60 * 1000;

/**
 * Lokal starttid ("YYYY-MM-DDTHH:MM:SS", utan tidszon) för ett tillfälle.
 * 00:00 betyder heldag/okänd tid i resten av systemet.
 *
 * Tidszonen anges explicit: tidigare användes toLocaleDateString('sv-SE') utan
 * timeZone för heldagar, vilket på GitHub Actions (UTC) gjorde att källans
 * lokala midnatt (t.ex. 2026-10-23T22:00Z = 24 okt) sparades som dagen innan.
 *
 * Arrangörer lägger ibland in öppettider i stället för en starttid, t.ex.
 * Friskis "gratis träning under höstlovet" med 04:30-23:00 (källan har
 * startDate 03:30Z/endDate 22:00Z och visitvarberg.se visar själv 04.30).
 * Sådana tillfällen - start före 06:00 och minst 12 timmar långa - sparas
 * som heldag så att vi inte visar en uppenbart missvisande tid som 04:30.
 */
export function resolveLocalDateTime(dateObj: VisitVarbergDate, useDefaultStartTime?: boolean): string {
  const start = toStockholm(dateObj.startDate);
  if (useDefaultStartTime) return `${start.date}T00:00:00`;

  const [hour] = start.time.split(':').map(Number);
  if (hour < 6 && start.time !== '00:00:00' && dateObj.endDate) {
    const durationMs = new Date(dateObj.endDate).getTime() - new Date(dateObj.startDate).getTime();
    if (durationMs >= OPEN_HOURS_MIN_DURATION_MS) return `${start.date}T00:00:00`;
  }
  return `${start.date}T${start.time}`;
}

/** Event per listsida - sajten tål 200 men inte 500; 100 ger marginal */
const LIST_PAGE_SIZE = 100;
const MAX_LIST_PAGES = 10;

export class VisitVarbergScraper extends BaseScraper {
  async scrape(): Promise<ScrapedEvent[]> {
    const events: ScrapedEvent[] = [];
    const seenUrls = new Set<string>();

    try {
      console.log(`🎭 Starting scrape of ${this.config.name}...`);

      // STEG 1-2: Hämta listsidorna och samla alla event-URL:er
      const eventUrls = await this.collectEventUrls();
      for (const url of eventUrls) seenUrls.add(url);

      // STEG 3: Scrapa varje event-sida
      for (const url of eventUrls) {
        try {
          await this.delay(500); // Rate limiting

          const eventList = await this.scrapeEventPage(url);
          
          if (eventList && eventList.length > 0) {
            events.push(...eventList);
            console.log(`  ✓ ${eventList[0].name} (${eventList.length} occasion${eventList.length > 1 ? 's' : ''})`);
          }

        } catch (error) {
          console.error(`  ✗ Failed to scrape ${url}:`, error);
          // Fortsätt med nästa event
        }
      }

      console.log(`🎉 Scraping complete! Found ${events.length} total events (including multiple occasions)`);

    } catch (error) {
      console.error(`Error scraping ${this.config.name}:`, error);
      throw error;
    }

    return events;
  }

  /**
   * Samla alla event-URL:er från listsidan.
   *
   * Sedan 2026-09-21 ger ?limit=500 en tom lista ("Inga evenemang matchade
   * din sökning") - sajten har ett tak någonstans över 200. Vi hämtar därför
   * LIST_PAGE_SIZE i taget med ?page=N, där page är kumulativ (page=1 ger de
   * första 2*limit eventen), tills vi nått totalEvents från sidans initial
   * state eller inga nya länkar dyker upp.
   *
   * Kastar om första sidan inte ger några länkar: det är antingen en
   * block-/felsida med HTTP 200 eller en ändrad sidstruktur, och då ska
   * Firecrawl-fallbacken provas och körningen inte loggas som lyckad.
   */
  protected async collectEventUrls(): Promise<string[]> {
    const base = this.config.url.split('?')[0];
    const urls: string[] = [];
    const seen = new Set<string>();
    let totalEvents: number | null = null;

    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const pageUrl = `${base}?limit=${LIST_PAGE_SIZE}&page=${page}`;
      const html = await this.fetchHTML(pageUrl);
      const $ = cheerio.load(html);

      if (totalEvents === null) {
        const m = html.match(/"totalEvents"\s*:\s*(\d+)/);
        totalEvents = m ? parseInt(m[1], 10) : null;
      }

      let newOnPage = 0;
      $('a[href*="/evenemang/tillfalle"]').each((_, element) => {
        const href = $(element).attr('href');
        if (!href || !href.includes('eventId=')) return;
        const absoluteUrl = href.startsWith('http') ? href : `https://visitvarberg.se${href}`;
        if (seen.has(absoluteUrl)) return;
        seen.add(absoluteUrl);
        urls.push(absoluteUrl);
        newOnPage++;
      });

      console.log(
        `📋 Listsida ${page + 1}: ${newOnPage} nya event-URL:er (totalt ${urls.length}${totalEvents !== null ? ` av ${totalEvents}` : ''})`
      );

      if (page === 0 && urls.length === 0) {
        throw new Error(
          `Inga event-länkar hittades på ${pageUrl} (HTML ${html.length} tecken) - trolig blockering eller ändrad sidstruktur`
        );
      }
      if (newOnPage === 0) break;
      if (totalEvents !== null && urls.length >= totalEvents) break;
      await this.delay(500);
    }

    console.log(`📋 Found ${urls.length} event URLs`);
    return urls;
  }

  /**
   * Scrapa en event-sida och returnera alla occasions som separata events
   */
  protected async scrapeEventPage(url: string): Promise<ScrapedEvent[]> {
    const html = await this.fetchHTML(url);
    const $ = cheerio.load(html);

    // STEG 1: Extrahera JSON-data från AppRegistry.registerInitialState
    // (tilldelning sker i callback - separat variabel så att TS kan narrowa eventData nedan)
    let foundEventData: VisitVarbergEventData | null = null;

    $('script').each((_, scriptTag) => {
      // Skip om vi redan hittat event-data
      if (foundEventData) return;

      const scriptContent = $(scriptTag).html();
      if (!scriptContent || !scriptContent.includes('registerInitialState')) return;

      for (const candidate of extractInitialStates(scriptContent)) {
        const data = pickEventData(candidate);
        if (data) {
          foundEventData = data;
          return;
        }
      }
    });

    const eventData = foundEventData as VisitVarbergEventData | null;

    if (!eventData) {
      console.warn(`No event data found in ${url}`);
      return [];
    }

    // STEG 2: Validera required fields (redan gjort i parsing, men double-check)
    if (!eventData.name || !eventData.dates || eventData.dates.length === 0) {
      return [];
    }

    // STEG 3: Hantera beskrivning (konvertera HTML → Markdown)
    let description: string | undefined;
    if (eventData.description) {
      const cleaned = eventData.description
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<style[^>]*>.*?<\/style>/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      description = this.htmlToMarkdown(cleaned);
    }

    // STEG 4: Extrahera bild-URL
    const image_url = eventData.photos?.[0]?.url;

    // STEG 5: Hantera pris
    // isFree-flaggan sätts av arrangören i Visit Varbergs system - pålitlig källa
    let price: string | undefined;
    let is_free: boolean | null = null;
    if (eventData.isFree) {
      price = 'Gratis';
      is_free = true;
    } else if (eventData.price) {
      // price kan vara ett tal i Visit Varbergs JSON (t.ex. 485)
      price = String(eventData.price);
      is_free = resolveIsFree(eventData.price);
    }

    // STEG 6: Extrahera metadata för arrangörsidentifiering
    const organizerMetadata = {
      venueName: eventData.venue?.trim(),
      phone: eventData.phone,
      email: eventData.email,
      // Nytt format har arrangören i `organization`; annars venue som tidigare
      organizerName: eventData.organization?.trim() || eventData.venue?.trim(),
      organizerWebsite: eventData.website, // Arrangörens hemsida
    };

    // STEG 7: Skapa base event object (gemensam data)
    const baseEventData = {
      name: eventData.name.trim(),
      venue_name: eventData.venue?.trim(),
      location: eventData.address?.trim() || eventData.venue?.trim() || 'Varberg, Sweden',
      description,
      image_url,
      price,
      is_free,
      organizer_event_url: url, // Visit Varberg URL (unik - används för deduplicering)
      event_website: eventData.website, // Arrangörens event-sida (visas för användaren)
      booking_url: eventData.bookingLink, // Länk till biljettsida
      // categories fylls i av AI senare
      // Lägg till metadata för senare användning
      metadata: organizerMetadata,
    };

    // STEG 8: Filtrera dates - ta bort gamla events och begränsa långtidsevent
    const now = new Date();
    const maxDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 dagar framåt

    // Filtrera bort events i det förflutna. Heldagar jämförs på svenskt datum
    // (explicit tidszon - GitHub Actions kör i UTC)
    const today = toStockholm(now.toISOString()).date;
    let datesToUse = eventData.dates.filter(d =>
      eventData.useDefaultStartTime ? toStockholm(d.startDate).date >= today : new Date(d.startDate) >= now
    );
    
    // För långtidsevent, begränsa till nästa 60 dagar
    if (eventData.longTerm && datesToUse.length > 30) {
      const beforeLimit = datesToUse.length;
      datesToUse = datesToUse.filter(d => {
        const startDate = new Date(d.startDate);
        return startDate <= maxDate;
      });

      console.log(`  ⚠️  Long-term event: limited from ${beforeLimit} to ${datesToUse.length} occasions (next 60 days)`);
    }
    
    // Om alla datum var i det förflutna, skippa eventet
    if (datesToUse.length === 0) {
      console.log(`  ⊘ Skipped "${eventData.name}" - all dates in the past`);
      return [];
    }

    // STEG 9: Skapa separata events för varje occasion
    const events: ScrapedEvent[] = [];

    for (const dateObj of datesToUse) {
      // Validera datum
      if (!dateObj.startDate) continue;

      try {
        const date_time = resolveLocalDateTime(dateObj, eventData.useDefaultStartTime);

        events.push({
          ...baseEventData,
          date_time,
        });

      } catch (error) {
        console.warn(`Failed to parse date: ${dateObj.startDate}`, error);
      }
    }

    return events;
  }
}

