import { BaseScraper } from './base-scraper';
import { ScrapedEvent } from './types';
import * as cheerio from 'cheerio';

interface VarbergTeaternAPIResponse {
  page: number;
  hits: number;
  hitsPerPage: number;
  events: Array<{
    title: string;
    link: string;
    time: string;
    place: string;
    desc: string;
    eventDate: {
      day: string;
      month: string;
    };
    image: string;
  }>;
}

export class VarbergsTeaternScraper extends BaseScraper {
  private baseUrl = 'https://varberg.se';
  private apiUrl = 'https://varberg.se/kulturhuset-komedianten/kalender?sv.target=12.2b514d9b18a92e6fafcf397&sv.12.2b514d9b18a92e6fafcf397.route=/filter';

  async scrape(): Promise<ScrapedEvent[]> {
    const allEvents: ScrapedEvent[] = [];
    const seenUrls = new Set<string>();

    console.log('🎭 Startar scraping av Varbergs Teater via API...');

    try {
      // Hämta första sidan för att få totalt antal events
      const firstPageData = await this.fetchPage(0);
      const totalEvents = firstPageData.hits;
      const eventsPerPage = firstPageData.hitsPerPage;
      const totalPages = Math.ceil(totalEvents / eventsPerPage);

      console.log(`📊 Totalt ${totalEvents} events på ${totalPages} sidor`);

      // Loop genom alla sidor
      for (let page = 0; page < totalPages; page++) {
        console.log(`\n📋 Hämtar sida ${page + 1}/${totalPages}...`);

        try {
          const pageData = await this.fetchPage(page);
          console.log(`📝 Hittade ${pageData.events.length} events på sida ${page + 1}`);

          // Process varje event från API
          for (const eventPreview of pageData.events) {
            const eventUrl = this.baseUrl + eventPreview.link;

            // Skippa dubbletter
            if (seenUrls.has(eventUrl)) {
              continue;
            }
            seenUrls.add(eventUrl);

            try {
              // Scrapa detaljsidan för fullständig info
              const event = await this.scrapeEventDetails(eventUrl, eventPreview);

              if (event) {
                allEvents.push(event);
                console.log(`  ✓ ${event.name}`);
              }
            } catch (error) {
              console.error(`  ✗ Misslyckades: ${eventPreview.title}`, error);
            }

            // Rate limiting
            await this.delay(500);
          }

          // Vänta lite mellan sidor
          await this.delay(1000);

        } catch (error) {
          console.error(`❌ Fel vid hämtning av sida ${page + 1}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Fel vid API-scraping:', error);
      throw error;
    }

    console.log(`\n🎉 Scraping klar! Hittade ${allEvents.length} unika events totalt`);
    return allEvents;
  }

  private async fetchPage(page: number): Promise<VarbergTeaternAPIResponse> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest', // Viktigt för att servern ska returnera JSON
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Origin': 'https://varberg.se',
        'Referer': 'https://varberg.se/kulturhuset-komedianten/kalender'
      },
      body: JSON.stringify({
        filterPlaceText: 'Plats',
        hitsPerPage: 12,
        eventType: 'event',
        listType: 'filter',
        selectedEndDate: 'allDate',
        selectedPlace: 'allPlaces',
        selectedStartDate: 'allDate',
        searchWord: '*',
        page: page
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    
    // Debug: logga första 200 tecken om det inte är JSON
    if (!text.trim().startsWith('{')) {
      console.error('API returnerade inte JSON. Första 200 tecken:', text.substring(0, 200));
      throw new Error('API returnerade inte JSON-data');
    }

    return JSON.parse(text);
  }

  private async scrapeEventDetails(
    url: string,
    previewData: VarbergTeaternAPIResponse['events'][0]
  ): Promise<ScrapedEvent | null> {
    try {
      const html = await this.fetchHTML(url);
      const $ = cheerio.load(html);

      // Extrahera fullständig data
      let title = $('h1.heading').text().trim() || previewData.title;
      if (!title) return null;
      
      // Ta bort datumsuffix " - DD/MM" från titeln
      title = title.replace(/\s*-\s*\d{1,2}\/\d{1,2}$/, '').trim();

      // Ingress - Hämta som HTML
      const ingressHtml = $('p.subheading').first().html();

      // Beskrivning - tredje text-portlet innehåller oftast huvudtexten
      let descriptionHtml = '';
      const textPortlets = $('.sv-text-portlet-content');
      if (textPortlets.length >= 3) {
        descriptionHtml = textPortlets.eq(2).html() || '';
      }
      // Fallback till första om tredje inte finns
      if (!descriptionHtml && textPortlets.length > 0) {
        descriptionHtml = textPortlets.first().html() || '';
      }

      // Kombinera ingress och beskrivning, sedan konvertera till Markdown
      const fullHtml = `${ingressHtml || ''}\n\n${descriptionHtml || ''}`;
      let description = this.htmlToMarkdown(fullHtml);
      
      // Använd preview desc som fallback om ingenting hittades
      if (!description) {
        description = previewData.desc;
      }

      // Event-info sektioner
      const eventInfos = $('.vbg-event-info');

      // Detaljer (första sektion)
      let fullDate = '';
      let timeRange = '';
      let price = '';

      if (eventInfos.length > 0) {
        const detailsSection = eventInfos.eq(0).find('.vbg-event-info__content p');
        detailsSection.each((_, elem) => {
          const text = $(elem).text().trim();
          if (text.startsWith('Datum:')) {
            fullDate = text.replace('Datum:', '').trim();
          } else if (text.startsWith('Tid:')) {
            timeRange = text.replace('Tid:', '').trim();
          } else if (text.startsWith('Pris:')) {
            price = text.replace('Pris:', '').trim();
          }
        });
      }

      // Plats (tredje sektion eller senare)
      let venueName = previewData.place || 'Varbergs Teater';
      let address = '';

      for (let i = 0; i < eventInfos.length; i++) {
        const sectionTitle = eventInfos.eq(i).find('h2').text().trim();
        if (sectionTitle === 'Plats') {
          const placeSection = eventInfos.eq(i).find('ul li');
          if (placeSection.length > 0) {
            const firstPlace = placeSection.eq(0).find('a');
            if (firstPlace.length > 0) {
              venueName = firstPlace.text().trim();
            } else {
              venueName = placeSection.eq(0).text().trim();
            }

            if (placeSection.length > 1) {
              address = placeSection.eq(1).text().trim();
            }
          }
          break;
        }
      }

      // Bild - extrahera från preview data (redan i HTML-format)
      let imageUrl = '';
      if (previewData.image) {
        const $img = cheerio.load(previewData.image);
        const srcset = $img('img').attr('srcset');
        if (srcset) {
          // Ta högsta upplösningen från srcset
          const srcsetParts = srcset.split(',');
          if (srcsetParts.length > 0) {
            const lastSrc = srcsetParts[srcsetParts.length - 1].trim().split(' ')[0];
            imageUrl = lastSrc;
          }
        }
        // Fallback till src
        if (!imageUrl) {
          imageUrl = $img('img').attr('src') || '';
        }
      }

      // Fixa relativa URL:er för bilder
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = this.baseUrl + imageUrl;
      }

      // Parse datum - använd från detaljsida om tillgängligt, annars från preview
      let dateTime: string;
      if (fullDate && timeRange) {
        dateTime = this.parseSwedishDate(fullDate, timeRange);
      } else {
        // Fallback till preview-data
        dateTime = this.parseDateFromPreview(
          previewData.eventDate.day,
          previewData.eventDate.month,
          previewData.time
        );
      }

      const event: ScrapedEvent = {
        name: title,
        description: description || previewData.desc || undefined,
        date_time: dateTime,
        location: address || 'Varberg',
        venue_name: venueName,
        price: price || undefined,
        image_url: imageUrl || undefined,
        organizer_event_url: url,
        category: 'Okategoriserad', // AI fyller i senare
        tags: undefined
      };

      return event;

    } catch (error) {
      console.error(`Error parsing event details for ${url}:`, error);
      return null;
    }
  }

  private parseSwedishDate(dateStr: string, timeStr: string): string {
    try {
      // "05 oktober 2025" + "18.00 - 20.00" → "2025-10-05T18:00:00"
      const monthMap: Record<string, string> = {
        'januari': '01', 'februari': '02', 'mars': '03', 'april': '04',
        'maj': '05', 'juni': '06', 'juli': '07', 'augusti': '08',
        'september': '09', 'oktober': '10', 'november': '11', 'december': '12',
        // Kort form
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'okt': '10', 'nov': '11', 'dec': '12'
      };

      const parts = dateStr.split(' ');
      if (parts.length < 2) {
        throw new Error(`Invalid date format: ${dateStr}`);
      }

      const day = parts[0].padStart(2, '0');
      const monthStr = parts[1].toLowerCase();
      const month = monthMap[monthStr];

      if (!month) {
        throw new Error(`Unknown month: ${monthStr}`);
      }

      // År kan vara antingen i dateStr eller anta nuvarande/nästa år
      let year = '2025';
      if (parts.length >= 3 && /^\d{4}$/.test(parts[2])) {
        year = parts[2];
      }

      // Parse tid - ta första tiden från range "18.00 - 20.00"
      let time = '18:00'; // Default
      if (timeStr) {
        const timeMatch = timeStr.match(/(\d{1,2})\.(\d{2})/);
        if (timeMatch) {
          const hours = timeMatch[1].padStart(2, '0');
          const minutes = timeMatch[2];
          time = `${hours}:${minutes}`;
        }
      }

      return `${year}-${month}-${day}T${time}:00`;

    } catch (error) {
      console.error('Date parsing error:', error);
      // Fallback till en default datum
      return new Date().toISOString();
    }
  }

  private parseDateFromPreview(day: string, monthStr: string, timeStr: string): string {
    try {
      // Kort form av månader från preview
      const monthMap: Record<string, string> = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'maj': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'okt': '10', 'nov': '11', 'dec': '12'
      };

      const month = monthMap[monthStr.toLowerCase()];
      if (!month) {
        throw new Error(`Unknown month: ${monthStr}`);
      }

      const dayPadded = day.padStart(2, '0');

      // Gissa år baserat på månad (om vi är i december och eventet är i januari, anta nästa år)
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const eventMonth = parseInt(month);
      let year = now.getFullYear();

      if (currentMonth === 12 && eventMonth <= 6) {
        year += 1;
      } else if (currentMonth <= 6 && eventMonth >= 7) {
        // Om vi är i början av året och eventet är senare på året, kan det vara förra året
        // Men normalt sett vill vi ha framtida events, så behåll året
      }

      // Parse tid
      let time = '18:00'; // Default
      if (timeStr) {
        const timeMatch = timeStr.match(/(\d{1,2})\.(\d{2})/);
        if (timeMatch) {
          const hours = timeMatch[1].padStart(2, '0');
          const minutes = timeMatch[2];
          time = `${hours}:${minutes}`;
        }
      }

      return `${year}-${month}-${dayPadded}T${time}:00`;

    } catch (error) {
      console.error('Preview date parsing error:', error);
      return new Date().toISOString();
    }
  }

}