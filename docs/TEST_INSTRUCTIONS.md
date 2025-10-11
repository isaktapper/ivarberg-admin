# Testing Instructions for Visit Varberg Scraper

## Prerequisites

Innan du testar, skapa först en organizer med ID 7 i databasen:

1. Gå till `/organizers` i admin
2. Klicka "Ny Organizer"
3. Fyll i:
   - Namn: "Visit Varberg"
   - Plats: "Varberg"
   - Website: "https://visitvarberg.se"
4. Spara och notera ID:t (ska vara 7 om detta är den 7:e organizern)

## Kör Database Migration

Innan du kör scrapers, skapa tabellen för duplicate logs:

```bash
# Kör SQL-filen i Supabase Dashboard → SQL Editor
/database/migrations/CREATE_DUPLICATE_EVENT_LOGS_TABLE.sql
```

## Test 1: Lokal scraper-test

Testa scrapern direkt utan att spara till databasen:

```bash
cd /Users/isaktapper/Documents/ivarberg_admin

npx ts-node src/lib/scrapers/__tests__/visit-varberg-scraper.test.ts
```

**Förväntat resultat:**
- ✅ Hittar 100-500 events från Visit Varberg
- ✅ JSON parsas korrekt från script-taggar
- ✅ Multiple occasions skapas för samma event
- ✅ Bilder, beskrivningar, priser extraheras
- ✅ Alla events har required fields

## Test 2: Via Scraper API

Testa hela import-pipelinen (scraping + deduplication + AI + quality):

```bash
# 1. Starta dev server
npm run dev

# 2. I ny terminal, trigga scraping
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"scrapers": ["Visit Varberg"]}'
```

**Förväntat resultat:**
- ✅ Events importeras till databasen
- ✅ AI kategoriserar events
- ✅ Quality checker bedömer events
- ✅ Dubbletter detekteras (om du redan har events från Arena/Teater)
- ✅ Duplicate logs sparas till databasen

## Test 3: Granska Duplicates

1. Gå till `/events/duplicates` i admin
2. Se alla skippade dubbletter
3. Verifiera att rätt events behållits

**Exempel på dubbletter som ska detekteras:**
- "Konsert med X" (Arena Varberg) vs "X - Live" (Visit Varberg)
- Samma event på samma dag på samma plats

## Test 4: Fuzzy Matching Test

För att testa fuzzy matching, skapa manuellt ett event:

1. Gå till `/events/new`
2. Skapa event:
   - Namn: "Magnus Carlsson LIVE"
   - Datum: Välj ett framtida datum
   - Plats: "Sparbankshallen Varberg"
   - Venue: "Sparbankshallen"
   - Kategori: "Scen"
3. Spara

Kör sedan scraping igen:
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"scrapers": ["Visit Varberg"]}'
```

Om Visit Varberg har ett event "Magnus Carlsson - Konsert" samma dag på Sparbankshallen, ska det detekteras som duplicate med 85%+ similarity.

## Test 5: Alla scrapers tillsammans

Testa att köra alla scrapers och se att deduplication fungerar:

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json"
```

**Förväntat resultat:**
- ✅ Arena Varberg: ~20-50 events
- ✅ Varbergs Teater: ~30-80 events
- ✅ Visit Varberg: ~100-500 events
- ✅ Dubbletter detekteras mellan sources
- ✅ Totalt ~150-600 unika events importeras

## Verify in Database

Kontrollera i Supabase Dashboard:

```sql
-- Se alla events från Visit Varberg
SELECT name, date_time, venue_name, quality_score, status
FROM events
WHERE organizer_id = 7
ORDER BY created_at DESC
LIMIT 20;

-- Se duplicate logs
SELECT 
  scraper_name,
  scraped_event_name,
  existing_event_name,
  similarity_score,
  match_type
FROM duplicate_event_logs
ORDER BY scraped_at DESC
LIMIT 20;

-- Räkna events per organizer
SELECT 
  o.name as organizer,
  COUNT(*) as event_count,
  AVG(e.quality_score) as avg_quality,
  COUNT(CASE WHEN e.auto_published = true THEN 1 END) as auto_published
FROM events e
JOIN organizers o ON o.id = e.organizer_id
GROUP BY o.name
ORDER BY event_count DESC;
```

## Troubleshooting

### Problem: "organizerId 7 does not exist"
→ Skapa organizern först (se Prerequisites)

### Problem: "table duplicate_event_logs does not exist"
→ Kör SQL migration (se Kör Database Migration)

### Problem: "string-similarity not found"
→ Kör `npm install` igen

### Problem: Inga events hittas
→ Kontrollera att Visit Varberg's webbplats är uppe och har events

### Problem: JSON parsing failed
→ Visit Varberg kan ha ändrat sin HTML-struktur. Inspektera sidan och uppdatera regex i scrapern.

## Success Criteria

✅ **All tests pass** om:
1. Lokal test hittar 100+ events
2. API import fungerar utan fel
3. Duplicates detekteras och loggas
4. Admin UI visar duplicate logs
5. Events har hög kvalitet (bilder, beskrivningar, etc.)
6. Fuzzy matching fungerar (85%+ similarity threshold)

## Next Steps

Efter success:
1. ✅ Schedulera scraper (optional via cron)
2. ✅ Övervaka duplicate logs första veckan
3. ✅ Justera similarity threshold om nödvändigt
4. ✅ Lägg till fler scrapers med samma system

