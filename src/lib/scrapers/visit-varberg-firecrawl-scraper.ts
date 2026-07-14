/**
 * Firecrawl-variant av Visit Varberg-scrapern - TESTVERSION, används inte av
 * det ordinarie scrape-flödet (scraper-registry pekar fortfarande på originalet).
 *
 * Skillnader mot originalet:
 * 1. All sidhämtning går via Firecrawl (visitvarberg.se blockerar GitHub Actions IP:n)
 * 2. Detaljsidor hämtas BARA för events vars URL inte redan finns i databasen
 *    (knownUrls) - det är det som gör att Firecrawls gratisplan räcker.
 *
 * All parsning återanvänds från VisitVarbergScraper (scrapeEventPage).
 */
import * as cheerio from 'cheerio';
import { VisitVarbergScraper } from './visit-varberg-scraper';
import { ScrapedEvent, ScraperConfig } from './types';
import { fcFetchHTML } from './firecrawl-fetcher';

export interface FirecrawlScraperOptions {
  /** organizer_event_url:er som redan finns i databasen - hoppas över */
  knownUrls?: Set<string>;
  /** Max antal detaljsidor att hämta (skydd mot credit-rusning vid test) */
  maxDetailPages?: number;
}

export class VisitVarbergFirecrawlScraper extends VisitVarbergScraper {
  private knownUrls: Set<string>;
  private maxDetailPages: number;
  public skippedKnown = 0;

  constructor(config: ScraperConfig, options: FirecrawlScraperOptions = {}) {
    super(config);
    this.knownUrls = options.knownUrls ?? new Set();
    this.maxDetailPages = options.maxDetailPages ?? Infinity;
  }

  protected async fetchHTML(url: string): Promise<string> {
    return fcFetchHTML(url);
  }

  async scrape(): Promise<ScrapedEvent[]> {
    const events: ScrapedEvent[] = [];
    const seenUrls = new Set<string>();

    console.log(`🔥 [Firecrawl] Starting scrape of ${this.config.name}...`);

    // STEG 1: Hämta lista-sidan (1 Firecrawl-credit)
    const listHtml = await this.fetchHTML(this.config.url);
    const $list = cheerio.load(listHtml);

    // STEG 2: Extrahera event-URLs (samma selektor som originalet)
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

    // STEG 3: Filtrera bort events som redan finns i databasen
    const newUrls = eventUrls.filter(url => !this.knownUrls.has(url));
    this.skippedKnown = eventUrls.length - newUrls.length;

    console.log(`📋 Found ${eventUrls.length} event URLs (${this.skippedKnown} redan i databasen, ${newUrls.length} nya)`);

    // STEG 4: Hämta detaljsidor för nya events (1 credit styck)
    const urlsToFetch = newUrls.slice(0, this.maxDetailPages);
    if (urlsToFetch.length < newUrls.length) {
      console.log(`  ⚠️ Begränsar till ${urlsToFetch.length} detaljsidor (maxDetailPages=${this.maxDetailPages})`);
    }

    for (const url of urlsToFetch) {
      try {
        const eventList = await this.scrapeEventPage(url);
        if (eventList && eventList.length > 0) {
          events.push(...eventList);
          console.log(`  ✓ ${eventList[0].name} (${eventList.length} occasion${eventList.length > 1 ? 's' : ''})`);
        }
      } catch (error) {
        console.error(`  ✗ Failed to scrape ${url}:`, error);
      }
    }

    console.log(`🎉 [Firecrawl] Scraping complete! Found ${events.length} total events (including multiple occasions)`);
    return events;
  }
}
