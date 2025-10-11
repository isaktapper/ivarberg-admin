# Quick Start Guide

Snabbguide för att komma igång med projektet.

## 🚀 Setup (5 minuter)

### 1. Installera dependencies
```bash
npm install
```

### 2. Konfigurera environment
Skapa `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Kör migrations
Gå till Supabase SQL Editor och kör (i ordning):
1. `database/migrations/SCRAPER_LOGS_TABLE.sql`
2. `database/migrations/ADD_QUALITY_COLUMNS.sql`
3. `database/fixes/COMPLETE_FIX.sql`
4. `database/fixes/DISABLE_RLS_AUDIT_LOG.sql`

### 4. Starta utvecklingsservern
```bash
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000)

## 📁 Var hittar jag...?

| Vad letar du efter? | Var finns det? |
|---------------------|----------------|
| Setup-guider | `/docs/` |
| SQL migrations | `/database/migrations/` |
| Bugfixar | `/database/fixes/` |
| Scraper-kod | `/src/lib/scrapers/` |
| Event-sidor | `/src/app/events/` |
| Database types | `/src/types/database.ts` |

## 🔧 Vanliga problem

### "rejected" status-fel
```bash
# Kör i Supabase SQL Editor:
/database/fixes/COMPLETE_FIX.sql
```

### RLS blockerar
```bash
# Kör i Supabase SQL Editor:
/database/fixes/DISABLE_RLS_AUDIT_LOG.sql
```

### Kolumn saknas
```bash
# Kör i Supabase SQL Editor:
/database/fixes/FIX_AUDIT_LOG_COLUMNS.sql
```

## 📚 Mer information

- **Fullständig dokumentation**: Se `README.md`
- **Feature-guider**: Se `/docs/`
- **SQL-dokumentation**: Se `/database/README.md`

## 🎯 Nästa steg

1. ✅ Skapa första event manuellt
2. ✅ Konfigurera scraper för Arena Varberg
3. ✅ Testa event-granskning
4. ✅ Sätt upp scraper-schedule (valfritt)

