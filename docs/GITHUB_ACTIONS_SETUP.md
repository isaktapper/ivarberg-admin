# GitHub Actions Setup - Automatiserad Event Scraping

## Översikt

Detta dokument beskriver hur du har migrerat dina event-scrapers från lokal/Vercel-körning till automatiserad schemaläggning via GitHub Actions.

## 📁 Filstruktur

```
/scripts/
  - run-scrapers.ts           # Standalone scraper-script

/.github/workflows/
  - daily-scraper.yml         # GitHub Actions workflow
```

## 🚀 Hur det fungerar

### 1. Standalone Script (`scripts/run-scrapers.ts`)

Ett fristående TypeScript-script som:
- Hämtar alla aktiva scrapers från registry
- Kör varje scraper sekventiellt
- Importerar events till Supabase
- Loggar detaljerad progress och resultat
- Hanterar fel gracefully (fortsätter med nästa scraper vid fel)

**Fördelar mot API route:**
- Ingen Vercel timeout (kan köra hur länge som helst)
- Ingen kostnad för Vercel Pro
- Bättre logging och debugging
- Fullständig kontroll över execution environment

### 2. GitHub Actions Workflow (`.github/workflows/daily-scraper.yml`)

**Trigger:**
- **Automatiskt**: Varje dag kl 06:00 svensk tid (05:00 UTC)
- **Manuellt**: Via GitHub Actions UI (workflow_dispatch)

**Steg:**
1. Checkar ut koden
2. Sätter upp Node.js 20
3. Installerar dependencies med `npm ci`
4. Kör scraper-scriptet med environment variables
5. Laddar upp logs vid fel
6. Skapar GitHub issue vid fel (endast om ingen öppen issue finns)

## 🔐 Environment Variables (GitHub Secrets)

### Obligatoriska secrets att lägga till:

Gå till ditt GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret Name | Värde | Beskrivning |
|-------------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xypvnwdfbhbsdcftzbvr.supabase.co` | Din Supabase projekt-URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGc...` | Service role key från Supabase Dashboard |
| `OPENAI_API_KEY` | `sk-...` | OpenAI API key för AI-kategorisering |

### Hitta dina keys:

