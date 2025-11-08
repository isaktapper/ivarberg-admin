import { BaseScraper } from './base-scraper';
import { ScrapedEvent } from './types';
import * as cheerio from 'cheerio';

export class SocietenScraper extends BaseScraper {
  private baseUrl = 'https://societen.se';

  async scrape(): Promise<ScrapedEvent[]> {
    const events: ScrapedEvent[] = [];
    const seenUrls = new Set<string>();

    try {
      console.log(`🎭 Starting scrape of ${this.config.name}...`);

      // STEG 1: Hämta kalendersidan
      const listHtml = await this.fetchHTML(this.config.url);
      const $ = cheerio.load(listHtml);

      // STEG 2: Extrahera alla event-URLs från kalendersidan
      const eventUrls: string[] = [];
      
      // Hitta alla event-länkar med klassen uk-link-toggle som pekar till /event/
      $('a.uk-link-toggle[href*="/event/"]').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
          const absoluteUrl = href.startsWith('http')
            ? href
            : `${this.baseUrl}${href}`;
          
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

          const event = await this.scrapeEventPage(url);
          
          if (event) {
            events.push(event);
            console.log(`  ✓ ${event.name}`);
          }

        } catch (error) {
          console.error(`  ✗ Failed to scrape ${url}:`, error);
          // Fortsätt med nästa event
        }
      }

