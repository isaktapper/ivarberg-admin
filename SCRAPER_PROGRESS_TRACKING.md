# Scraper Progress Tracking - Real-time Monitoring

## 🎯 Översikt

Implementerat real-time progress tracking för scraper-körningar med tidsuppskattning. Nu kan du följa varje steg i scraping-processen direkt i admin-gränssnittet.

## ✨ Funktioner

### 1. Real-time Progress Logs
- ✅ Visa aktuellt steg (Scraping, Deduplisering, Kategorisering, Import)
- ✅ Progress bar med procentuell färdigställelse
- ✅ Uppskattad kvarstående tid
- ✅ Detaljerade meddelanden för varje steg
- ✅ Auto-uppdatering varje sekund när scraper kör

### 2. Visuell Feedback
- ✅ Status-ikoner för varje steg (spinner, checkmarks, error icons)
- ✅ Progress bars för både totalt och per steg
- ✅ Färgkodad status (running = blå, success = grön, failed = röd)
- ✅ Tidsvisning (startad, total tid, kvarstående tid)

### 3. Historik
- ✅ Visa progress logs för gamla körningar
- ✅ Klickbar "Progress"-knapp i körningshistoriken
- ✅ Modal-vy med fullständig logg

## 📁 Implementerade Filer

### 1. Databas Migration
**[database/migrations/CREATE_SCRAPER_PROGRESS_LOGS.sql](database/migrations/CREATE_SCRAPER_PROGRESS_LOGS.sql)**

```sql
CREATE TABLE scraper_progress_logs (
  id BIGSERIAL PRIMARY KEY,
  log_id BIGINT REFERENCES scraper_logs(id),
  step VARCHAR(100) NOT NULL,  -- 'scraping', 'deduplicating', etc
  message TEXT NOT NULL,
  progress_current INTEGER,
  progress_total INTEGER,
  estimated_time_remaining_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Kör migrationen:**
```bash
# Logga in på Supabase Dashboard → SQL Editor
# Kopiera och kör innehållet från filen
```

### 2. Backend Service
**[src/lib/services/progressLogger.ts](src/lib/services/progressLogger.ts)**

Service för att logga progress:

```typescript
await progressLogger.log({
  logId: 123,
  step: 'categorizing',
  message: 'Kategoriserar med AI...',
  progressCurrent: 10,
  progressTotal: 50,
});
```

Helper-metoder:
```typescript
// Hittade events
await progressLogger.logEventsFound(logId, 285);

// Deduplisering
await progressLogger.logDeduplicating(logId, current, total, duplicatesFound);

// AI-kategorisering
await progressLogger.logCategorizing(logId, current, total);

// Arrangörsmatchning
await progressLogger.logMatchingOrganizers(logId, current, total);

// Import till databas
await progressLogger.logImporting(logId, current, total);

// Slutrapport
await progressLogger.logCompleted(logId, stats);
```

**Tidsuppskattning:**
```typescript
// Initialisera estimator
progressLogger.initTimeEstimator(logId, totalItems);

// Beräknas automatiskt baserat på genomsnittlig hastighet
// visas i real-time i UI
```

### 3. API Endpoint
**[src/app/api/scrape/[logId]/progress/route.ts](src/app/api/scrape/[logId]/progress/route.ts)**

```
GET /api/scrape/123/progress
```

**Response:**
```json
{
  "scraperLog": {
    "id": 123,
    "scraper_name": "Visit Varberg",
    "status": "running",
    "started_at": "2025-10-11T10:30:00Z",
    "duration_ms": 15000
  },
  "progressLogs": [
    {
      "id": 1,
      "step": "scraping",
      "message": "Hittade 285 events",
      "progress_current": 285,
      "progress_total": 285,
      "created_at": "2025-10-11T10:30:05Z"
    },
    {
      "id": 2,
      "step": "deduplicating",
      "message": "Rensar interna dubletter...",
      "progress_current": 0,
      "progress_total": 285,
      "created_at": "2025-10-11T10:30:06Z"
    }
  ],
  "totalProgress": {
    "current": 150,
    "total": 285,
    "percentage": 53
  },
  "isRunning": true,
  "estimatedTimeRemaining": 12000
}
```

### 4. Frontend Komponent
**[src/components/ScraperProgressModal.tsx](src/components/ScraperProgressModal.tsx)**

Modal-dialog som visar real-time progress:

```typescript
<ScraperProgressModal
  logId={123}
  scraperName="Visit Varberg"
  onClose={() => setSelectedLogId(null)}
/>
```

Features:
- ✅ Auto-polling varje sekund (endast när running)
- ✅ Progress bar med procentuell visning
- ✅ Tidsuppskattning (t.ex. "~2m 30s kvar")
- ✅ Detaljerad logg för varje steg
- ✅ Status-ikoner (spinner, checkmark, error)
- ✅ Total körtid när klar

### 5. Integration i Scrapers-sidan
**[src/app/scrapers/page.tsx](src/app/scrapers/page.tsx)**

Uppdaterad körningshistorik:

```tsx
{/* Progress-knapp */}
<button
  onClick={() => {
    setSelectedLogId(log.id)
    setSelectedLogName(log.scraper_name)
  }}
