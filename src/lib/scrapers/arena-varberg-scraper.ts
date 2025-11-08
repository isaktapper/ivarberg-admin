import { BaseScraper } from './base-scraper';
import { ScrapedEvent } from './types';
import * as cheerio from 'cheerio';

// Mapping för Arena Varbergs olika lokaler
interface VenueMapping {
  venue_name: string;
  location: string;
}

const ARENA_VARBERG_VENUES: Record<string, VenueMapping> = {
  'SPARBANKSHALLEN': {
    venue_name: 'Sparbankshallen Varberg',
    location: 'Kattegattsvägen 26, 432 50 Varberg, Sweden'
  },
  'ROUTUNDAN': {
    venue_name: 'Rotundan',
    location: 'Kattegattsvägen 26, 432 50 Varberg, Sweden'
  },
  'ROTUNDAN': { // Alternativ stavning
    venue_name: 'Rotundan',
    location: 'Kattegattsvägen 26, 432 50 Varberg, Sweden'
  },
  'ARENA VARBERG': {
    venue_name: 'Arena Varberg',
    location: 'Kattegattsvägen 26, 432 50 Varberg, Sweden'
  },
  'NÖJESHALLEN': {
    venue_name: 'Nöjeshallen',
    location: 'Kattegattsvägen 26, 432 50 Varberg, Sweden'
  }
};

const DEFAULT_ARENA_VARBERG: VenueMapping = {
  venue_name: 'Arena Varberg',
  location: 'Kattegattsvägen 26, 432 50 Varberg, Sweden'
};

export class ArenaVarbergScraper extends BaseScraper {
  async scrape(): Promise<ScrapedEvent[]> {
    const events: ScrapedEvent[] = [];
    
    try {
      // Steg 1: Hämta kalendersidan för att hitta alla event-länkar
      const calendarHtml = await this.fetchHTML(this.config.url);
      const $calendar = cheerio.load(calendarHtml);
      
      const eventUrls: string[] = [];
      
      // Hitta alla event-länkar
      $calendar('.mec-masonry-item-wrap .mec-event-title a').each((_, element) => {
        const url = $calendar(element).attr('href');
        if (url) {
          eventUrls.push(url);
        }
      });
      
      console.log(`Found ${eventUrls.length} event URLs to scrape`);
      
      // Steg 2: Besök varje event-sida och scrapa detaljerad information
      for (const eventUrl of eventUrls) {
        try {
          // Vänta lite mellan requests för att inte överbelasta servern
          await this.delay(500);
          
          const event = await this.scrapeEventPage(eventUrl);
          if (event) {
            events.push(event);
          }
          
        } catch (err) {
          console.error(`Error scraping event ${eventUrl}:`, err);
        }
      }
      
    } catch (error) {
      console.error(`Error scraping ${this.config.name}:`, error);
      throw error;
    }
    
    return events;
  }
  
