# Societén Scraper - Dokumentation

## Översikt

Societén-scrapern är byggd för att automatiskt hämta event från Societéns webbplats i Varberg. Scrapern följer samma struktur som de befintliga scraperna (Arena Varberg, Varbergs Teater, Visit Varberg).

## Teknisk Information

### Arrangör
- **Namn**: Societén
- **Arrangör-ID**: 49
- **Default kategori**: Nattliv
- **Adress**: Strandgatan 4 A, 432 21 Varberg
- **Kontakt**: 
  - Telefon: 0340-67 65 00
  - Email: info@societen.se

### URL-struktur

1. **Kalender-sida**: `https://societen.se/kalender/`
   - Listar alla kommande events
   - Varje event har en "Läs mer"-knapp

2. **Event-sida**: `https://societen.se/event/[slug]/`
   - Exempel: `https://societen.se/event/dj-ozzi-nattklubb/`
   - Innehåller fullständig information om eventet

## Hur scrapern fungerar

### Steg 1: Hämta kalender-sidan
Scrapern börjar med att hämta `https://societen.se/kalender/` och letar efter alla event-länkar.

**HTML-struktur som scrapern letar efter:**
```html
<a class="uk-link-toggle" href="https://societen.se/event/dj-ozzi-nattklubb/">
  <h2 class="el-title uk-h1">DJ Özzi Nattklubb</h2>
  <div class="el-meta uk-h2">lördag 15 nov</div>
</a>
```

### Steg 2: Besök varje event-sida
För varje event-URL besöker scrapern detaljsidan och extraherar:

#### Titel
- **Selektor**: `h2.uk-heading-small` eller fallback till `h1` eller `h2.el-title`
- **Exempel**: "DJ Özzi Nattklubb"

#### Datum
- **Selektor**: `h2.uk-font-tertiary` eller `div.el-meta`
- **Format**: "lördag 15 nov" eller "lördag 15 november"
- **Parsing**: 
  - Tar bort veckodagen
  - Konverterar svensk månad till nummer
  - Antar rätt år baserat på nuvarande datum
  - Sätter default tid till 22:30 (typisk club-tid)

**Exempel på årsparsing:**
- Om nuvarande datum är 8 november 2025 och eventet är "15 nov" → 2025-11-15
- Om nuvarande datum är 8 november 2025 och eventet är "15 jan" → 2026-01-15 (nästa år)

#### Beskrivning
- **Selektor**: `div.uk-panel.uk-width-xlarge` (primär), med fallbacks
- **Konvertering**: HTML → Markdown (via Turndown)
- **Rensning**: Tar bort metadata som datum-text
- **HTML-struktur**: 
  ```html
  <div class="uk-panel uk-margin uk-width-xlarge">
    <p><strong>CLUB & NÖJE – DJ ÖZZI</strong></p>
    <p>Efter flera år som BOLAGET TURNÉ DJ...</p>
    <h3>Nattklubb & DJ's...</h3>
  </div>
  ```

#### Bild
- **Prioritering**:
  1. WebP från `<source type="image/webp">` srcset (högsta upplösning)
  2. Fallback till `<img>` src
- **URL-fixering**: Konverterar relativa URLs till absoluta

#### Pris
- **Extrahering**: Regex-sökning i beskrivningen
- **Format**: "70 kr", "5000 kr", "Gratis", "FRI ENTRÉ", etc.

### Steg 3: Rate Limiting
Scrapern väntar 500ms mellan varje request för att inte överbelasta servern.

## Datumhantering

### Datumformat från webbplatsen
- **Input**: "lördag 15 nov" eller "lördag 15 november"
- **Output**: "2025-11-15T22:30:00" (ISO 8601 utan timezone)

### Årslogik
```typescript
// Om eventet är i en tidigare månad än nu, anta att det är nästa år
if (monthNum < currentMonth) {
  year = currentYear + 1;
} 
// Om samma månad men tidigare dag, anta nästa år
else if (monthNum === currentMonth && day < now.getDate()) {
  year = currentYear + 1;
}
```