>
  <Eye className="w-3 h-3" />
  Progress
</button>

{/* Modal */}
{selectedLogId && (
  <ScraperProgressModal
    logId={selectedLogId}
    scraperName={selectedLogName}
    onClose={() => setSelectedLogId(null)}
  />
)}
```

## 🔧 Användning

### För Användare

1. **Starta en scraper** från Scrapers-sidan
2. **Klicka på "Progress"** i körningshistoriken
3. **Följ progress i real-time:**
   - Se aktuellt steg (Scraping, Deduplisering, etc.)
   - Se progress bar och procentuell färdigställelse
   - Se uppskattad kvarstående tid
   - Läs detaljerade meddelanden för varje steg

4. **När scrapern är klar:**
   - Se total körtid
   - Se slutresultat (events importerade, dubletter, etc.)

### För Utvecklare

**Logga progress i din scraper/importer:**

```typescript
import { progressLogger } from '@/lib/services/progressLogger';

async function importEvents(events: ScrapedEvent[], logId?: number) {
  if (!logId) return; // Progress logging är optional

  // Initialisera tidsuppskattning
  progressLogger.initTimeEstimator(logId, events.length);

  // Logga hittade events
  await progressLogger.logEventsFound(logId, events.length);

  // Deduplisering
  await progressLogger.log({
    logId,
    step: 'deduplicating',
    message: 'Kontrollerar dubletter...',
    progressCurrent: 0,
    progressTotal: events.length,
  });

  // ... ditt duplicate check-kod här ...

  // Update progress (varje 10:e event)
  for (let i = 0; i < events.length; i++) {
    // ... process event ...

    if (i % 10 === 0) {
      await progressLogger.log({
        logId,
        step: 'importing',
        message: 'Sparar till databas...',
        progressCurrent: i,
        progressTotal: events.length,
      });
    }
  }

  // Slutrapport
  await progressLogger.logCompleted(logId, {
    imported: 285,
    duplicates: 15,
    published: 250,
    pending: 30,
    draft: 5,
  });

  // Cleanup
  progressLogger.cleanup(logId);
}
```

## 📊 Progress Steps

Definierade steg i scraping-processen:

| Step | Label | Beskrivning |
|------|-------|-------------|
| `starting` | Startar | Initialisering |
| `scraping` | Scrapar | Hämtar events från källa |
| `deduplicating` | Rensar dubletter | Intern + databas-deduplicering |
| `categorizing` | Kategoriserar | AI-kategorisering med OpenAI |
| `matching_organizers` | Matchar arrangörer | Organizer matching (Visit Varberg) |
| `importing` | Sparar | Sparar till databas |
| `completed` | Klar | Slutrapport |
| `failed` | Misslyckades | Fel uppstod |

## 🎨 UI-design

### Progress Modal Layout

```
┌─────────────────────────────────────────┐
│ Visit Varberg              [X]          │
│ Startad: 10:30             ─            │
│ ┌──────────────────────────────┐        │
│ │ ● Pågår...                   │        │
│ └──────────────────────────────┘        │
├─────────────────────────────────────────┤
│ Sparar till databas...          53%     │
│ ████████████░░░░░░░░░░░░░░░             │
│ 150 / 285                ~2m 30s kvar   │
├─────────────────────────────────────────┤
│ ✓ Startar                   10:30:00    │
│   Startar scraping av Visit Varberg...  │
│                                          │
│ ✓ Scrapar                   10:30:05    │
│   Hittade 285 events                    │
│                                          │
│ ✓ Rensar dubletter          10:30:06    │
│   Rensade bort 15 dubletter             │
│   [Progress bar: 285/285]               │
│                                          │
│ ⏳ Kategoriserar            10:30:10    │
│   Kategoriserar med AI...               │
│   [Progress bar: 45/285]                │
│                                          │
│ ⏳ Sparar (CURRENT)         10:30:45    │
│   Sparar till databas...                │
│   [Progress bar: 150/285]  ~2m 30s kvar │
└─────────────────────────────────────────┘
```

### Färgschema

- **Pågår:** Blå (`bg-blue-100`, `text-blue-800`)
- **Klar:** Grön (`bg-green-100`, `text-green-800`)
- **Misslyckades:** Röd (`bg-red-100`, `text-red-800`)
- **Aktuell:** Blå highlight (`bg-blue-50`, `border-blue-200`)

## 🧪 Testning

### 1. Kör Migration

```bash
# Gå till Supabase Dashboard → SQL Editor
# Kör CREATE_SCRAPER_PROGRESS_LOGS.sql
```

### 2. Starta Scraper

```bash
# Från admin-gränssnittet
# Klicka "Kör Scraper" → Välj "Visit Varberg"
```

### 3. Öppna Progress Modal

```bash
# Klicka "Progress" på den körande scraen
# Se real-time updates
```

### 4. Verifiera

**Förväntat resultat:**

```
✓ Modal öppnas
✓ Visar scraper namn och starttid
✓ Status badge: "Pågår..." med spinner
✓ Progress bar uppdateras automatiskt
✓ Tidsuppskattning visas (~Xm Ys kvar)
✓ Detaljerade loggar för varje steg
✓ När klar: Status ändras till "Klar" med checkmark
```

**Console output:**

```
  📊 Hittade 285 events
  📊 Rensar interna dubletter...
  📊 Kontrollerar mot databas... [0/285]
  📊 Rensade bort 15 dubletter
  📊 Startar AI-kategorisering... [0/270]
  📊 Kategoriserar med AI... [10/270] ~45s kvar
  📊 Matchar arrangörer... [0/270]
  📊 Sparar events till databas... [0/270]
  📊 Klar! 270 events importerade (250 auto-publicerade)
