import { BaseScraper } from './base-scraper';
import { ScrapedEvent } from './types';
import * as cheerio from 'cheerio';

/**
 * Scraper för Varbergs BoIS biljettsida (AXS/ebiljett.nu).
 *
 * Sidan https://varbergsbois.ebiljett.nu/List/Events listar alla kommande
 * matcher i en och samma vy - ingen detaljsida behöver hämtas. Varje rad
 * innehåller <time datetime="...">, arena, matchnamn i <h2> och en
 * "Köp biljett"-länk till /Tickets/Select/<id> som är unik per match.
 *
 * OBS: Sajten ligger bakom Cloudflare/AXS bot-skydd som blockerar direkta
 * anrop. Denna scraper kastar då fel så att FallbackScraper kör
 * Firecrawl-varianten istället (1 credit per körning - en enda sida).
 */
export class VarbergsBoisScraper extends BaseScraper {
  protected baseUrl = 'https://varbergsbois.ebiljett.nu';

  async scrape(): Promise<ScrapedEvent[]> {
    console.log(`⚽ Starting scrape of ${this.config.name}...`);

    const html = await this.fetchHTML(this.config.url);
    const events = this.parseEventList(html);

    console.log(`🎉 Scraping complete! Found ${events.length} events`);
    return events;
  }

  /**
   * Parsa eventlistan ur sidans HTML. Delas med Firecrawl-varianten.
   */
  protected parseEventList(html: string): ScrapedEvent[] {
    const $ = cheerio.load(html);

    // Bot-skyddssidan ("AXS Access Info") saknar fixtures-sektionen helt.
    // Skilj på "blockerad" (kasta -> Firecrawl-fallback) och "inga matcher
    // just nu" (tom lista är korrekt, t.ex. under vintern).
    if ($('section.fixtures, .fixtures').length === 0) {
      throw new Error('Fixtures-sektionen saknas - troligen blockerad av bot-skydd');
    }

    const events: ScrapedEvent[] = [];
    const seenUrls = new Set<string>();

    // Varje matchrad (och featured-kortet på startsidan) har en köplänk.
    // Deduplicera på biljett-URL:en eftersom featured-kortet är en dubblett.
    $('a[href*="/Tickets/Select/"]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;

      const ticketUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
      if (seenUrls.has(ticketUrl)) return;

      // Hitta radens container: närmaste förälder som innehåller både
      // titel (h2) och datum (time[datetime])
      const container = $(element)
        .parents()
        .filter((_, parent) => {
          const $parent = $(parent);
          return $parent.find('h2').length > 0 && $parent.find('time[datetime]').length > 0;
        })
        .first();

      if (container.length === 0) return;

      const name = container.find('h2').first().text().trim();
      const dateTime = container.find('time[datetime]').first().attr('datetime');
      if (!name || !dateTime) return;

      seenUrls.add(ticketUrl);

      // Arenan står efter datumet i samma <span>: "<time>...</time>, Påskbergsvallen"
      let venueName: string | undefined;
      const timeSpanText = container.find('time[datetime]').first().parent().text();
      const venueMatch = timeSpanText.split(',').slice(1).join(',').trim();
      if (venueMatch) {
        venueName = venueMatch;
      }

      const imgSrc = container.find('img').first().attr('src');
      const image_url = imgSrc
        ? (imgSrc.startsWith('http') ? imgSrc : `${this.baseUrl}${imgSrc}`)
        : undefined;

      // Sidan har inga beskrivningar - generera en enkel text så att
      // kvalitetspoängen räcker för auto-publicering.
      // aria-label på <time> har datumet färdigformaterat på svenska.
      const dateLabel = container.find('time[datetime]').first().attr('aria-label')?.trim();
      const description = this.buildDescription(name, venueName || 'Påskbergsvallen', dateLabel);

      events.push({
        name,
        description,
        date_time: dateTime, // Redan lokal ISO 8601 utan tidszon, t.ex. "2026-08-01T15:00:00"
        location: venueName ? `${venueName}, Varberg` : 'Påskbergsvallen, Varberg',
        venue_name: venueName || 'Påskbergsvallen',
        image_url,
        organizer_event_url: ticketUrl,
        booking_url: ticketUrl,
        categories: ['Sport'],
        metadata: {
          venueName: venueName || 'Påskbergsvallen',
          organizerName: 'Varbergs BoIS',
        },
      });

      console.log(`  ✓ ${name}`);
    });

    return events;
  }

  /**
   * Generera en enkel matchbeskrivning, t.ex.
   * "Varbergs BoIS tar emot Falkenbergs FF på Påskbergsvallen.
   *  Avspark lördag 1 augusti 2026 kl. 15:00."
   */
  protected buildDescription(name: string, venueName: string, dateLabel?: string): string {
    // Matchnamn ser ut som "Omg.17 Varbergs BoIS - Falkenbergs FF"
    const match = name.match(/Varbergs BoIS\s*-\s*(.+)$/i);
    const intro = match
      ? `Varbergs BoIS tar emot ${match[1].trim()} på ${venueName}.`
      : `${name} på ${venueName}.`;

    const kickoff = dateLabel ? ` Avspark ${dateLabel}.` : '';

    return `${intro}${kickoff} Fotboll på plats i Varberg - säkra din biljett och heja fram BoIS!`;
  }
}