### Standard tid
- Default: **22:30** (typisk club-starttid på Societén)

## Testning

### 1. Testa scrapern lokalt

Kör scrapern via admin-gränssnittet:
```
https://your-domain.com/scrapers
```

Eller via API:
```bash
curl -X POST https://your-domain.com/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"scraperName": "Societén"}'
```

### 2. Förväntade resultat

När scrapern körs bör du se:
```
🎭 Starting scrape of Societén...
📋 Found X event URLs
  ✓ DJ Özzi Nattklubb
  ✓ [andra events...]
🎉 Scraping complete! Found X events
```

### 3. Vanliga problem och lösningar

#### Problem: Inga event hittas
- **Orsak**: Societén kan ha ändrat sin HTML-struktur
- **Lösning**: Inspektera `https://societen.se/kalender/` och uppdatera selektorn för event-länkar

#### Problem: Datum parsas fel
- **Orsak**: Nytt datumformat eller okänd månad
- **Lösning**: Lägg till månadsnamnet i `monthMap` i `parseSwedishDate()`

#### Problem: Bilder saknas
- **Orsak**: Societén har ändrat bildstruktur
- **Lösning**: Inspektera `<picture>` elementet och uppdatera bildextrahering

## Kodstruktur

### Filer
```
src/lib/scrapers/
├── societen-scraper.ts          # Huvudfil för scrapern
├── scraper-registry.ts          # Registrering av scraper
├── base-scraper.ts              # Basklassen (innehåller htmlToMarkdown)
└── types.ts                     # TypeScript interfaces
```

### Viktiga metoder

#### `scrape()`
Huvudmetoden som kör hela scraping-processen.

#### `scrapeEventPage(url: string)`
Extraherar all data från en enskild event-sida.

#### `parseSwedishDate(dateStr: string)`
Konverterar svenskt datumformat till ISO 8601.

## Kategorisering

Events från Societén får automatiskt:
- **Default kategori**: "Nattliv"
- **AI-kategorisering**: Körs efter scraping för att förfina kategorier

Societén-events kan hamna i följande kategorier:
- Nattliv (default för de flesta)
- Scen (om det är konserter/framträdanden)
- Mat & Dryck (om det är matevents)

## Metadata för arrangörsidentifiering

Scrapern lägger till metadata som kan användas för att matcha events till rätt arrangör:

```typescript
metadata: {
  venueName: 'Societén',
  organizerName: 'Societén',
  phone: '0340-67 65 00',
  email: 'info@societen.se',
}
```

## Underhåll

### När ska scrapern uppdateras?

1. **HTML-struktur ändras**: Om Societén byter CMS eller redesignar sin webbplats
2. **Nya datumformat**: Om de börjar använda andra datumformat
3. **URL-struktur ändras**: Om event-URL:erna får nytt format

### Hur kollar man om scrapern behöver uppdateras?

1. Besök `https://societen.se/kalender/` manuellt
2. Jämför HTML-strukturen med selektorerna i koden
3. Kör en test-scrape och kolla loggarna efter varningar

## Exempel på scrapad data

```json
{
  "name": "DJ Özzi Nattklubb",
  "description": "**CLUB & NÖJE – DJ ÖZZI**\n\nEfter flera år som BOLAGET TURNÉ DJ...",
  "date_time": "2025-11-15T22:30:00",
  "location": "Strandgatan 4 A, 432 21 Varberg",
  "venue_name": "Societén",
  "price": "från 70 kr",
  "image_url": "https://societen.se/wp-content/themes/yootheme/cache/...",
  "organizer_event_url": "https://societen.se/event/dj-ozzi-nattklubb/",
  "metadata": {
    "venueName": "Societén",
    "organizerName": "Societén",
    "phone": "0340-67 65 00",
    "email": "info@societen.se"
  }
}
```

## Support

Om scrapern slutar fungera:
1. Kolla loggarna för felmeddelanden
2. Inspektera webbsidans HTML-struktur
3. Uppdatera selektorer vid behov
4. Testa igen

För hjälp, kontakta utvecklingsteamet.

