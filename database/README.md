# Databas SQL-filer

Denna mapp innehåller alla SQL-filer organiserade efter syfte.

## Struktur

### 📁 migrations/
Schema-ändringar och nya tabeller. Kör dessa i ordning när du sätter upp databasen.

**Filer:**
- `SCRAPER_LOGS_TABLE.sql` - Scraper logging tabell
- `ADD_QUALITY_COLUMNS.sql` - Kvalitetsbedömning kolumner
- `ADD_DESCRIPTION_FORMAT_COLUMN.sql` - Beskrivningsformat (markdown/html)
- `ADD_AUDIT_LOG_FOREIGN_KEY.sql` - Foreign key constraints
- `UPDATE_EVENT_CATEGORIES.sql` - Uppdatera event kategorier

### 📁 fixes/
Trigger-fixes, RLS policies och bugfixar. Använd när något behöver fixas.

**Huvudfiler:**
- `COMPLETE_FIX.sql` - ⭐ Komplett fix för audit log triggers
- `FIX_AUDIT_LOG_COLUMNS.sql` - Lägg till saknade kolumner
- `DISABLE_RLS_AUDIT_LOG.sql` - Stäng av RLS på audit log

**Alternativa lösningar:**
- `SIMPLE_TRIGGER_FIX.sql` - Enkel trigger utan extra kolumner
- `SECURITY_DEFINER_TRIGGER.sql` - Trigger med högre privilegier
- `FIX_RLS_AUDIT_LOG.sql` - Lägg till RLS policies
- `REMOVE_OLD_TRIGGER.sql` - Ta bort gamla triggers
- `TEMPORARY_DISABLE_TRIGGER.sql` - Stäng av triggers temporärt

### 📁 debug/
Diagnostic queries för att undersöka databasstrukturen.

**Filer:**
- `CHECK_TRIGGERS.sql` - Lista alla triggers på events-tabellen
- `CHECK_AUDIT_LOG_STRUCTURE.sql` - Visa audit log schema

## Användning

### Initial setup
1. Kör migrations i `/migrations/` ordningsföljd
2. Kör `COMPLETE_FIX.sql` från `/fixes/`
3. Kör `DISABLE_RLS_AUDIT_LOG.sql` om du får RLS-fel

### Debugging
Om något inte fungerar:
1. Kör scripts i `/debug/` för att se nuvarande struktur
2. Välj lämplig fix från `/fixes/`

