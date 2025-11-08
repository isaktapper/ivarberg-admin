# Auto-Creation av Arrangörer från Visit Varberg

## Översikt

Visit Varberg är en plattform som aggregerar events från många olika arrangörer. Tidigare sattes "Visit Varberg" som arrangör på alla events, vilket var missvisande. Nu skapar systemet automatiskt arrangörer baserat på event-datan från Visit Varberg.

## Hur det fungerar

### 1. Visit Varberg Scraper
När scrapern hämtar events från Visit Varberg extraheras följande arrangörinfo från varje event:
- **Arrangörnamn**: `venue` (t.ex. "Majas vid Havet")
- **Webbsida**: `website` (t.ex. "http://majas.nu")
- **Kontaktinfo**: `email`, `phone` (om tillgängligt)

### 2. Arrangörmatchning
När ett event importeras försöker `organizerMatcher` hitta en existerande arrangör genom:
1. **Exakt match** på namn
2. **Venue match** på platsnamn
3. **Kontakt match** på email/telefon
4. **Fuzzy match** (85% likhet) på namn

### 3. Auto-Creation
Om ingen match hittas OCH arrangörnamn finns:
- ✨ **Ny arrangör skapas automatiskt** med:
  - `status: 'pending'` (väntar på godkännande)
  - `created_from_scraper: true`
  - `needs_review: true`
  - `scraper_source: 'Visit Varberg'`
  - All tillgänglig kontaktinfo och webbsida

### 4. Admin-granskning
I admin-panelen `/organizers`:
- Pending-arrangörer visas först
- Highlightad bakgrund (gul/amber) för pending
- ✨ Sparkle-ikon för auto-skapade
- Filter för status (Pending, Aktiva, Arkiverade)
- Källa visas (t.ex. "Från: Visit Varberg")

## Databas-schema

### Nya kolumner i `organizers`

```sql
status TEXT DEFAULT 'active'           -- 'active' | 'pending' | 'archived'
created_from_scraper BOOLEAN           -- TRUE om auto-skapad
needs_review BOOLEAN                   -- TRUE om behöver granskas
scraper_source TEXT                    -- Namnet på scrapern (t.ex. "Visit Varberg")
```

## Setup-instruktioner

### Steg 1: Kör SQL-migration
```bash
# I Supabase SQL Editor, kör:
database/migrations/ADD_ORGANIZER_AUTO_CREATE_SUPPORT.sql
```

### Steg 2: Verifiera
Kolla att alla kolumner finns:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'organizers'
AND column_name IN ('status', 'created_from_scraper', 'needs_review', 'scraper_source');
```

### Steg 3: Testa
Kör Visit Varberg-scrapern och kontrollera:
1. Nya arrangörer skapas automatiskt
2. De får status 'pending'
3. De visas i admin med ✨-ikon

## Admin-workflow

### Granska pending-arrangörer

1. **Gå till `/organizers`**
2. **Klicka på "Pending"-filter** (visar antal)
3. **För varje pending-arrangör:**
   - Klicka på "Edit" (🖊️)
   - Fyll i saknad information:
     - Beskrivning
     - Logo/bild
     - Social media
     - Verifierad kontaktinfo
   - **Uppdatera status**:
     - ✅ `active` = Godkänd och klar
     - 📦 `archived` = Inte längre aktiv
   - Spara

### Merge med befintlig arrangör

Om auto-skapad arrangör är en dublett:
1. Notera ID på den korrekta arrangören
2. Uppdatera events som pekar på dubblett-arrangören:
   ```sql
   UPDATE events
   SET organizer_id = [KORREKT_ID]
   WHERE organizer_id = [DUBLETT_ID];
   ```
3. Ta bort dubblett-arrangören

## Exempel-flöde

### Scrape från Visit Varberg

```
Event: "Henrik Nyblom testar skämt"
Venue: "Majas vid Havet"
Website: "http://majas.nu"

↓ organizerMatcher försöker hitta "Majas vid Havet"
↓ Ingen match hittas
↓ createPendingOrganizer() körs

✨ Ny arrangör skapad:
   - ID: 47
   - Namn: "Majas vid Havet"
   - Status: pending
   - Website: http://majas.nu
   - Created from scraper: true
   - Needs review: true
   - Scraper source: "Visit Varberg"

Event får organizer_id = 47 (inte Visit Varberg!)
```

### I Admin

```
/organizers med filter "Pending (3)"

┌────────────────────────────────────────────────┐
│ ⚠️ Pending (3) | ✅ Aktiva (42) | 🗃️ Arkiverade (2) │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ ✨ Majas vid Havet          │ 🟡 Pending      │
│    Från: Visit Varberg      │                 │
│    http://majas.nu          │ [Edit] [Delete] │
└────────────────────────────────────────────────┘
```

## Loggar

I scraper-loggen ser du:
```
🔍 Visit Varberg-plattform detekterad - matchar 15 events till rätt arrangörer...
  ✨ Organizer match for "Henrik Nyblom testar skämt": ID 47 (auto_created, 70% confidence) [NEW - Pending Review]
     Matched on: organizerName = "Majas vid Havet"
```

## Fördelar

✅ **Korrekt arrangör** på alla events (inte "Visit Varberg")  
✅ **Automatisk** - Inget manuellt arbete vid varje scrape  
✅ **Transparent** - Alla auto-skapade syns tydligt i admin  
✅ **Flexibel** - Kan granska/godkänna/merga senare  
✅ **Skalbar** - Fungerar för andra aggregator-plattformar  

## Framtida förbättringar

- [ ] AI-generering av arrangörbeskrivningar (från website)
- [ ] Automatisk logo-extraktion från website
- [ ] Deduplicerings-förslag i admin ("Denna liknar...")
- [ ] Bulk-actions (godkänn flera samtidigt)
- [ ] Email-notis till admin när nya pending skapas

## Felsökning

### Problem: Arrangörer skapas inte

**Kontrollera:**
1. SQL-migration kördes korrekt
2. `organizerName` finns i metadata (loggas i konsolen)
3. Inga SQL-fel i scraper-loggen

### Problem: Dubblett-arrangörer

**Lösning:**
- Förbättra fuzzy matching i `organizerMatcher.ts`
- Justera threshold (nu 80%)
- Lägg till fler matchningsmetoder

### Problem: För många pending

**Lösning:**
- Bulk-approve: Uppdatera flera samtidigt i SQL
```sql
UPDATE organizers
SET status = 'active', needs_review = false
WHERE status = 'pending'
AND created_from_scraper = true
AND scraper_source = 'Visit Varberg';
```

## Kod-referenser

### Filer som ändrats:
- `src/lib/scrapers/visit-varberg-scraper.ts` - Extraherar arrangördata
- `src/lib/services/organizerMatcher.ts` - Matchning + auto-create
- `src/types/database.ts` - TypeScript types
- `src/app/organizers/page.tsx` - Admin UI
- `database/migrations/ADD_ORGANIZER_AUTO_CREATE_SUPPORT.sql` - Schema

### Key functions:
- `organizerMatcher.matchOrganizer()` - Huvudlogik
- `organizerMatcher.createPendingOrganizer()` - Skapar ny arrangör
- `eventImporter.matchOrganizers()` - Anropar matcher för varje event

