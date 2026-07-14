/**
 * Firecrawl-variant av Societén-scrapern. Används som fallback när
 * ordinarie scrapern blockeras (societen.se svarar HTTP 415 till vissa
 * GitHub Actions IP:n). All parsning återanvänds från SocietenScraper.
 * Detaljsidor hämtas bara för events som inte redan finns i databasen.
 */
import * as cheerio from 'cheerio';
import { SocietenScraper } from './societen-scraper';
import { ScrapedEvent, ScraperConfig } from './types';
import { fcFetchHTML } from './firecrawl-fetcher';
import { FirecrawlScraperOptions } from './visit-varberg-firecrawl-scraper';

export class SocietenFirecrawlScraper extends SocietenScraper {
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

    const listHtml = await this.fetchHTML(this.config.url);
    const $ = cheerio.load(listHtml);

    // Samma selektor som originalet
    const eventUrls: string[] = [];
    $('a.uk-link-toggle[href*="/event/"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const absoluteUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
        if (!seenUrls.has(absoluteUrl)) {
          seenUrls.add(absoluteUrl);
          eventUrls.push(absoluteUrl);
        }
      }
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
