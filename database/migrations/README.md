# Database Migrations

Schema-ändringar och nya tabeller. Kör dessa i Supabase SQL Editor.

## Ordning att köra migrations

1. **SCRAPER_LOGS_TABLE.sql**
   - Skapar scraper_logs och scraper_schedules tabeller
   - RLS policies för scraper logging

2. **ADD_QUALITY_COLUMNS.sql**
   - Lägger till quality_score, quality_issues, auto_published
   - Index för snabb pending-filtrering

3. **ADD_DESCRIPTION_FORMAT_COLUMN.sql**
   - Lägger till description_format (markdown/html/plaintext)

4. **ADD_AUDIT_LOG_FOREIGN_KEY.sql**
   - Foreign key mellan event_audit_log och events
   - Data-integritet constraints

5. **UPDATE_EVENT_CATEGORIES.sql**
   - Uppdaterar event_category enum med nya kategorier

## Notera

Alla migrations använder `IF NOT EXISTS` så de är säkra att köra flera gånger.

