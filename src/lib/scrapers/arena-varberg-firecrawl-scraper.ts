/**
 * Firecrawl-variant av Arena Varberg-scrapern. Används som fallback när
 * ordinarie scrapern blockeras (arenavarberg.se svarar HTTP 415 till vissa
 * GitHub Actions IP:n). All parsning återanvänds från ArenaVarbergScraper.
 * Detaljsidor hämtas bara för events som inte redan finns i databasen.
 */
import * as cheerio from 'cheerio';
import { ArenaVarbergScraper } from './arena-varberg-scraper';
import { ScrapedEvent, ScraperConfig } from './types';
import { fcFetchHTML } from './firecrawl-fetcher';
import { FirecrawlScraperOptions } from './visit-varberg-firecrawl-scraper';

export class ArenaVarbergFirecrawlScraper extends ArenaVarbergScraper {
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

    console.log(`🔥 [Firecrawl] Starting scrape of ${this.config.name}...`);

    const calendarHtml = await this.fetchHTML(this.config.url);
    const $calendar = cheerio.load(calendarHtml);

    // Samma selektor som originalet
    const eventUrls: string[] = [];
    $calendar('.mec-masonry-item-wrap .mec-event-title a').each((_, element) => {
      const url = $calendar(element).attr('href');
      if (url) eventUrls.push(url);
    });

    const newUrls = eventUrls.filter(url => !this.knownUrls.has(url));
    this.skippedKnown = eventUrls.length - newUrls.length;
    console.log(`📋 Found ${eventUrls.length} event URLs (${this.skippedKnown} redan i databasen, ${newUrls.length} nya)`);

    for (const url of newUrls.slice(0, this.maxDetailPages)) {
      try {
        const event = await this.scrapeEventPage(url);
        if (event) {
          events.push(event);
          console.log(`  ✓ ${event.name}`);
        }
      } catch (error) {
        console.error(`  ✗ Failed to scrape ${url}:`, error);
      }
    }

    console.log(`🎉 [Firecrawl] Scraping complete! Found ${events.length} events`);
    return events;
  }
}
