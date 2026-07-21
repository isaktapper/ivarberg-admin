/**
 * Firecrawl-variant av Varbergs BoIS-scrapern. Sajten (AXS/ebiljett.nu)
 * ligger bakom Cloudflare-bot-skydd som blockerar direkta anrop, så i
 * praktiken är det alltid denna variant som kör. All parsning återanvänds
 * från VarbergsBoisScraper. Bara en sida hämtas (1 credit per körning).
 */
import { VarbergsBoisScraper } from './varbergs-bois-scraper';
import { fcFetchHTML } from './firecrawl-fetcher';

export class VarbergsBoisFirecrawlScraper extends VarbergsBoisScraper {
  protected async fetchHTML(url: string): Promise<string> {
    console.log(`🔥 [Firecrawl] Hämtar ${url}...`);
    return fcFetchHTML(url);
  }
}