  private async scrapeEventPage(url: string): Promise<ScrapedEvent | null> {
    try {
      const html = await this.fetchHTML(url);
      const $ = cheerio.load(html);
      
      // Titel (REQUIRED) - Konvertera från CAPS till Title Case
      let name = $('.mec-single-title').text().trim();
      if (!name) return null;
      
      // Konvertera ALL CAPS till Title Case
      name = this.toTitleCase(name);
      
      // Datum (REQUIRED) - Nu med fullständigt datum inkl. år
      const dateLabel = $('.mec-single-event-date .mec-start-date-label').text().trim();
      if (!dateLabel) return null;
      
      // Parse datum format: "28 feb 2026"
      const date_time = this.parseFullDate(dateLabel);
      if (!date_time) return null;
      
      // Tid - extrahera starttid
      const timeStr = $('.mec-single-event-time abbr').text().trim();
      const finalDateTime = this.addTimeToDate(date_time, timeStr);
      
      // Plats (REQUIRED) - Med mapping
      let rawVenueName = $('.mec-single-event-location h6').text().trim();
      if (!rawVenueName) {
        rawVenueName = $('.mec-single-event-location .author').text().trim();
      }
      
      // Mappa till korrekt platsnamn och adress
      const venueInfo = this.mapVenue(rawVenueName);
      const venue_name = venueInfo.venue_name;
      const location = venueInfo.location;
      
      // Beskrivning - Hämta som HTML och konvertera till Markdown
      const descriptionHtml = $('.mec-single-event-description').html();
      const description = this.htmlToMarkdown(descriptionHtml) || undefined;
      
      // Bild - hämta från event page för bättre kvalitet
      // Prioritera data-attribut för att undvika lazy-loading placeholders
      const $img = $('.mec-events-event-image img');
      let image_url = $img.attr('data-lazyloaded') || 
                     $img.attr('data-src') ||
                     $img.attr('data-lazy-src') ||
                     $img.attr('src');
      
      // Validera och filtrera bort ogiltiga bilder
      if (image_url) {
        // Filtrera bort base64-encoded placeholders
        if (image_url.includes('base64')) {
          image_url = undefined;
        }
        // Filtrera bort väldigt korta eller konstiga värden (t.ex. "1")
        else if (image_url.length < 10 || !image_url.includes('.')) {
          console.warn(`Invalid image URL for ${name}: "${image_url}"`);
          image_url = undefined;
        }
        // Fixa relativa URLs (måste börja med / för att vara valid)
        else if (!image_url.startsWith('http')) {
          if (image_url.startsWith('/')) {
            image_url = `https://arenavarberg.se${image_url}`;
          } else {
            console.warn(`Invalid relative URL for ${name}: "${image_url}"`);
            image_url = undefined;
          }
        }
      }
      
      // Varna om vi inte kunde hitta en riktig bild
      if (!image_url) {
        console.warn(`Could not find valid image for event: ${name}`);
      }
      
      // Pris - Nu kan vi faktiskt hämta detta!
      const price = $('.mec-event-cost .mec-events-event-cost').text().trim() || undefined;
      
      // Tags/labels
      const tags: string[] = [];
      $('.mec-event-label-captions').each((_, el) => {
        const tag = $(el).text().trim();
        if (tag) tags.push(tag);
      });
      
      const event: ScrapedEvent = {
        name,
        date_time: finalDateTime,
        location,
        venue_name: venue_name || undefined,
        description,
        image_url,
        organizer_event_url: url,
        price,
        // categories fylls i av AI senare
        tags: tags.length > 0 ? tags : undefined
      };
      
      return event;
      
    } catch (err) {
      console.error(`Error parsing event page ${url}:`, err);
      return null;
    }
  }
  
  private parseFullDate(dateStr: string): string | null {
    try {
      // Parse format: "28 feb 2026" eller "28 februari 2026"
      const parts = dateStr.split(' ');
      if (parts.length < 3) return null;
      
      const day = parseInt(parts[0]);
      const monthStr = parts[1].toLowerCase();
      const year = parseInt(parts[2]);
      
      if (isNaN(day) || isNaN(year)) return null;
      
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
      if (monthNum === undefined) return null;
      
      const date = new Date(year, monthNum, day, 0, 0, 0);
      return date.toISOString();
      
    } catch (err) {
      console.error('Date parsing error:', err);
      return null;
    }
  }
  
  private addTimeToDate(dateIsoString: string, timeStr: string): string {
    try {
      const date = new Date(dateIsoString);
      
      if (timeStr) {
        // Extrahera starttid från format "20:00 - 21:15" eller "18:00"
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          date.setHours(hours, minutes, 0, 0);
        }
      }
      
      return date.toISOString();
      
    } catch (err) {
      console.error('Time parsing error:', err);
      return dateIsoString;
    }
  }
  
  private mapVenue(rawVenueName: string): VenueMapping {
    // Normalisera venue name (trim, uppercase för matching)
    const normalized = rawVenueName.trim().toUpperCase();
    
    // Kolla om vi har en exakt match
    if (ARENA_VARBERG_VENUES[normalized]) {
      return ARENA_VARBERG_VENUES[normalized];
    }
    
    // Kolla om venue name innehåller någon av nycklarna
    for (const [key, value] of Object.entries(ARENA_VARBERG_VENUES)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return value;
      }
    }
    
    // Fallback till default Arena Varberg
    console.log(`Unknown venue: "${rawVenueName}", using default Arena Varberg`);
    return DEFAULT_ARENA_VARBERG;
  }

  /**
   * Konvertera ALL CAPS text till Title Case
   * Hanterar specialfall som "med", "och", "till" etc.
   */
  private toTitleCase(text: string): string {
    // Ord som ska vara lowercase (utom i början av mening)
    const lowerCaseWords = new Set(['och', 'i', 'på', 'till', 'med', 'för', 'av', 'ett', 'en', 'den', 'det', 'som', 'att', 'från']);
    
    return text
      .toLowerCase()
      .split(' ')
      .map((word, index) => {
        // Första ordet ska alltid börja med stor bokstav
        if (index === 0) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        
        // Ord efter bindestreck ska ha stor bokstav
        if (word.includes('-')) {
          return word.split('-')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('-');
        }
        
        // Små ord förblir lowercase (om de inte är första ordet)
        if (lowerCaseWords.has(word.toLowerCase())) {
          return word.toLowerCase();
        }
        
        // Övriga ord får stor bokstav
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }
}
