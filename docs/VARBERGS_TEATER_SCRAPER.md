# Varbergs Teater Scraper

## Översikt
Scraper för Varbergs Teaters kalender på https://varberg.se/kulturhuset-komedianten/kalender

## Teknisk Information

### Scraper-konfiguration
- **Namn**: Varbergs Teater
- **Organizer ID**: 6 (Varbergs Teater i databasen)
- **URL**: https://varberg.se/kulturhuset-komedianten/kalender
- **API URL**: `?sv.target=12.2b514d9b18a92e6fafcf397&sv.12.2b514d9b18a92e6fafcf397.route=/filter`
- **Default kategori**: Scen
- **Rate limiting**: 500ms mellan event-requests, 1000ms mellan sidor
- **Teknologi**: Direkta API POST-requests + Cheerio för HTML-parsing
- **Metod**: Interceptar AJAX API-calls som webbplatsen använder

## Arkitektur

### Filstruktur
```
src/lib/scrapers/
├── varbergs-teatern-scraper.ts  # Ny scraper-implementation
├── scraper-registry.ts          # Uppdaterad med ny scraper
├── base-scraper.ts              # Bas-klass
└── types.ts                     # TypeScript-typer
```

## HTML-struktur

### Kalendersida (listvy)
```html
<ul class="khk-activity__list">
  <li class="khk-activity__item">
    <span class="khk-activity__date">
      <span class="khk-activity__day">05</span>
      <span class="khk-activity__month">okt</span>
    </span>
    <span class="khk-activity__image">
      <img src="..." srcset="...">
    </span>
    <div class="khk-activity__text">
      <h2><a href="/kulturhuset-komedianten/kalender/2025/oktober/slug">Titel</a></h2>
      <p>Beskrivning...</p>
      <p>
        <span class="khk-activity__time">18.00 - 20.00</span>
        <span class="khk-activity__place">Varbergs Teater</span>
      </p>
    </div>
  </li>
</ul>
```

### Detaljsida
```html
<h1 class="heading">Event-titel</h1>
<p class="subheading">Ingress...</p>
<div class="sv-text-portlet-content">
  <p>Fullständig beskrivning...</p>
</div>

<div class="vbg-event-info">
  <h2>Detaljer</h2>
  <div class="vbg-event-info__content">
    <p>Datum: 05 oktober 2025</p>
    <p>Tid: 18.00 - 20.00</p>
    <p>Pris: 250 kr</p>
  </div>
</div>

<div class="vbg-event-info">
  <h2>Plats</h2>
  <ul>
    <li><a href="...">Varbergs Teater</a></li>
    <li>Engelbrektsgatan 5, 432 41 Varberg</li>
  </ul>
</div>
```

## Funktioner

### API-baserad Paginering (Ny metod!)
- 12 events per sida
- Totalt ~118 events (~10 sidor)
- **Metod**: Direkta POST-requests till `/filter` API-endpoint
- **API Response Format**:
  ```json
  {
    "page": 0,
    "hits": 118,
    "hitsPerPage": 12,
    "events": [
      {
        "title": "Event-titel",
        "link": "/kulturhuset-komedianten/kalender/...",
        "time": "18.00 - 20.00",
        "place": "Varbergs Teater",
        "desc": "Beskrivning...",
        "eventDate": {"day": "05", "month": "okt"},
        "image": "<img src=...>"
      }
    ]
  }
  ```
- **Process**:
  1. POST-request till API med `page: 0`
  2. Få totalt antal events (`hits`) och beräkna antal sidor
  3. Loop genom alla sidor (0 till N-1)
  4. För varje event: scrapa detaljsidan för fullständig info
- Dubblettskydd genom `Set<string>` med event-URLs
- Inget behov av browser automation!

### Datum-hantering
- Stödjer både kort form ("okt") och lång form ("oktober")
- Kombinerar datum från listsidan med detaljer från detaljsidan
- Format: `2025-10-05T18:00:00`
- Hanterar automatiskt år-gissning baserat på nuvarande datum

### Kategori-mappning
Automatisk mappning baserat på plats och innehåll:

| Kriterier | Kategori |
|-----------|----------|
| Lilla Teatern + barn-relaterat | Barn & Familj |
| Filmklubben / Film i titel | Konst |
| Konsthall / Galleri | Konst |
| Föreläsning / Samtal | Föreläsningar |
| Utställning / Vernissage | Konst |
| Default | Scen |

### Tag-extraktion
Automatiskt extraherade tags baserat på innehåll:
- Konsert / Musik
- Teater / Pjäs
- Barn / Familj → "Barnvänligt"
- Film / Bio
- Föreläsning / Samtal
- Utställning / Konst
- Dans / Balett
- Opera
- Jazz
- Klassisk musik
- Stand up / Komedi

