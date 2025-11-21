import { BaseScraper } from './base-scraper';
import { ScrapedEvent } from './types';
import * as cheerio from 'cheerio';

interface VisitVarbergEventData {
  name: string;
  dates: Array<{
    startDate: string; // ISO 8601
    endDate: string;
  }>;
  venue: string;
  address: string;
  description: string;
  photos?: Array<{
    url: string;
    alt?: string;
  }>;
  website?: string;
  bookingLink?: string;
  price?: string;
  email?: string;
  phone?: string;
  isFree?: boolean;
  longTerm?: boolean;
  useDefaultStartTime?: boolean; // True = heldag utan specifik tid
  useDefaultEndTime?: boolean;
  organizer?: string; // Finns ibland i datan
}

export class VisitVarbergScraper extends BaseScraper {
  async scrape(): Promise<ScrapedEvent[]> {
    const events: ScrapedEvent[] = [];
    const seenUrls = new Set<string>();

    try {
      console.log(`🎭 Starting scrape of ${this.config.name}...`);

      // STEG 1: Hämta lista-sidan med alla events
      const listHtml = await this.fetchHTML(this.config.url);
      const $list = cheerio.load(listHtml);

      // STEG 2: Extrahera alla event-URLs från lista-sidan
      const eventUrls: string[] = [];
      
      $list('a[href*="/evenemang/tillfalle"]').each((_, element) => {
        const href = $list(element).attr('href');
        if (href && href.includes('eventId=')) {
          const absoluteUrl = href.startsWith('http')
            ? href
            : `https://visitvarberg.se${href}`;
          
          if (!seenUrls.has(absoluteUrl)) {
            seenUrls.add(absoluteUrl);
            eventUrls.push(absoluteUrl);
          }
        }
      });

      console.log(`📋 Found ${eventUrls.length} event URLs`);

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
   * Scrapa en event-sida och returnera alla occasions som separata events
   */
  private async scrapeEventPage(url: string): Promise<ScrapedEvent[]> {
    const html = await this.fetchHTML(url);
    const $ = cheerio.load(html);

    // STEG 1: Extrahera JSON-data från AppRegistry.registerInitialState
    let eventData: VisitVarbergEventData | null = null;

    $('script').each((_, scriptTag) => {
      // Skip om vi redan hittat event-data
      if (eventData) return;
      
      const scriptContent = $(scriptTag).html();
      if (scriptContent && scriptContent.includes('AppRegistry.registerInitialState')) {
        // Regex för att extrahera JSON-objektet
        const match = scriptContent.match(/registerInitialState\([^,]+,\s*({[\s\S]*?})\);/);
        if (match && match[1]) {
          try {
            const parsed = JSON.parse(match[1]);
            
            // Kontrollera om detta är event-datan (har name och dates)
            if (parsed.name && parsed.dates && Array.isArray(parsed.dates)) {
              eventData = parsed;
            }
          } catch (e) {
            // Tyst skippa fel - detta är förmodligen inte event-datan
          }
        }
      }
    });

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
    let price: string | undefined;
    if (eventData.isFree) {
      price = 'Gratis';
    } else if (eventData.price) {
      price = eventData.price;
    }

    // STEG 6: Extrahera metadata för arrangörsidentifiering
    const organizerMetadata = {
      venueName: eventData.venue?.trim(),
      phone: eventData.phone,
      email: eventData.email,
      organizerName: eventData.venue?.trim(), // Använd venue som arrangörnamn (Visit Varberg använder venue som arrangör)
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

    // Filtrera bort events i det förflutna
    // OBS: Visit Varberg använder UTC, konvertera till lokal tid för jämförelse
    let datesToUse = eventData.dates.filter(d => {
      const startDate = new Date(d.startDate);
      // Sätt tillbaka till midnatt lokal tid om det är en heldag
      const localDate = eventData.useDefaultStartTime
        ? new Date(startDate.toLocaleDateString('sv-SE'))
        : startDate;
      return localDate >= now;
    });
    
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
        // FIX: Konvertera UTC till lokal svensk tid
        const utcDate = new Date(dateObj.startDate);

        let date_time: string;

        if (eventData.useDefaultStartTime) {
          // Heldag-event: Använd lokal svensk tid vid midnatt (00:00)
          // "2025-03-21T23:00:00.000Z" (UTC) → "2025-03-22T00:00:00" (lokal)
          const localDateStr = utcDate.toLocaleDateString('sv-SE'); // "2025-03-22"
          date_time = `${localDateStr}T00:00:00`; // ISO format utan tidszon
        } else {
          // Specifik tid: Konvertera UTC till svensk tid
          // "2025-11-30T09:00:00.000Z" (UTC) → "2025-11-30T10:00:00" (svensk tid)
          const swedishTime = utcDate.toLocaleString('sv-SE', { 
            timeZone: 'Europe/Stockholm',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
          
          // Konvertera "2025-11-30 10:00:00" till "2025-11-30T10:00:00"
          date_time = swedishTime.replace(' ', 'T');
        }

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

