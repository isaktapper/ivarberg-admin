/**
 * Kör ordinarie scraper först. Om den kastar fel (t.ex. ETIMEDOUT när
 * varberg.se/visitvarberg.se blockerar GitHub Actions IP - händer intermittent)
 * körs Firecrawl-varianten istället.
 *
 * Ordinarie scrapern är gratis och försöks alltid först; Firecrawl förbrukar
 * bara credits de dagar blockeringen slår till.
 */
import { BaseScraper } from './base-scraper';
import { ScrapedEvent, ScraperConfig } from './types';

export class FallbackScraper extends BaseScraper {
  constructor(
    config: ScraperConfig,
    private primary: BaseScraper,
    /** Skapas lazy - knownUrls ska bara läsas från databasen om fallbacken behövs */
    private createFallback: () => Promise<BaseScraper>
  ) {
    super(config);
  }

  async scrape(): Promise<ScrapedEvent[]> {
    try {
      return await this.primary.scrape();
    } catch (primaryError) {
      const msg = primaryError instanceof Error ? primaryError.message : String(primaryError);

      if (!process.env.FIRECRAWL_API_KEY) {
        console.warn(`⚠️ ${this.config.name}: ordinarie scraper misslyckades och FIRECRAWL_API_KEY saknas - ingen fallback möjlig`);
        throw primaryError;
      }

      console.warn(`⚠️ ${this.config.name}: ordinarie scraper misslyckades (${msg})`);
      console.log(`🔥 ${this.config.name}: försöker igen via Firecrawl-fallback...`);

      try {
        const fallback = await this.createFallback();
        const events = await fallback.scrape();
        console.log(`✅ ${this.config.name}: Firecrawl-fallback lyckades (${events.length} events)`);
        return events;
      } catch (fallbackError) {
        console.error(`❌ ${this.config.name}: även Firecrawl-fallback misslyckades:`, fallbackError);
        // Kasta ursprungsfelet - det är grundorsaken och det som ska synas i loggar/alerts
        throw primaryError;
      }
    }
  }
}
