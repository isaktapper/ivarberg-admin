# 🤖 Scraper Master Guide

Komplett guide för att förstå och bygga scrapers i Ivarberg Admin.

## 📋 Innehåll

1. [Översikt](#översikt)
2. [Arkitektur](#arkitektur)
3. [Skapa en ny scraper](#skapa-en-ny-scraper)
4. [Best Practices](#best-practices)
5. [Felsökning](#felsökning)
6. [API Reference](#api-reference)

---

## Översikt

### Vad är en scraper?

En scraper hämtar event-information från externa webbplatser och importerar den automatiskt till vår databas. Systemet:

- ✅ **Scraping** - Hämtar events från externa källor
- ✅ **AI-kategorisering** - Kategoriserar events automatiskt med OpenAI
- ✅ **Kvalitetsbedömning** - Bedömer kvalitet och publicerar automatiskt vid hög kvalitet
- ✅ **Deduplicering** - Undviker dubbletter
- ✅ **HTML → Markdown** - Konverterar beskrivningar automatiskt

### Befintliga scrapers

| Scraper | URL | Typ | Status |
|---------|-----|-----|--------|
| **Arena Varberg** | arenavarberg.se | Multi-page | ✅ Aktiv |
| **Varbergs Teater** | varberg.se/kulturhuset | API + Detail pages | ✅ Aktiv |

---

## Arkitektur

### Systemöversikt

```
┌──────────────┐
│   Scraper    │  ← Din implementation
│  (extends    │
│ BaseScraper) │
└──────┬───────┘
       │
       ↓ ScrapedEvent[]
┌──────────────┐
│EventImporter │
│              │
│ 1. Deduplicate
│ 2. AI Categorize  ← OpenAI API
│ 3. Quality Check  ← OpenAI Moderation
│ 4. Save to DB     ← Supabase
└──────────────┘
```

### Komponenter

#### 1. **BaseScraper** (`base-scraper.ts`)
Basklass som alla scrapers ärver från. Innehåller:

- `fetchHTML()` - Hämta HTML från URL
- `htmlToMarkdown()` - Konvertera HTML till Markdown
- `delay()` - Rate limiting mellan requests
- `turndownService` - HTML → Markdown converter

#### 2. **ScrapedEvent** Interface (`types.ts`)
Definierar strukturen för ett scrapeat event:

```typescript
interface ScrapedEvent {
  // REQUIRED
  name: string;           // Event-namn
  date_time: string;      // ISO 8601 format (2025-01-15T19:00:00Z)
  location: string;       // Full adress
  
  // RECOMMENDED
  venue_name?: string;    // Platsnamn (t.ex. "Sparbankshallen")
  description?: string;   // Markdown-formaterad beskrivning
  image_url?: string;     // Bild-URL (absolut)
  
  // OPTIONAL
  price?: string;         // Pris (t.ex. "200 kr", "Gratis")
  organizer_event_url?: string; // Länk till originalevent
  category?: EventCategory;     // AI fyller i om null
  tags?: string[];        // Taggar/etiketter
  max_participants?: number;
  
  // AUTO-FILLED (sätts av EventImporter)
  status?: 'published' | 'pending_approval' | 'draft';
  quality_score?: number;      // 0-100
  quality_issues?: string;     // Problem som identifierats
  auto_published?: boolean;    // TRUE om auto-publicerat
}
```

#### 3. **EventImporter** (`event-importer.ts`)
Hanterar import-pipeline:

1. **Deduplicering** - Kontrollerar om event redan finns
2. **AI-kategorisering** - Kategoriserar alla events (batch)
3. **Kvalitetsbedömning** - Bedömer kvalitet och modererar innehåll
4. **Databas-lagring** - Sparar till Supabase

#### 4. **Scraper Registry** (`scraper-registry.ts`)
Central registry för alla scrapers. Används av API:et.

---

## Skapa en ny scraper

### Steg 1: Analysera målwebbplatsen

Innan du börjar koda, undersök webbplatsen:

#### A. Är det en API eller HTML-scrape?

**API-baserad** (rekommenderat om tillgängligt):
```bash
# Öppna DevTools → Network → XHR/Fetch
# Leta efter API-calls när du laddar event-listan
# Exempel: varberg.se använder en JSON API
```

**HTML-scraping**:
```bash
# Inspektera HTML-strukturen
# Leta efter:
- Lista-sida med event-länkar
- Detail-sidor med fullständig info
- Selectors för titel, datum, beskrivning, bild
```

#### B. Kartlägg datan

Skapa en checklista:

- [ ] **Event-lista**: Var hittar jag alla events?
- [ ] **Titel**: Vilken CSS selector?
- [ ] **Datum/tid**: Format? Svensk eller engelsk?
- [ ] **Plats**: Finns venue name? Adress?
- [ ] **Beskrivning**: HTML eller plaintext?
- [ ] **Bild**: Lazy-loading? Relativa URLs?
- [ ] **Pris**: Var visas det?
- [ ] **Kategorier/tags**: Finns det?

#### C. Testa i browsern

```javascript
// Kör i Console för att testa selectors
document.querySelector('.event-title').textContent
document.querySelectorAll('.event-item').length
```

---

### Steg 2: Skapa scraper-filen

```typescript
// src/lib/scrapers/example-venue-scraper.ts

import { BaseScraper } from './base-scraper';
import { ScrapedEvent } from './types';
import * as cheerio from 'cheerio';

export class ExampleVenueScraper extends BaseScraper {
  async scrape(): Promise<ScrapedEvent[]> {
    const events: ScrapedEvent[] = [];
    
    try {
      // Din scraping-logik här
      
    } catch (error) {
      console.error(`Error scraping ${this.config.name}:`, error);
      throw error;
    }
    
    return events;
  }
}
```

---

### Steg 3: Implementation Patterns

#### Pattern 1: Lista + Detail Pages (Arena Varberg-stil)

**Använd när:** Event-listan har länkar till detail-sidor

```typescript
async scrape(): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  
  // STEG 1: Hämta lista-sidan
  const listHtml = await this.fetchHTML(this.config.url);
  const $list = cheerio.load(listHtml);
  
  // STEG 2: Extrahera alla event-URLs
  const eventUrls: string[] = [];
  $list('.event-item a').each((_, element) => {
    const url = $list(element).attr('href');
    if (url) {
      // Konvertera relativa URLs till absoluta
      const absoluteUrl = url.startsWith('http') 
        ? url 
        : new URL(url, this.config.url).toString();
      eventUrls.push(absoluteUrl);
    }
  });
  
  console.log(`Found ${eventUrls.length} event URLs`);
  
  // STEG 3: Scrapa varje detail-sida
  for (const url of eventUrls) {
    try {
      await this.delay(500); // Rate limiting!
      
      const event = await this.scrapeEventPage(url);
      if (event) {
        events.push(event);
      }
      
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      // Fortsätt med nästa event
    }
  }
  
  return events;
}

private async scrapeEventPage(url: string): Promise<ScrapedEvent | null> {
  const html = await this.fetchHTML(url);
  const $ = cheerio.load(html);
  
  // Extrahera data
  const name = $('.event-title').text().trim();
  if (!name) return null; // Skippa om titel saknas
  
  const rawDate = $('.event-date').text().trim();
  const date_time = this.parseDate(rawDate);
  if (!date_time) return null; // Required field!
  
  const location = $('.event-location').text().trim() || 'Okänd plats';
  
  // Optional fields
  const descriptionHtml = $('.event-description').html();
  const description = this.htmlToMarkdown(descriptionHtml);
  
  const image_url = this.extractImage($, '.event-image img');
  
  return {
    name,
    date_time,
    location,
    venue_name: $('.venue-name').text().trim() || undefined,
    description,
    image_url,
    organizer_event_url: url,
    price: $('.event-price').text().trim() || undefined,
    category: null // AI fyller i
  };
}
```

#### Pattern 2: API + Detail Pages (Varbergs Teater-stil)

**Använd när:** Webbplatsen har en JSON API

```typescript
interface APIResponse {
  events: Array<{
    title: string;
    link: string;
    date: string;
    // ... andra fält
  }>;
  totalPages: number;
}

async scrape(): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const seenUrls = new Set<string>(); // Deduplicate
  
  try {
    // STEG 1: Hämta första sidan för att få totalt antal
    const firstPage = await this.fetchAPIPage(0);
    const totalPages = firstPage.totalPages;
    
    console.log(`Found ${totalPages} pages`);
    
    // STEG 2: Loop genom alla sidor
    for (let page = 0; page < totalPages; page++) {
      const data = await this.fetchAPIPage(page);
      
      // STEG 3: Process varje event
      for (const item of data.events) {
        const eventUrl = item.link;
        
        // Skip dubbletter
        if (seenUrls.has(eventUrl)) continue;
        seenUrls.add(eventUrl);
        
        try {
          // Scrapa detail-sidan för fullständig info
          const event = await this.scrapeEventDetails(eventUrl, item);
          if (event) events.push(event);
          
        } catch (error) {
          console.error(`Error scraping ${eventUrl}:`, error);
        }
        
        await this.delay(500);
      }
      
      await this.delay(1000); // Längre delay mellan sidor
    }
    
  } catch (error) {
    console.error('API scraping error:', error);
    throw error;
  }
  
  return events;
}

private async fetchAPIPage(page: number): Promise<APIResponse> {
  const response = await fetch(`${this.config.url}/api/events?page=${page}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // Ofta required för APIs
      'User-Agent': 'Mozilla/5.0 (compatible; iVarberg-EventBot/1.0)'
    },
    body: JSON.stringify({ page, pageSize: 20 })
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}

private async scrapeEventDetails(
  url: string, 
  preview: any
): Promise<ScrapedEvent | null> {
  // Kombinera API-data med scrapad detail-page
  const html = await this.fetchHTML(url);
  const $ = cheerio.load(html);
  
  // API ger grunddata, detail-page ger resten
  return {
    name: preview.title,
    date_time: this.parseDate(preview.date),
    location: $('.venue-address').text().trim(),
    description: this.htmlToMarkdown($('.description').html()),
    image_url: preview.image,
    organizer_event_url: url,
    category: null
  };
}
```

---

### Steg 4: Datum-parsing

Datum är **kritiskt**. Använd alltid ISO 8601 format.

```typescript
private parseDate(dateStr: string): string | null {
  try {
    // Exempel: "28 februari 2025, 19:00"
    
    // 1. Parse datum-delar
    const parts = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (!parts) return null;
    
    const day = parseInt(parts[1]);
    const monthStr = parts[2].toLowerCase();
    const year = parseInt(parts[3]);
    
    // 2. Svenska månader → nummer
    const monthMap: Record<string, number> = {
      'januari': 0, 'februari': 1, 'mars': 2,
      'april': 3, 'maj': 4, 'juni': 5,
      'juli': 6, 'augusti': 7, 'september': 8,
      'oktober': 9, 'november': 10, 'december': 11
    };
    
    const month = monthMap[monthStr];
    if (month === undefined) return null;
    
    // 3. Parse tid (om finns)
    const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
    const hours = timeMatch ? parseInt(timeMatch[1]) : 0;
    const minutes = timeMatch ? parseInt(timeMatch[2]) : 0;
    
    // 4. Skapa Date-objekt
    const date = new Date(year, month, day, hours, minutes, 0);
    
    // 5. Returnera ISO 8601
    return date.toISOString();
    
  } catch (error) {
    console.error('Date parsing error:', error);
    return null;
  }
}
```

**Viktiga tips:**
- ✅ Använd `Date.toISOString()` för konsistent format
- ✅ Hantera både svenska och engelska månadsnamn
- ✅ Returnera `null` vid parse-fel (skippa eventet)
- ✅ Logga fel för debugging

---

### Steg 5: Bild-extraktion

Bilder är ofta komplicerade pga lazy-loading och relativa URLs.

```typescript
private extractImage($: cheerio.CheerioAPI, selector: string): string | undefined {
  const $img = $(selector);
  
  // Testa flera attribut (lazy-loading variants)
  let imageUrl = 
    $img.attr('data-lazyloaded') ||
    $img.attr('data-src') ||
    $img.attr('data-lazy-src') ||
    $img.attr('src');
  
  if (!imageUrl) return undefined;
  
  // Filtrera bort base64 placeholders
  if (imageUrl.includes('base64')) {
    return undefined;
  }
  
  // Filtrera bort ogiltiga värden
  if (imageUrl.length < 10 || !imageUrl.includes('.')) {
    console.warn(`Invalid image URL: "${imageUrl}"`);
    return undefined;
  }
  
  // Konvertera relativa URLs till absoluta
  if (!imageUrl.startsWith('http')) {
    if (imageUrl.startsWith('/')) {
      const baseUrl = new URL(this.config.url);
      imageUrl = `${baseUrl.protocol}//${baseUrl.host}${imageUrl}`;
    } else {
      console.warn(`Cannot resolve relative URL: "${imageUrl}"`);
      return undefined;
    }
  }
  
  return imageUrl;
}
```

---

### Steg 6: Venue Mapping (för multi-venue)

Om organisationen har flera lokaler, mappa dem till korrekta adresser:

```typescript
interface VenueMapping {
  venue_name: string;
  location: string; // Full adress
}

const VENUE_MAP: Record<string, VenueMapping> = {
  'STORA SALEN': {
    venue_name: 'Stora salen',
    location: 'Exempelgatan 1, 432 50 Varberg, Sweden'
  },
  'LILLA SALEN': {
    venue_name: 'Lilla salen',
    location: 'Exempelgatan 1, 432 50 Varberg, Sweden'
  }
};

const DEFAULT_VENUE: VenueMapping = {
  venue_name: 'Huvudscenen',
  location: 'Exempelgatan 1, 432 50 Varberg, Sweden'
};

private mapVenue(rawVenueName: string): VenueMapping {
  const normalized = rawVenueName.trim().toUpperCase();
  
  // Exakt match
  if (VENUE_MAP[normalized]) {
    return VENUE_MAP[normalized];
  }
  
  // Partial match
  for (const [key, value] of Object.entries(VENUE_MAP)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  // Fallback
  console.log(`Unknown venue: "${rawVenueName}", using default`);
  return DEFAULT_VENUE;
}
```

---

### Steg 7: Registrera scrapern

#### A. Lägg till i registry

```typescript
// src/lib/scrapers/scraper-registry.ts

import { ExampleVenueScraper } from './example-venue-scraper';

export const SCRAPER_CONFIGS: ScraperConfig[] = [
  // ... existing scrapers
  {
    name: 'Example Venue',
    url: 'https://examplevenue.se/events',
    enabled: true,
    organizerId: 7, // Skapa organizer först i admin!
    defaultCategory: 'Scen'
  }
];

export function getScrapers(): BaseScraper[] {
  return SCRAPER_CONFIGS
    .filter(config => config.enabled)
    .map(config => {
      switch (config.name) {
        case 'Arena Varberg':
          return new ArenaVarbergScraper(config);
        case 'Varbergs Teater':
          return new VarbergsTeaternScraper(config);
        case 'Example Venue':
          return new ExampleVenueScraper(config); // <-- Din nya!
        default:
          throw new Error(`Unknown scraper: ${config.name}`);
      }
    });
}
```

#### B. Skapa organizer i databasen

1. Gå till `/organizers` i admin
2. Klicka "Ny Organizer"
3. Fyll i uppgifter
4. Anteckna ID:t (visas i URL: `/organizers/7`)
5. Använd detta ID i `organizerId` i config

---

### Steg 8: Testa scrapern

#### Lokal testning

```typescript
// Test-fil: src/lib/scrapers/__tests__/example-venue-scraper.test.ts

import { ExampleVenueScraper } from '../example-venue-scraper';

async function test() {
  const scraper = new ExampleVenueScraper({
    name: 'Example Venue',
    url: 'https://examplevenue.se/events',
    enabled: true,
    organizerId: 7,
    defaultCategory: 'Scen'
  });
  
  const events = await scraper.scrape();
  
  console.log(`✓ Found ${events.length} events`);
  console.log('\nFirst event:');
  console.log(JSON.stringify(events[0], null, 2));
}

test();
```

Kör med:
```bash
npx ts-node src/lib/scrapers/__tests__/example-venue-scraper.test.ts
```

#### Testa via API

```bash
# Starta dev server
npm run dev

# Trigga scraping
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"scrapers": ["Example Venue"]}'
```

---

## Best Practices

### 1. Rate Limiting

**Alltid** lägg till delays mellan requests:

```typescript
await this.delay(500);  // 500ms mellan events
await this.delay(1000); // 1s mellan sidor
```

**Varför?** För att inte överbelasta målservern och undvika IP-ban.

### 2. Error Handling

Fånga fel på rätt nivå:

```typescript
// ✅ GOOD: Fånga fel per event, fortsätt med nästa
for (const url of eventUrls) {
  try {
    const event = await this.scrapeEventPage(url);
    events.push(event);
  } catch (error) {
    console.error(`Failed to scrape ${url}:`, error);
    // Fortsätt med nästa
  }
}

// ❌ BAD: Ett fel stoppar hela scrapen
for (const url of eventUrls) {
  const event = await this.scrapeEventPage(url); // Crash!
  events.push(event);
}
```

### 3. Logging

Logga progress för debugging:

```typescript
console.log(`🎭 Starting scrape of ${this.config.name}...`);
console.log(`📋 Found ${eventUrls.length} event URLs`);
console.log(`  ✓ ${event.name}`);
console.log(`  ✗ Failed: ${eventTitle}`);
console.log(`🎉 Scraping complete! Found ${events.length} events`);
```

### 4. Validation

Validera required fields tidigt:

```typescript
// Skippa events som saknar required fields
if (!name || !date_time || !location) {
  console.warn(`Skipping event: missing required fields`);
  return null;
}
```

### 5. HTML Cleaning

Rensa HTML innan konvertering till Markdown:

```typescript
const descriptionHtml = $('.description').html();

// Ta bort scripts, styles, etc
const cleaned = descriptionHtml
  ?.replace(/<script[^>]*>.*?<\/script>/gi, '')
  ?.replace(/<style[^>]*>.*?<\/style>/gi, '')
  ?.replace(/\s+/g, ' ')
  ?.trim();

const description = this.htmlToMarkdown(cleaned);
```

### 6. Title Case

Konvertera CAPS till Title Case:

```typescript
private toTitleCase(text: string): string {
  const lowerWords = new Set([
    'och', 'i', 'på', 'till', 'med', 'för', 'av'
  ]);
  
  return text.toLowerCase()
    .split(' ')
    .map((word, index) => {
      // Första ordet alltid stor bokstav
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      // Små ord förblir små
      if (lowerWords.has(word)) {
        return word;
      }
      // Övriga ord får stor bokstav
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
```

### 7. Deduplicate URLs

Undvik att scrapa samma event flera gånger:

```typescript
const seenUrls = new Set<string>();

for (const url of eventUrls) {
  if (seenUrls.has(url)) {
    console.log(`  ⊘ Duplicate: ${url}`);
    continue;
  }
  seenUrls.add(url);
  
  // Scrapa...
}
```

---

## Felsökning

### Problem: "Failed to fetch"

**Orsak:** Servern blockerar requests

**Lösning:**
```typescript
protected async fetchHTML(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
      'Referer': this.config.url // Lägg till referrer
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.text();
}
```

### Problem: Bilder saknas/felaktiga

**Orsak:** Lazy-loading eller relativa URLs

**Lösning:** Se [Steg 5: Bild-extraktion](#steg-5-bild-extraktion)

### Problem: Datum parsas fel

**Debug:**
```typescript
console.log('Raw date string:', rawDate);
console.log('Parsed ISO:', date_time);

// Testa manuellt
const testDate = new Date('2025-01-15T19:00:00.000Z');
console.log('Test date:', testDate.toISOString());
```

### Problem: Events importeras inte

**Checka:**
1. ✅ Returnerar `scrape()` events?
2. ✅ Har events `name`, `date_time`, `location`?
3. ✅ Finns `organizerId` i databasen?
4. ✅ Kolla scraper logs i `/scrapers`

### Problem: Duplicerade events

**Lösning:** EventImporter deduplikerar automatiskt baserat på:
- Event namn
- Datum
- Venue name

Om dubbletter ändå skapas, fixa dedupe-nyckeln:

```typescript
// event-importer.ts
private generateDedupeKey(event: ScrapedEvent): string {
  const name = event.name.toLowerCase().trim();
  const date = event.date_time.split('T')[0];
  const venue = (event.venue_name || event.location).toLowerCase().trim();
  
  return `${name}|${date}|${venue}`;
}
```

---

## API Reference

### BaseScraper Methods

#### `fetchHTML(url: string): Promise<string>`
Hämtar HTML från URL med rätt headers.

```typescript
const html = await this.fetchHTML('https://example.com');
```

#### `htmlToMarkdown(html: string): string`
Konverterar HTML till Markdown.

```typescript
const markdown = this.htmlToMarkdown('<p>Hello <strong>world</strong></p>');
// Result: "Hello **world**"
```

#### `delay(ms: number): Promise<void>`
Vänta X millisekunder.

```typescript
await this.delay(500); // Vänta 500ms
```

### ScrapedEvent Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Event-namn |
| `date_time` | string | ✅ | ISO 8601 format |
| `location` | string | ✅ | Full adress |
| `venue_name` | string | ⚠️ | Platsnamn (starkt rekommenderat) |
| `description` | string | ⚠️ | Markdown-formaterad beskrivning |
| `image_url` | string | ⚠️ | Absolut URL till bild |
| `price` | string | ⭕ | Pris (t.ex. "200 kr") |
| `organizer_event_url` | string | ⭕ | Länk till original |
| `category` | EventCategory | ⭕ | AI fyller i om null |
| `tags` | string[] | ⭕ | Taggar |

**Legend:** ✅ Required | ⚠️ Recommended | ⭕ Optional

---

## Exempel: Komplett Scraper

Se `arena-varberg-scraper.ts` för fullständigt exempel.

**Sammanfattning av den:**
1. ✅ Hämtar lista med event-URLs
2. ✅ Scraper varje detail-page
3. ✅ Parsar svensk datum-format
4. ✅ Konverterar HTML → Markdown
5. ✅ Mappar venues till adresser
6. ✅ Konverterar CAPS → Title Case
7. ✅ Extraherar bilder med lazy-loading support
8. ✅ Rate limiting mellan requests
9. ✅ Error handling per event

---

## Checklista: Ny scraper

Använd denna när du skapar en ny scraper:

### Planning
- [ ] Analyserat målwebbplatsen
- [ ] Identifierat API eller HTML-struktur
- [ ] Testat selectors i browser console
- [ ] Kartlagt alla data-fält
- [ ] Förstått datum-format
- [ ] Identifierat bild-hantering

### Implementation
- [ ] Skapat scraper-fil som extends `BaseScraper`
- [ ] Implementerat `scrape()` metod
- [ ] Datum-parsing → ISO 8601
- [ ] Bild-extraktion (absoluta URLs)
- [ ] HTML → Markdown för beskrivningar
- [ ] Venue mapping (om multi-venue)
- [ ] Rate limiting (delay mellan requests)
- [ ] Error handling per event

### Integration
- [ ] Registrerat i `scraper-registry.ts`
- [ ] Skapat organizer i databasen
- [ ] Använt korrekt `organizerId` i config
- [ ] Testat lokalt
- [ ] Testat via API

### Quality Check
- [ ] Events har alla required fields
- [ ] Datum är i framtiden
- [ ] Bilder laddas korrekt
- [ ] Beskrivningar är läsbara (Markdown)
- [ ] Inga dubbletter skapas
- [ ] Logger progress tydligt

---

## Support & Dokumentation

- **Setup-guider:** `/docs/SCRAPER_SETUP.md`
- **Exempel:** `src/lib/scrapers/arena-varberg-scraper.ts`
- **Logs:** Admin → Scrapers (se tidigare körningar)
- **Database:** `/database/migrations/SCRAPER_LOGS_TABLE.sql`

---

**Lycka till med scraping! 🚀**

