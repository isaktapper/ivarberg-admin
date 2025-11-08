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

6. **ADD_MULTI_CATEGORY_SUPPORT.sql**
   - Lägger till categories (TEXT[]) och category_scores (JSONB)
   - Migrerar data från gamla category kolumnen
   - Check constraints för 1-3 kategorier

7. **REMOVE_OLD_CATEGORY_COLUMN.sql** ⚠️ **KÖR DENNA NU!**
   - Tar bort gamla category kolumnen som orsakar NOT NULL constraint fel
   - Måste köras efter ADD_MULTI_CATEGORY_SUPPORT.sql
   - Efter denna: Kör även `../fixes/FIX_AUDIT_TRIGGER_CATEGORIES.sql` för att uppdatera trigger

8. **ADD_ORGANIZER_AUTO_CREATE_SUPPORT.sql** ✨ **NY!**
   - Lägger till support för auto-creation av arrangörer från scrapers
   - Nya kolumner: status, created_from_scraper, needs_review, scraper_source
   - Index för snabb filtrering av pending-arrangörer
   - Aktiverar Visit Varberg att automatiskt skapa arrangörer

## Notera

Alla migrations använder `IF NOT EXISTS` så de är säkra att köra flera gånger.

