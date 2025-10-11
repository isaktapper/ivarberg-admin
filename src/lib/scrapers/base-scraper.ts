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
      const cleaned = html
        .replace(/\s+/g, ' ')
        .replace(/<p>\s*<\/p>/g, '')
        .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '\n\n')
        .trim();
      
      const markdown = this.turndownService.turndown(cleaned);
      
      // Post-processing: Ta bort överflödiga newlines
      return markdown
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } catch (error) {
      console.error('Fel vid konvertering till Markdown:', error);
      return html.replace(/<[^>]*>/g, ''); // Fallback: Strip HTML
    }
  }
}
