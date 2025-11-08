# Event Scraper System Setup

## Översikt

Ett komplett scraper-system som automatiskt hämtar events från Arena Varberg och lägger in dem som drafts i Supabase.

## Filstruktur

```
/src/lib/scrapers/
  - types.ts                    # Type definitions
  - base-scraper.ts             # Base scraper class
  - arena-varberg-scraper.ts    # Arena Varberg-specifik scraper
  - scraper-registry.ts         # Registry för alla scrapers

/src/lib/services/
  - event-importer.ts           # Service för att importera events till Supabase

/src/app/api/scrape/
  - route.ts                    # API endpoint för scraping
```

## Environment Variables

Lägg till följande i `.env.local`:

```env
# Supabase Service Role Key (för server-side operationer)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# OpenAI API Key (för AI-kategorisering)
OPENAI_API_KEY=your_openai_api_key_here

# Optional: För att skydda API:et
SCRAPER_API_TOKEN=your_secret_token_here
```

**Viktigt:** 
- Service Role Key hittar du i Supabase Dashboard under Project Settings > API > service_role key
- OpenAI API Key får du från https://platform.openai.com/api-keys

## Dependencies

Följande packages har installerats:

- `cheerio` - HTML parsing
- `@types/cheerio` - TypeScript types

## Användning

### 1. Testa API:et (GET)

Kör först GET för att se att allt är konfigurerat rätt:

```bash
curl http://localhost:3000/api/scrape
```

Detta returnerar information om konfigurerade scrapers.

### 2. Kör Scraping (POST)

Trigga scraping manuellt:

```bash
# Utan authentication
curl -X POST http://localhost:3000/api/scrape

# Med authentication (om SCRAPER_API_TOKEN är konfigurerad)
curl -X POST http://localhost:3000/api/scrape \
  -H "Authorization: Bearer your_secret_token"
```

### 3. Från Adminpanelen

Skapa en knapp i din adminpanel som kör:

```typescript
async function runScraper() {
  try {
    const response = await fetch('/api/scrape', { 
      method: 'POST' 
    });
    
    const result = await response.json();
    
    console.log('Scraping results:', result);
    console.log(`Total found: ${result.totalFound}`);
    console.log(`Total imported: ${result.totalImported}`);
    console.log(`Total duplicates: ${result.totalDuplicates}`);
    
    // Visa resultat för användaren
    alert(`Importerade ${result.totalImported} nya events!`);
    
  } catch (error) {
    console.error('Scraping error:', error);
    alert('Något gick fel vid scraping');
  }
}
```

## API Response

### GET Response

```json
{
  "message": "Event scraper API",
  "scrapers": [
    {
      "name": "Arena Varberg",
      "url": "https://arenavarberg.se/evenemang-varberg/",
      "enabled": true,
      "organizerId": 5
    }
  ]
}
```

### POST Response

```json
{
  "timestamp": "2025-10-04T12:00:00.000Z",
  "totalSources": 1,
  "totalFound": 15,
  "totalImported": 12,
  "totalDuplicates": 3,
  "results": [
    {
      "source": "Arena Varberg",
      "success": true,
      "eventsFound": 15,
      "eventsImported": 12,
      "duplicatesSkipped": 3,
      "errors": []
    }
  ]
}
```

## Hur Systemet Fungerar

### 1. Scraping Process (Tvåstegsprocess)

**Steg 1: Hämta Event-länkar**
- `ArenaVarbergScraper` hämtar kalendersidan från Arena Varberg
- Hittar alla event-länkar i kalendervyn (`.mec-masonry-item-wrap .mec-event-title a`)
- Samlar alla URLs till individuella event-sidor

**Steg 2: Scrapa Event-detaljer**
- Besöker varje individuell event-sida
- Väntar 500ms mellan requests för att inte överbelasta servern
- Extraherar detaljerad information från event-sidan:
  - **Titel**: `.mec-single-title`
  - **Datum med ÅR**: `.mec-single-event-date .mec-start-date-label` (format: "28 feb 2026")
  - **Tid**: `.mec-single-event-time abbr` (format: "20:00 - 21:15")
  - **Kostnad**: `.mec-event-cost .mec-events-event-cost` (ex: "Från 695 kr")
  - **Plats**: `.mec-single-event-location h6` + **Venue Mapping**
  - **Beskrivning**: `.mec-single-event-description`
  - **Bild**: `.mec-events-event-image img` med smart lazy-loading hantering
    - Prioriterar `data-lazyloaded`, `data-src`, `data-lazy-src` före `src`
    - Filtrerar bort base64-encoded placeholders
    - Validerar att bilden är en riktig URL
  - **Tags**: `.mec-event-label-captions`