**Supabase:**
1. Gå till [Supabase Dashboard](https://app.supabase.com)
2. Välj ditt projekt
3. Gå till **Settings** → **API**
4. Kopiera:
   - `URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

**OpenAI:**
1. Gå till [OpenAI Platform](https://platform.openai.com/api-keys)
2. Skapa en ny API key
3. Kopiera → `OPENAI_API_KEY`

## 🧪 Testa lokalt

Innan du pushar till GitHub, testa att scriptet fungerar lokalt:

### 1. Säkerställ att du har rätt env-variabler

Kontrollera att din `.env.local` innehåller:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xypvnwdfbhbsdcftzbvr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=sk-your_openai_key
```

### 2. Kör scriptet

```bash
npx tsx --env-file=.env.local scripts/run-scrapers.ts
```

**Förväntat resultat:**
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

...

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

## 📤 Deploy till GitHub

### 1. Pusha koden

```bash
git add .github/workflows/daily-scraper.yml
git add scripts/run-scrapers.ts
git add docs/GITHUB_ACTIONS_SETUP.md
git commit -m "Add GitHub Actions scraper workflow"
git push origin main
```

### 2. Lägg till secrets

Gå till ditt GitHub repo och lägg till de 3 secrets som beskrivs ovan.

### 3. Verifiera workflow

1. Gå till **Actions**-fliken i ditt GitHub repo
2. Du ska se "Daily Event Scraper" workflow
3. Klicka på **Run workflow** → **Run workflow** för att testa manuellt
4. Vänta ~3-6 minuter och kontrollera logs

## 📊 Övervaka körningar

### GitHub Actions UI

Alla scraper-körningar loggas i GitHub Actions:
- Gå till **Actions**-fliken
- Klicka på en specifik körning för att se logs
- Grön checkmark = success
- Röd X = failure (du får en GitHub issue)

### Supabase Logs

Alla körningar loggas också i din Supabase databas:
- Gå till din admin-panel → `/scrapers`
- Se "Körningshistorik" tabell
- Varje körning har:
  - Status (running, success, failed, partial)
  - Events found/imported/duplicates
  - Duration
  - Errors (om några)

## 🔧 Felsökning

### "Missing environment variable"

**Problem:** Scriptet klagar på saknade env-variabler

**Lösning:**
1. Kontrollera att alla 3 secrets är tillagda i GitHub
2. Verifiera att secret-namnen är exakt rätt (case-sensitive)
3. Kör workflow igen

### "All scrapers failed"

**Problem:** Alla scrapers failar

**Möjliga orsaker:**
1. **Supabase connection issue**
   - Kontrollera att `SUPABASE_SERVICE_ROLE_KEY` är korrekt
   - Testa att connecta till Supabase från lokalt script
   
2. **Website structure changed**
   - En scraper-target kan ha ändrat sin HTML-struktur
   - Kolla logs för specifik scraper som failar
   - Uppdatera CSS selectors i scraper-filen

3. **OpenAI rate limit**
   - För många requests till OpenAI
   - Vänta en stund och kör igen
   - Öka delay i `aiCategorizer.ts` om det händer ofta

### "Timeout"

**Problem:** Workflow timeout efter 15 minuter

**Lösning:**
1. Öka `timeout-minutes` i workflow-filen
2. Optimera scrapers (minska delay mellan requests)
3. Splitta upp i flera workflows (en per scraper)

### "No events found"

**Problem:** Scraper hittar 0 events

**Möjliga orsaker:**
1. **Inget fel** - det kan faktiskt inte finnas några events
2. **HTML structure changed** - scraper hittar inte events längre
3. **Rate limiting** - webbplatsen blockerar requests

**Debug:**
```bash
# Testa lokalt
npx tsx --env-file=.env.local scripts/run-scrapers.ts
```

Inspektera output och se vilken scraper som failar, sedan uppdatera den scraper-filen.

## 🎛️ Konfigurera schema

För att ändra när scraping körs, uppdatera cron-uttrycket i `.github/workflows/daily-scraper.yml`:

```yaml
on:
  schedule:
    - cron: '0 5 * * *'  # 06:00 svensk tid (UTC+1)
```

**Cron syntax:**
```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Veckodag (0-6, söndag=0)
│ │ │ └───── Månad (1-12)
│ │ └─────── Dag i månad (1-31)
│ └───────── Timme (0-23)
└─────────── Minut (0-59)
```

**Exempel:**
- `0 5 * * *` - Varje dag kl 05:00 UTC (06:00 svensk vintertid)
- `0 5,17 * * *` - Två gånger per dag: 05:00 och 17:00 UTC
- `0 5 * * 1-5` - Vardagar kl 05:00 UTC (måndag-fredag)

**OBS:** Använd alltid UTC-tid i cron! Sverige är UTC+1 (vintertid) eller UTC+2 (sommartid).

## 📈 Prestanda

Baserat på nuvarande scrapers:

| Scraper | Genomsnittlig tid | Events per körning |
|---------|------------------|-------------------|
| Arena Varberg | ~30-60s | 15-30 |
| Varbergs Teater | ~20-40s | 10-20 |
| Visit Varberg | ~2-4 min | 100-200 |
| Societén | ~30-60s | 10-20 |
| **Total** | **~3-6 min** | **150-250** |

**GitHub Actions free tier:**
- 2000 minuter/månad för privata repos
- Unlimited för publika repos
- Med 1 körning/dag = ~180 minuter/månad (väl inom gränsen!)

## 🔄 Underhåll

### Lägga till ny scraper

1. Skapa ny scraper-klass i `/src/lib/scrapers/`
2. Registrera i `scraper-registry.ts`
3. Testa lokalt: `npx tsx scripts/run-scrapers.ts`
4. Pusha till GitHub - workflow kör automatiskt nya scrapern

### Inaktivera scraper temporärt

I `src/lib/scrapers/scraper-registry.ts`:
```typescript
{
  name: 'Arena Varberg',
  enabled: false,  // Sätt till false
  ...
}
```

### Uppdatera scraper-logik

1. Uppdatera scraper-filen (t.ex. `arena-varberg-scraper.ts`)
2. Testa lokalt
3. Commit och push
4. Nästa schemalagda körning använder nya logiken

## 🆘 Support

Vid problem:

1. **Kolla GitHub Actions logs** - Detaljerad output från varje körning
2. **Kolla Supabase logs** - Admin panel → `/scrapers`
3. **Testa lokalt** - `npx tsx scripts/run-scrapers.ts`
4. **Kolla GitHub Issues** - Automatiska issues skapas vid fel

## ✅ Checklista för setup

- [ ] `tsx` installerat (`npm install --save-dev tsx`)
- [ ] `scripts/run-scrapers.ts` skapad
- [ ] `.github/workflows/daily-scraper.yml` skapad
- [ ] Testat lokalt (`npx tsx scripts/run-scrapers.ts`)
- [ ] Pushad till GitHub
- [ ] GitHub secrets tillagda (alla 3)
- [ ] Manuell workflow-körning testad
- [ ] Verifierat att events importeras till Supabase

## 🎉 Klart!

Din scraper kör nu automatiskt varje dag kl 06:00 svensk tid! 🚀

Events importeras direkt till Supabase och du kan övervaka allt från admin-panelen eller GitHub Actions.

