import { ScrapedEvent, ScraperConfig } from './types';
import TurndownService from 'turndown';

export abstract class BaseScraper {
  protected turndownService: TurndownService;

  constructor(protected config: ScraperConfig) {
    // Initiera Turndown med bra settings
    this.turndownService = new TurndownService({
      headingStyle: 'atx',           // # Headers istället för underlines
      bulletListMarker: '-',         // Använd - för bullets
      codeBlockStyle: 'fenced',      // ``` för kodblock
      emDelimiter: '_',              // _italic_ istället för *italic*
      strongDelimiter: '**',         // **bold**
    });

    // Ta bort onödiga element
    this.turndownService.remove(['script', 'style', 'iframe']);
  }
  
  // Public getter för att komma åt config från externa scripts
  public getConfig(): ScraperConfig {
    return this.config;
  }
  
  abstract scrape(): Promise<ScrapedEvent[]>;
  
  protected async fetchHTML(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; iVarberg-EventBot/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.text();
  }
  
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Hjälpmetod för att konvertera HTML till Markdown
  protected htmlToMarkdown(html: string | null | undefined): string {
    if (!html) return '';
    
    // Om det inte finns HTML-taggar, returnera som det är
    if (!html.includes('<')) {
      return html.trim();
    }
    
    try {
      // Rensa bort extra whitespace och tomma taggar
      let cleaned = html
        .replace(/\s+/g, ' ')
        .replace(/<p>\s*<\/p>/g, '')
        .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '\n\n')
        .trim();

      // Ta bort base64-bilder och konstiga länkar
      cleaned = cleaned
        .replace(/\[!\[\]\(data:image\/[^)]+\)\]\([^)]+\)/g, '') // Ta bort [![](data:image/...)](link)
        .replace(/\[!\[\]\([^)]*\)\]\([^)]+\)/g, '') // Ta bort andra [![](...)](link) format
        .replace(/!\[\]\(data:image\/[^)]+\)/g, '') // Ta bort tomma base64-bilder
        .replace(/!\[\]\([^)]*\)/g, '') // Ta bort andra tomma bilder
        .trim();

      // Hantera "Läs mer" länkar - konvertera till länkad text
      cleaned = cleaned
        .replace(/Läs mer\s*<a[^>]+href="([^"]+)"[^>]*>/gi, '[Läs mer]($1)')
        .replace(/Läs mer\s*<a[^>]+href='([^']+)'[^>]*>/gi, "[Läs mer]($1)")
        .replace(/<a[^>]+href="([^"]+)"[^>]*>\s*Läs mer\s*<\/a>/gi, '[Läs mer]($1)')
        .replace(/<a[^>]+href='([^']+)'[^>]*>\s*Läs mer\s*<\/a>/gi, "[Läs mer]($1)");
      
      const markdown = this.turndownService.turndown(cleaned);
      
      // Post-processing: Ta bort överflödiga newlines och rensa upp
      return markdown
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\s*\[!\[\]\([^)]*\)\]\([^)]*\)\s*$/gm, '') // Ta bort kvarvarande bilder på egna rader
        .replace(/^\s*!\[\]\([^)]*\)\s*$/gm, '') // Ta bort tomma bilder på egna rader
        .replace(/\n\s*\n\s*\n/g, '\n\n') // Ta bort för många tomma rader
        .trim();
    } catch (error) {
      console.error('Fel vid konvertering till Markdown:', error);
      return html.replace(/<[^>]*>/g, ''); // Fallback: Strip HTML
    }
  }
}