### Bildhantering
1. Försöker hämta högsta upplösningen från `srcset`-attribut
2. Fallback till `src`-attribut
3. Fallback till bild från preview-data
4. Konverterar relativa URL:er till absoluta

## Användning

### Kör manuellt via admin-gränssnittet
1. Gå till `/scrapers` i admin-gränssnittet
2. Klicka på "Kör scraping nu"
3. Välj "Varbergs Teater" från listan
4. Klicka "Kör"

### Kör via API
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "admin@example.com",
    "scraperNames": ["Varbergs Teater"]
  }'
```

### Kör båda scrapers
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "admin@example.com"
  }'
```

## Loggning

### Console logs
```
🎭 Startar scraping av Varbergs Teater via API...
📊 Totalt 118 events på 10 sidor

📋 Hämtar sida 1/10...
📝 Hittade 12 events på sida 1
  ✓ Vackra vilda Vivaldi med Höör Barock! - 5/10
  ✓ Varbergs Teater 130 år! - 6/10
  ✓ Slöjd, design och konsthantverks Audition- 7/10
  ...

📋 Hämtar sida 2/10...
📝 Hittade 12 events på sida 2
  ✓ Språkcafé - 23/10
  ✓ Verktyg för vardagshjältar - 23/10
  ...

📋 Hämtar sida 3/10...
...

📋 Hämtar sida 10/10...
📝 Hittade 10 events på sida 10
  ✓ [Sista events]

🎉 Scraping klar! Hittade 118 unika events totalt
```

### Databas-loggar
Alla körningar loggas i `scraper_logs`-tabellen med:
- Status (running, success, failed, partial)
- Antal hittade events
- Antal importerade events
- Antal dubbletter
- Eventuella fel
- Körningstid

## Schema
Scrapern körs automatiskt varje dag kl 06:00 (definierat i `scraper_schedules`):
```sql
INSERT INTO scraper_schedules (scraper_name, enabled, cron_expression, next_run_at)
VALUES ('Varbergs Teater', true, '0 6 * * *', ...);
```

## Felhantering

### Event-nivå
- Varje event har sin egen try-catch
- Misslyckade events loggas men stoppar inte hela körningen
- Felmeddelanden samlas i `scraper_logs.errors`-arrayen

### Sida-nivå
- Fel vid hämtning av en sida avbryter paginering
- Tidigare hämtade events behålls

### Datum-parsing
- Fallback till default-datum om parsing misslyckas
- Loggar varningar för ogiltiga datum

## Testning

### Manuell testning
1. Starta dev-servern: `npm run dev`
2. Gå till http://localhost:3000/scrapers
3. Klicka på "Kör scraping nu" och välj "Varbergs Teater"
4. Kontrollera logs i console och databas

### Kontrollera resultat
```sql
-- Se senaste körningen
SELECT * FROM scraper_logs 
WHERE scraper_name = 'Varbergs Teater' 
ORDER BY started_at DESC 
LIMIT 1;

-- Se importerade events
SELECT name, date_time, venue_name, category 
FROM events 
WHERE organizer_id = 6 
ORDER BY created_at DESC 
LIMIT 10;
```

## Kända begränsningar

### API-beroende
- Scrapern är beroende av att API-endpoint:en förblir densamma
- Om Varberg.se ändrar API-strukturen kan scrapern sluta fungera
- URL-parametrarna (`sv.target`, etc) kan ändras vid uppdateringar

### Datum
- År hämtas från detaljsidan om tillgängligt
- Annars gissas baserat på nuvarande datum (kan ge fel resultat)

### Beskrivning
- Tredje `.sv-text-portlet-content` innehåller oftast huvudtexten
- Kan variera mellan olika event-typer

### Priser
- Varierar mycket i format: "250 kr", "gratis", "250 kr, ungdomar under 20 år går in gratis"
- Sparas som råtext

## Framtida förbättringar

- [x] ~~Puppeteer-support för JavaScript-baserad paginering~~ ❌ INTE BEHÖVS
- [x] ~~Direkt API-access istället för browser automation~~ ✅ IMPLEMENTERAD
- [ ] Cache för att undvika att scrapa samma events flera gånger
- [ ] Parallella requests för detaljsidor (snabbare scraping)
- [ ] Support för återkommande events
- [ ] ML/NLP för bättre kategori-igenkänning
- [ ] Support för utställningar (annan flik på kalendern)
- [ ] Bättre prisformatering och -parsing
- [ ] Automatisk bildoptimering

## Support

Vid problem, kontrollera:
1. Scraper-logs i databasen
2. Console-logs i servern
3. Network-requests (kan webbplatsen nås?)
4. HTML-struktur (har sidan ändrats?)