**Steg 3: Venue Mapping**
- Mappar Arena Varbergs olika lokaler till standardiserade namn och adresser
- Stödda venues:
  - `SPARBANKSHALLEN` → "Sparbankshallen Varberg"
  - `ROTUNDAN/ROUTUNDAN` → "Rotundan"
  - `ARENA VARBERG` → "Arena Varberg"
  - `NÖJESHALLEN` → "Nöjeshallen"
- Alla har samma adress: "Kattegattsvägen 26, 432 50 Varberg, Sweden"
- Okända venues får default "Arena Varberg"

### 2. Date Parsing

- Parsar fullständigt datum med år från format "28 feb 2026"
- Hanterar både korta ("feb") och långa ("februari") månadsnamn
- Konverterar till ISO 8601 format
- Lägger till exakt starttid från tidssträngen
- **Inget antagande om år** - använder faktiskt år från event-sidan!

### 3. Venue Mapping

Scrapern har inbyggd mapping för Arena Varbergs olika lokaler:

| Scrapad text | Platsnamn | Adress |
|--------------|-----------|---------|
| SPARBANKSHALLEN | Sparbankshallen Varberg | Kattegattsvägen 26, 432 50 Varberg, Sweden |
| ROTUNDAN / ROUTUNDAN | Rotundan | Kattegattsvägen 26, 432 50 Varberg, Sweden |
| ARENA VARBERG | Arena Varberg | Kattegattsvägen 26, 432 50 Varberg, Sweden |
| NÖJESHALLEN | Nöjeshallen | Kattegattsvägen 26, 432 50 Varberg, Sweden |

- Matchning är case-insensitive och hanterar variationer
- Okända venues får automatiskt "Arena Varberg" som fallback
- Loggar om en okänd venue påträffas (för att kunna lägga till i mappingen)

### 4. AI-kategorisering

Efter scraping kategoriseras alla events automatiskt med OpenAI (GPT-4o-mini):

**Smart kategorisering:**
- Väljer **1-3 kategorier** per event (istället för bara 1)
- Sorterar kategorier efter relevans (bäst först)
- Returnerar confidence scores (0.0-1.0) för varje kategori
- Cachar kategorisering för events med samma namn (snabbt för flera occasions)

**Exempel:**
```
Event: "Barnteater - Pippi Långstrump"
→ Kategorier: ["Barn & Familj", "Scen"]
→ Scores: { "Barn & Familj": 0.95, "Scen": 0.78 }
```

**Tillgängliga kategorier:**
- Scen (teater, konserter, standup, livemusik)
- Nattliv (klubb, DJ, pub, afterwork)
- Sport (matcher, träning, idrottsevenemang)
- Utställningar (konstutställningar, galleri, kulturhus)
- Föreläsningar (talks, presentationer, workshops)
- Barn & Familj (barnteater, familjeaktiviteter)
- Mat & Dryck (matfestival, vinprovning, middagar)
- Jul (julmarknader, lucia, julkonserter)
- Film & bio (biografföreställningar, filmvisningar)
- Djur & Natur (naturvandringar, djurparker)
- Guidade visningar (stadsvandringar, museibesök)
- Okategoriserad (fallback om AI inte kan kategorisera)

### 5. Event Import

- Validerar att required fields finns (name, date_time, location)
- Kontrollerar dubbletter baserat på name + date_time + location
- Genererar unikt `event_id` baserat på:
  - Source name
  - Event slug (från titel)
  - Timestamp
  - Random string
- Kategoriserar event med AI (1-3 kategorier + confidence scores)
- Bedömer kvalitet och bestämmer status (published/pending_approval/draft)
- Sparar event till databasen

### 6. Duplicate Detection

Events räknas som dubbletter om följande matchar:
- `name` (exakt match)
- `date_time` (exakt match)
- `location` (exakt match)

## Konfiguration

### Lägg till nya venues i Arena Varberg

Om Arena Varberg lägger till en ny lokal, uppdatera mappingen i `arena-varberg-scraper.ts`:

```typescript
const ARENA_VARBERG_VENUES: Record<string, VenueMapping> = {
  'SPARBANKSHALLEN': {
    venue_name: 'Sparbankshallen Varberg',
    location: 'Kattegattsvägen 26, 432 50 Varberg, Sweden'
  },
  // Lägg till nya här:
  'NY LOKAL NAMN': {
    venue_name: 'Korrekt Platsnamn',
    location: 'Korrekt Adress'
  }
};
```

### Lägg till nya scrapers

1. Skapa en ny scraper-klass i `/lib/scrapers/`:

```typescript
import { BaseScraper } from './base-scraper';
import { ScrapedEvent } from './types';

export class MyNewScraper extends BaseScraper {
  async scrape(): Promise<ScrapedEvent[]> {
    // Implement scraping logic
  }
}
```