      console.log(`🎉 Scraping complete! Found ${events.length} events`);

    } catch (error) {
      console.error(`Error scraping ${this.config.name}:`, error);
      throw error;
    }

    return events;
  }

  /**
   * Scrapa en event-sida och returnera event-data
   */
  private async scrapeEventPage(url: string): Promise<ScrapedEvent | null> {
    const html = await this.fetchHTML(url);
    const $ = cheerio.load(html);

    // STEG 1: Extrahera titel
    // Försök först med uk-heading-small, sen fallback till andra h1/h2
    let title = $('h2.uk-heading-small').first().text().trim();
    if (!title) {
      title = $('h1').first().text().trim();
    }
    if (!title) {
      title = $('h2.el-title').first().text().trim();
    }
    
    if (!title) {
      console.warn(`No title found for ${url}`);
      return null;
    }

    // STEG 2: Extrahera datum
    // Leta efter h2 med klassen uk-font-tertiary som innehåller datumet
    let dateText = $('h2.uk-font-tertiary').first().text().trim();
    if (!dateText) {
      // Fallback: leta efter div.el-meta som också kan innehålla datum
      dateText = $('div.el-meta').first().text().trim();
    }

    if (!dateText) {
      console.warn(`No date found for ${url}`);
      return null;
    }

    // Parse datum från format "lördag 15 nov" eller "lördag 15 november"
    const date_time = this.parseSwedishDate(dateText);
    if (!date_time) {
      console.warn(`Could not parse date "${dateText}" for ${url}`);
      return null;
    }

    // STEG 3: Extrahera beskrivning
    // Beskrivningen finns i en specifik uk-panel div efter datumet
    let descriptionHtml = '';
    
    // Försök hitta den specifika panelen med uk-width-xlarge klassen
    // Detta är där event-beskrivningen finns
    let mainContent = $('div.uk-panel.uk-width-xlarge').first();
    
    // Fallback: om inte den finns, ta första uk-panel efter uk-font-tertiary
    if (mainContent.length === 0) {
      mainContent = $('h2.uk-font-tertiary').parent().find('div.uk-panel').first();
    }
    
    // Fallback 2: ta helt enkelt första uk-panel med margin
    if (mainContent.length === 0) {
      mainContent = $('div.uk-panel.uk-margin').first();
    }
    
    if (mainContent.length > 0) {
      descriptionHtml = mainContent.html() || '';
    }
    
    // Ta bort metadata-sektioner om de finns med
    const $desc = cheerio.load(descriptionHtml);
    $desc('.el-meta').remove(); // Ta bort datum-text om den finns i beskrivningen
    descriptionHtml = $desc.html() || '';

    const description = this.htmlToMarkdown(descriptionHtml) || undefined;

    // STEG 4: Extrahera bild
    // Bilder finns i <picture> element, hämta från source eller img
    let image_url: string | undefined;
    
    // Försök få webp från source först (bättre kvalitet)
    const pictureSource = $('picture source[type="image/webp"]').first();
    if (pictureSource.length > 0) {
      const srcset = pictureSource.attr('srcset');
      if (srcset) {
        // srcset kan ha flera storlekar, ta den största
        const sources = srcset.split(',').map(s => s.trim());
        if (sources.length > 0) {
          // Ta sista (oftast största) och extrahera URL
          const lastSource = sources[sources.length - 1];
          const urlMatch = lastSource.match(/^([^\s]+)/);
          if (urlMatch) {
            image_url = urlMatch[1];
          }
        }
      }
    }
    
    // Fallback till img src om webp inte fanns
    if (!image_url) {
      const imgSrc = $('picture img, .el-image').first().attr('src');
      if (imgSrc) {
        image_url = imgSrc;
      }
    }

    // Fixa relativa URLs
    if (image_url && !image_url.startsWith('http')) {
      image_url = `${this.baseUrl}${image_url}`;
    }

    // STEG 5: Extrahera pris (om det finns)
    // Ofta finns pris i beskrivningen, men inte alltid strukturerat
    // Kan vara "från 70 kr", "Gratis", "5000 kr", etc.
    let price: string | undefined;
    const priceMatch = descriptionHtml.match(/(\d+\s*kr|Gratis|FRI ENTRÉ)/i);
    if (priceMatch) {
      price = priceMatch[1];
    }

    // STEG 6: Metadata för arrangörsidentifiering
    const organizerMetadata = {
      venueName: 'Societén',
      organizerName: 'Societén',
      phone: '0340-67 65 00',
      email: 'info@societen.se',
    };

    const event: ScrapedEvent = {
      name: title,
      description,
      date_time,
      location: 'Strandgatan 4 A, 432 21 Varberg',
      venue_name: 'Societén',
      price,
      image_url,
      organizer_event_url: url,
      metadata: organizerMetadata,
    };

    return event;
  }

  /**
   * Parse svenskt datumformat: "lördag 15 nov" eller "lördag 15 november"
   * Returnerar ISO 8601 format
   */
  private parseSwedishDate(dateStr: string): string | null {
    try {
      // Ta bort veckodagen om den finns
      dateStr = dateStr.replace(/^(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)\s+/i, '').trim();

      // Parse format: "15 nov" eller "15 november"
      const parts = dateStr.split(' ');
      if (parts.length < 2) {
        return null;
      }

      const day = parseInt(parts[0]);
      const monthStr = parts[1].toLowerCase();

      if (isNaN(day)) {
        return null;
      }

      // Svenska månader till nummer
      const monthMap: Record<string, number> = {
        'jan': 0, 'januari': 0,
        'feb': 1, 'februari': 1,
        'mar': 2, 'mars': 2,
        'apr': 3, 'april': 3,
        'maj': 4,
        'jun': 5, 'juni': 5,
        'jul': 6, 'juli': 6,
        'aug': 7, 'augusti': 7,
        'sep': 8, 'september': 8,
        'okt': 9, 'oktober': 9,
        'nov': 10, 'november': 10,
        'dec': 11, 'december': 11
      };

      const monthNum = monthMap[monthStr];
      if (monthNum === undefined) {
        console.warn(`Unknown month: ${monthStr}`);
        return null;
      }

      // Anta år baserat på nuvarande datum
      // Om månaden är tidigare än nuvarande månad, anta nästa år
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      
      let year = currentYear;
      
      // Om eventet är i en tidigare månad än nu, anta att det är nästa år
      if (monthNum < currentMonth) {
        year = currentYear + 1;
      } 
      // Om samma månad men tidigare dag, anta nästa år
      else if (monthNum === currentMonth && day < now.getDate()) {
        year = currentYear + 1;
      }

      // Standard tid för club-events är 22:30
      const date = new Date(year, monthNum, day, 22, 30, 0);
      
      // Formatera till ISO 8601 utan timezone (lokal tid)
      const isoStr = date.toISOString();
      // Konvertera till lokalt format: YYYY-MM-DDTHH:mm:ss
      const localStr = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T22:30:00`;
      
      return localStr;

    } catch (error) {
      console.error('Date parsing error:', error);
      return null;
    }
  }
}