```

## 🔄 Polling & Performance

### Polling-strategi

```typescript
useEffect(() => {
  fetchProgress();

  // Poll varje sekund om scraper fortfarande kör
  const interval = setInterval(() => {
    if (data?.isRunning) {
      fetchProgress();
    }
  }, 1000);

  return () => clearInterval(interval);
}, [logId, data?.isRunning]);
```

### Optimeringar

1. **Conditonal polling:** Endast när `isRunning === true`
2. **Cleanup:** Stoppar polling när scraper är klar
3. **Batched updates:** Loggar varje 10:e event istället för alla
4. **Database index:** `idx_scraper_progress_logs_log_id` för snabb lookup
5. **Auto-cleanup:** Progress logs äldre än 7 dagar tas bort

## 📈 Exempel på Progress Flow

### Visit Varberg Scraping (285 events)

```
1. [starting] Startar scraping av Visit Varberg...               (0:00)
2. [scraping] Hittade 285 events                                 (0:05)
3. [deduplicating] Rensar interna dubletter...                   (0:06)
4. [deduplicating] Kontrollerar mot databas... [0/285]           (0:06)
5. [deduplicating] Rensade bort 15 dubletter                     (0:08)
6. [categorizing] Startar AI-kategorisering... [0/270]           (0:08)
7. [categorizing] Kategoriserar med AI... [50/270] ~30s kvar     (0:30)
8. [categorizing] Kategoriserar med AI... [100/270] ~20s kvar    (0:45)
9. [matching_organizers] Matchar arrangörer... [0/270]           (1:10)
10. [matching_organizers] Matchar arrangörer... [270/270]        (1:12)
11. [importing] Sparar till databas... [0/270]                   (1:12)
12. [importing] Sparar till databas... [50/270] ~15s kvar        (1:20)
13. [importing] Sparar till databas... [150/270] ~8s kvar        (1:35)
14. [importing] Sparar till databas... [250/270] ~2s kvar        (1:48)
15. [completed] Klar! 270 events importerade (250 auto-...)     (1:52)

Total tid: 1m 52s
```

## 🚀 Framtida Förbättringar

### V2 Features
- [ ] Real-time updates med WebSockets istället för polling
- [ ] Pausera/Återuppta scraping
- [ ] Avbryt pågående scraping
- [ ] Export av progress logs till CSV/JSON
- [ ] Progress notifications (email när klar)
- [ ] Historisk progress-graf per scraper

### V3 Features
- [ ] Jämför progress mellan körningar
- [ ] Performance metrics (events/sekund)
- [ ] Alert när scraping tar längre tid än vanligt
- [ ] Automatisk retry vid failure

## 🐛 Troubleshooting

### Progress loggar syns inte i UI

**Lösning:**
1. Kolla att migrationen kördes korrekt
2. Verifiera att `logId` skickas till `importEvents()`:
```typescript
const result = await importer.importEvents(
  events,
  scraper.config.name,
  scraper.config.organizerId,
  logId  // ← Måste finnas!
);
```

### Tidsuppskattning visar felaktigt

**Lösning:**
1. Initialisera estimator:
```typescript
progressLogger.initTimeEstimator(logId, totalItems);
```
2. Uppdatera progress regelbundet (minst varje 10 items)

### Modal uppdateras inte i real-time

**Lösning:**
1. Kolla att polling-intervallet körs (`console.log` i `useEffect`)
2. Verifiera att API endpoint fungerar: `GET /api/scrape/123/progress`
3. Kolla browser Network tab för 404/500 errors

## 📞 Support

Problem?
- Kolla loggarna i Vercel
- Verifiera att migrationen kördes
- Testa API endpoint manuellt: `curl http://localhost:3000/api/scrape/123/progress`

---

**Implementerat:** 2025-10-11
**Version:** 1.0
**Status:** ✅ Production Ready
