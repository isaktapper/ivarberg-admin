# Scraper Logs Setup

## Steg 1: Skapa tabellerna i Supabase

1. Gå till din Supabase Dashboard
2. Öppna **SQL Editor**
3. Kopiera hela innehållet från `SCRAPER_LOGS_TABLE.sql`
4. Kör SQL-koden

Detta skapar:
- **`scraper_logs`** - Logg över alla körningar
- **`scraper_schedules`** - Schema för automatiska körningar
- Index för snabbare queries
- RLS policies
- Default schedule för Arena Varberg

## Vad tabellerna innehåller

### scraper_logs

Varje scraping-körning loggas med:

| Kolumn | Beskrivning |
|--------|-------------|
| `scraper_name` | Namnet på scrapern (t.ex. "Arena Varberg") |
| `scraper_url` | URL som scrapades |
| `organizer_id` | Vilken organizer events tillhör |
| `status` | `running`, `success`, `failed`, `partial` |
| `started_at` | När körningen startade |
| `completed_at` | När körningen slutfördes |
| `duration_ms` | Hur lång tid det tog (millisekunder) |
| `events_found` | Antal events som hittades |
| `events_imported` | Antal events som importerades |
| `duplicates_skipped` | Antal dubbletter som hoppades över |
| `errors` | Array av felmeddelanden |
| `triggered_by` | `manual`, `cron`, `api` |
| `trigger_user_email` | Vem som körde (om manuell) |

### scraper_schedules

Schema för automatiska körningar:

| Kolumn | Beskrivning |
|--------|-------------|
| `scraper_name` | Namnet på scrapern |
| `enabled` | Om schemat är aktivt |
| `cron_expression` | Cron-uttryck (t.ex. "0 6 * * *" = varje dag kl 06:00) |
| `next_run_at` | När nästa körning är planerad |
| `last_run_at` | När senaste körningen var |

## Steg 2: Verifiera

Kör i SQL Editor för att se att allt fungerar:

```sql
-- Se scraper schedules
SELECT * FROM scraper_schedules;

-- Se senaste logs
SELECT 
  scraper_name,
  status,
  started_at,
  events_found,
  events_imported
FROM scraper_logs
ORDER BY started_at DESC
LIMIT 10;
```

## Steg 3: Använd scraper-sidan

1. Gå till `/scrapers` i adminpanelen
2. Klicka "Kör scraping nu"
3. Se resultatet i realtid
4. Kolla historiken i tabellen

## Automatisk scraping med Cron

När du vill sätta upp automatisk scraping:

### Option 1: Vercel Cron (enklast)

Lägg till i `vercel.json`:

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

### Option 2: GitHub Actions

Skapa `.github/workflows/scrape.yml`:

```yaml
name: Scrape Events
on:
  schedule:
    - cron: '0 6 * * *'  # Varje dag kl 06:00 UTC
  workflow_dispatch:  # Manuell trigger

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger scraping
        run: |
          curl -X POST https://your-domain.com/api/scrape \
            -H "Content-Type: application/json" \
            -d '{"userEmail":"cron@system"}'
```

### Uppdatera next_run_at

När cron körs, uppdatera `next_run_at` i `scraper_schedules`:

```sql
UPDATE scraper_schedules
SET 
  last_run_at = NOW(),
  next_run_at = NOW() + INTERVAL '1 day'
WHERE scraper_name = 'Arena Varberg';
```

## Troubleshooting

### Logs sparas inte

- Kontrollera att `SUPABASE_SERVICE_ROLE_KEY` är korrekt i `.env.local`
- Kolla RLS policies i Supabase
- Se till att tabellerna är skapade

### Fel vid INSERT

Om du får fel vid insert, kolla:
1. Att alla kolumner matchar schemat
2. Att organizer_id finns i organizers-tabellen
3. Att RLS policies tillåter INSERT för service_role

### Realtime fungerar inte

För att aktivera realtime i Supabase:
1. Gå till Database > Replication
2. Aktivera realtime för `scraper_logs` tabellen

## Framtida förbättringar

- Lägg till email-notifieringar vid misslyckade körningar
- Visa grafer över körningshistorik
- Konfigurera cron-schema direkt från admin
- Lägg till retry-logik för misslyckade scrapers