2. Registrera i `/lib/scrapers/scraper-registry.ts`:

```typescript
export const SCRAPER_CONFIGS: ScraperConfig[] = [
  {
    name: 'Arena Varberg',
    url: 'https://arenavarberg.se/evenemang-varberg/',
    enabled: true,
    organizerId: 5
  },
  {
    name: 'My New Scraper',
    url: 'https://example.com/events',
    enabled: true,
    organizerId: 6  // Uppdatera med rätt organizer ID
  }
];

// Lägg till i switch statement
export function getScrapers(): BaseScraper[] {
  return SCRAPER_CONFIGS
    .filter(config => config.enabled)
    .map(config => {
      switch (config.name) {
        case 'Arena Varberg':
          return new ArenaVarbergScraper(config);
        case 'My New Scraper':
          return new MyNewScraper(config);
        default:
          throw new Error(`Unknown scraper: ${config.name}`);
      }
    });
}
```

### Aktivera/Inaktivera scrapers

Sätt `enabled: false` i `SCRAPER_CONFIGS` för att tillfälligt inaktivera en scraper.

## Begränsningar & Notes

- **Timeout:** API route har `maxDuration = 300` (5 minuter)
- **Rate limiting:** 500ms delay mellan varje event-sida för att inte överbelasta servern
- **Image URLs:** Relativa URLs konverteras automatiskt till absoluta
- **AI-kategorisering:** Använder OpenAI GPT-4o-mini, kräver `OPENAI_API_KEY` i .env
- **Multi-kategorier:** Events får 1-3 kategorier automatiskt, sorterade efter relevans
- **Performance:** AI-kategorisering lägger till ~500ms per unikt eventnamn (cached för flera occasions)

## Felsökning

### Events importeras inte

1. Kontrollera att `SUPABASE_SERVICE_ROLE_KEY` är korrekt
2. Kolla console logs för fel
3. Verifiera att organizer ID 5 finns i databasen
4. Testa scraping med curl och kolla response

### Dubbletter skapas

Om samma event importeras flera gånger:
- Kontrollera att datum/tid parsas konsekvent
- Kolla att event names är identiska (trimmas korrekt)

### HTML parsing misslyckas

Arena Varberg kan ha ändrat sin HTML-struktur:

**För kalendervyn:**
- Öppna https://arenavarberg.se/evenemang-varberg/ i browser
- Inspektera event cards
- Uppdatera CSS selector för event-länkar (`.mec-masonry-item-wrap .mec-event-title a`)

**För event-sidor:**
- Öppna en individuell event-sida (t.ex. `https://arenavarberg.se/evenemang/bjorn-gustafsson-live/`)
- Inspektera element för datum, tid, pris, etc.
- Uppdatera CSS selectors i `scrapeEventPage()` metoden

## Säkerhet

### Authentication (Optional)

För att skydda API:et, uncomment följande i `/app/api/scrape/route.ts`:

```typescript
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${process.env.SCRAPER_API_TOKEN}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

Sätt sedan `SCRAPER_API_TOKEN` i `.env.local`.

## Automatiserad Scraping (Optional)

För att köra scraping automatiskt, använd:

### Cron Job (Vercel)

1. Installera `vercel-cron` eller använd Vercel's cron triggers
2. Konfigurera i `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/scrape",
      "schedule": "0 6 * * *"
    }
  ]
}
```

Detta kör scraping varje dag kl 06:00.

### GitHub Actions

Skapa `.github/workflows/scrape.yml`:

```yaml
name: Scrape Events
on:
  schedule:
    - cron: '0 6 * * *'  # Varje dag kl 06:00
  workflow_dispatch:  # Manuell trigger

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger scraping
        run: |
          curl -X POST https://your-domain.com/api/scrape \
            -H "Authorization: Bearer ${{ secrets.SCRAPER_API_TOKEN }}"
```

## Workflow

1. **Scraping körs** (manuellt eller automatiskt)
2. **AI kategoriserar** alla events (1-3 kategorier per event)
3. **Kvalitetsbedömning** avgör om event auto-publiceras eller behöver granskas
4. **Events importeras** med status:
   - `published` - Högkvalitativa events (auto-publicerade)
   - `pending_approval` - Behöver granskning (saknar bild eller beskrivning)
   - `draft` - Låg kvalitet (många saknade fält)
5. **Admin granskar** events som behöver det
6. **Admin kan justera:**
   - Kategorier (om AI valde fel)
   - Pris (om inte scrapats)
   - Max participants (om relevant)
   - Beskrivning
7. **Admin publicerar** genom att ändra status till 'published'

## Support

Vid problem eller frågor:
- Kolla console logs
- Inspektera API response
- Verifiera Supabase permissions
- Testa manuellt med curl först
