# Admin Scripts

Olika hjälpscript för administration av iVarberg.

## Run Scrapers

Standalone script för att köra alla event-scrapers. Används primärt av GitHub Actions för schemalagd körning, men kan också köras manuellt.

### Användning

**Enklaste sättet (via npm script):**
```bash
npm run scrape
```

**Alternativt (direkt med tsx):**
```bash
npx tsx --env-file=.env.local scripts/run-scrapers.ts
```

**OBS:** Flaggan `--env-file=.env.local` behövs för att ladda environment variables från `.env.local` innan scriptet körs.

### Environment Variables

Kräver följande variabler i `.env.local` eller som environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=sk-...
```

### Output

Scriptet visar detaljerad progress och resultat:

```
🚀 Starting iVarberg event scraping...

📋 Found 4 active scrapers

============================================================
📡 Running: Arena Varberg
🔗 URL: https://arenavarberg.se/evenemang-varberg/
============================================================

  ✓ Found 15 events (3.2s)

  📊 Results for Arena Varberg:
     • Imported: 12 new events
     • Duplicates: 3 skipped
     • Import time: 8.5s

============================================================
📊 FINAL SUMMARY
============================================================
✅ Successfully scraped: 4/4 sources
📥 Total events found: 120
➕ Total imported: 45
🔄 Total duplicates: 75
⏱️  Total time: 156.3s
============================================================
✅ Scraping complete!
```

### Funktioner

✅ **Kör alla scrapers** - Arena Varberg, Varbergs Teater, Visit Varberg, Societén  
✅ **Felhantering** - Fortsätter med nästa scraper vid fel  
✅ **Detaljerad logging** - Progress, timing, resultat  
✅ **Supabase logging** - Alla körningar loggas i databasen  
✅ **Exit codes** - 0 vid success, 1 vid total failure  

### GitHub Actions

Detta script körs automatiskt varje dag kl 06:00 svensk tid via GitHub Actions.

Se [GITHUB_ACTIONS_SETUP.md](../docs/GITHUB_ACTIONS_SETUP.md) för mer info.

---

## Regenerate Page Content

Script för att regenerera AI-innehåll för befintliga arrangörssidor med den förbättrade prompten (tredje person, använder arrangörens namn).

### Användning

**Via npm script:**
```bash
npm run regenerate-pages -- --ids=14,13,16,17,18
```

**Med dry-run (rekommenderas först):**
```bash
npm run regenerate-pages -- --ids=14,13,16,17,18 --dry-run
```

**Direkt med tsx:**
```bash
npx tsx --env-file=.env.local scripts/regenerate-page-content.ts --ids=14,13,16
```

### Vad gör scriptet?

1. ✅ **Hämtar organizer page** från databasen
2. ✅ **Kontrollerar organizer_id** - skippar pages utan organizer
3. ✅ **Scrapar website** med Firecrawl (använder organizer.website)
4. ✅ **Genererar nytt AI-innehåll** med förbättrad prompt
5. ✅ **Uppdaterar endast textfält:**
   - `title`
   - `description`
   - `content`
   - `seo_title`
   - `seo_description`
   - `seo_keywords`
6. ✅ **Behåller alla bilder:**
   - `hero_image_url` (oförändrad)
   - `gallery_images` (oförändrade)

### Flaggor

| Flagga | Beskrivning | Exempel |
|--------|-------------|---------|
| `--ids=N,N,N` | Page IDs att regenerera (obligatorisk) | `--ids=14,15,16` |
| `--dry-run` | Kör utan att spara ändringar | `--dry-run` |

### Exempel Output

```
🔄 Starting page content regeneration...
📋 Page IDs to process: 18, 17, 16, 14, 13
🧪 Dry run: NO

============================================================
📄 Processing page ID: 18
============================================================
📌 Page: Varbergs Teater (/varbergs-teater)
👤 Organizer: Varbergs Teater
🌐 Website: https://www.varbergsteater.se

📡 Step 1: Scraping website with Firecrawl...
✅ Scraped successfully (3421 chars)

🤖 Step 2: Generating new AI content...
✅ AI content generated successfully

📝 Changes to apply:
  Title: "Varbergs Teater" → "Varbergs Teater - Kulturupplevelser i Varberg"
  Description: Välkommen till Varbergs Teater... → Varbergs Teater är en etablerad kulturinstitution...
  Content length: 456 chars → 892 chars
  SEO Title: "Varbergs Teater" → "Varbergs Teater - Evenemang i Varberg"
  Images: KEEPING EXISTING (1 hero, 5 gallery)

💾 Updating database...
✅ Database updated successfully

✨ Page 18 processed successfully!

