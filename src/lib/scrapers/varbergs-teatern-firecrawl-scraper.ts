/**
 * Firecrawl-variant av Varbergs Teater-scrapern - TESTVERSION, används inte av
 * det ordinarie scrape-flödet (scraper-registry pekar fortfarande på originalet).
 *
 * Skillnader mot originalet:
 * 1. Kalender-API:et (POST med JSON-body) anropas via Firecrawls webbläsare med
 *    en executeJavascript-action - anropet görs same-origin från kalendersidan
 *    på Firecrawls IP (varberg.se blockerar GitHub Actions IP:n)
 * 2. Detaljsidor hämtas via Firecrawl, och BARA för events vars URL inte redan
 *    finns i databasen (knownUrls)
 *
 * All parsning återanvänds från VarbergsTeaternScraper
 * (fetchPage-svaret har samma format, scrapeEventDetails är oförändrad).
 */
import { VarbergsTeaternScraper, VarbergTeaternAPIResponse } from './varbergs-teatern-scraper';
import { ScrapedEvent, ScraperConfig } from './types';
import { fcFetchHTML, fcPostForText } from './firecrawl-fetcher';
import { FirecrawlScraperOptions } from './visit-varberg-firecrawl-scraper';

export class VarbergsTeaternFirecrawlScraper extends VarbergsTeaternScraper {
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

  protected async fetchPage(page: number): Promise<VarbergTeaternAPIResponse> {
    const text = await fcPostForText(
      'https://varberg.se/kulturhuset-komedianten/kalender',
      this.apiUrl,
      {
        filterPlaceText: 'Plats',
        hitsPerPage: 12,
        eventType: 'event',
        listType: 'filter',
        selectedEndDate: 'allDate',
        selectedPlace: 'allPlaces',
        selectedStartDate: 'allDate',
        searchWord: '*',
        page: page,
      }
    );

    if (!text.trim().startsWith('{')) {
      console.error('API returnerade inte JSON. Första 200 tecken:', text.substring(0, 200));
      throw new Error('API returnerade inte JSON-data');
    }

    return JSON.parse(text);
  }

  async scrape(): Promise<ScrapedEvent[]> {
    const allEvents: ScrapedEvent[] = [];
    const seenUrls = new Set<string>();
    let detailPagesFetched = 0;

    console.log('🔥 [Firecrawl] Startar scraping av Varbergs Teater via API...');

    // Hämta första sidan för att få totalt antal events (1 credit)
    const firstPageData = await this.fetchPage(0);
    const totalEvents = firstPageData.hits;
    const totalPages = Math.ceil(totalEvents / firstPageData.hitsPerPage);

    console.log(`📊 Totalt ${totalEvents} events på ${totalPages} sidor`);

    for (let page = 0; page < totalPages; page++) {
      try {
        // Återanvänd första sidans data istället för att hämta om den
        const pageData = page === 0 ? firstPageData : await this.fetchPage(page);
        console.log(`\n📋 Sida ${page + 1}/${totalPages}: ${pageData.events.length} events`);

        for (const eventPreview of pageData.events) {
          const eventUrl = this.baseUrl + eventPreview.link;

          if (seenUrls.has(eventUrl)) continue;
          seenUrls.add(eventUrl);

          // Hoppa över events som redan finns i databasen - ingen detaljsida hämtas
          if (this.knownUrls.has(eventUrl)) {
            this.skippedKnown++;
            continue;
          }

          if (detailPagesFetched >= this.maxDetailPages) {
            continue;
          }

          try {
            detailPagesFetched++;
            const event = await this.scrapeEventDetails(eventUrl, eventPreview);
            if (event) {
              allEvents.push(event);
              console.log(`  ✓ ${event.name}`);
            }
          } catch (error) {
            console.error(`  ✗ Misslyckades: ${eventPreview.title}`, error);
          }
        }
      } catch (error) {
        console.error(`❌ Fel vid hämtning av sida ${page + 1}:`, error);
      }
    }

    console.log(`\n🎉 [Firecrawl] Scraping klar! ${allEvents.length} nya events (${this.skippedKnown} hoppades över som redan kända)`);
    return allEvents;
  }
}