============================================================
🏁 Regeneration complete!
============================================================
```

### När ska man använda detta?

- ✅ Efter uppdatering av AI-prompten
- ✅ För att fixa "vi/vår/välkommen"-språk till tredje person
- ✅ När arrangörens namn ska användas istället för generiska termer
- ✅ För att få konsekvent språk över alla arrangörssidor

### Environment Variables

Kräver följande i `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=sk-...
FIRECRAWL_API_KEY=fc-...
```

### Tidsuppskattning

- ~10-30 sekunder per page (Firecrawl + OpenAI)
- 5 pages ≈ 1-2 minuter

### Säkerhet

⚠️ **Viktigt:**
- Kör alltid `--dry-run` först för att se ändringar
- Bilder behålls alltid (hero + galleri)
- Endast textinnehåll uppdateras
- Scriptet loggar alla ändringar innan det sparar

### Troubleshooting

#### "Page has no organizer_id"
Pages utan `organizer_id` kan inte regenereras eftersom vi behöver organizer.website för scraping.

#### "Organizer has no website"
Lägg till en website URL på organizern först.

#### "Firecrawl rate limit"
Vänta några minuter och försök igen. Free tier: 500 requests/månad.

---

## Recategorize Events

Script för att rekategorisera alla befintliga events med det nya multi-kategori systemet (1-3 kategorier per event).

### Installation

Installera dependencies som behövs:

```bash
# Installera tsx globalt (för att köra TypeScript-scripts)
npm install -g tsx

# Installera dotenv (för att läsa .env.local)
npm install dotenv
```

### Användning

#### 1. Dry Run (rekommenderas först!)

Kör utan att spara ändringar för att se vad som kommer att hända:

```bash
npx tsx scripts/recategorize-events.ts --dry-run
```

#### 2. Rekategorisera alla events

Kör rekategorisering och spara till databasen:

```bash
npx tsx scripts/recategorize-events.ts
```

#### 3. Rekategorisera endast events utan nya kategorier

Skippa events som redan har `categories` array:

```bash
npx tsx scripts/recategorize-events.ts --skip-existing
```

#### 4. Anpassa batch-storlek

För att hantera rate limiting eller minnes-constraints:

```bash
npx tsx scripts/recategorize-events.ts --batch-size=25
```

### Flaggor

| Flagga | Beskrivning | Default |
|--------|-------------|---------|
| `--dry-run` | Kör utan att spara ändringar | `false` |
| `--skip-existing` | Skippa events som redan har categories | `false` |
| `--batch-size=N` | Antal event-grupper per batch | `50` |

### Exempel Output

```
🚀 Event Recategorization Script
================================

🔄 Startar rekategorisering av events...
📋 Inställningar:
   - Dry run: NEJ (uppdaterar databas)
   - Batch size: 50
   - Skippa befintliga: NEJ

📊 Hittade 347 events att rekategorisera
📚 347 events grupperade i 124 unika eventnamn

🔄 Batch 1/3
   Processing events 1-50 av 124 grupper

  🤖 AI kategoriserar: "Björn Gustafsson - Live"...
     → Scen (Scen: 95%)
     ✓ Uppdaterade 3 occasions med samma kategorier
  
  🤖 AI kategoriserar: "Barnteater - Pippi Långstrump"...
     → Barn & Familj, Scen (Barn & Familj: 92%, Scen: 78%)
     ✓ Uppdaterade 2 occasions med samma kategorier

   Progress: 50/347 (14.4%)
   ✓ Success: 50 | ✗ Failed: 0 | ⊘ Skipped: 0

...

============================================================
📊 SLUTRAPPORT
============================================================
Total events: 347
Processed: 347
✓ Successful: 345
✗ Failed: 2
⊘ Skipped: 0

❌ ERRORS:
   - Event #123 "Okänt Event": AI categorization failed

✅ Rekategorisering klar!
============================================================
```

### Funktioner

✅ **Smart caching** - Events med samma namn kategoriseras bara en gång  
✅ **Batch processing** - Hanterar stora mängder events effektivt  
✅ **Rate limiting** - 500ms delay mellan AI-anrop för att undvika OpenAI rate limits  
✅ **Error handling** - Fortsätter även om vissa events misslyckas  
✅ **Progress tracking** - Visar real-time progress under körning  
✅ **Dry run mode** - Testa innan du kör på riktigt  

### Tidsuppskattning

- ~500ms per unikt eventnamn (AI-kategorisering)
- Flera occasions av samma event är snabba (cached)
- **Exempel:** 100 unika events ≈ 1 minut

### Troubleshooting

#### "Missing Supabase credentials"

Se till att `.env.local` innehåller:
```env
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=sk-...
```

#### "Rate limit exceeded"

Öka delay mellan AI-anrop genom att editera scriptet:
```typescript
await this.delay(1000); // Öka från 500ms till 1000ms
```

#### Script kraschar på stora dataset

Minska batch-storleken:
```bash
npx tsx scripts/recategorize-events.ts --batch-size=25
```

### Efter Rekategorisering

1. **Verifiera resultat** i adminpanelen
2. **Kolla events med flera kategorier:**
   ```sql
   SELECT name, categories, category_scores 
   FROM events 
   WHERE array_length(categories, 1) > 1 
   LIMIT 20;
   ```
3. **Sök efter "Okategoriserad":**
   ```sql
   SELECT COUNT(*) 
   FROM events 
   WHERE 'Okategoriserad' = ANY(categories);
   ```

### Säkerhet

⚠️ **Viktigt:**
- Kör alltid `--dry-run` först
- Ta backup av databasen innan stora operationer
- Scriptet använder `SUPABASE_SERVICE_ROLE_KEY` som har full access

### Support

Vid problem:
1. Kolla console output för felmeddelanden
2. Kör med `--dry-run` för att debugga
3. Kontakta utvecklare om fel kvarstår

