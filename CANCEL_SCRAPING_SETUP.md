# Cancel Scraping Feature - Setup Guide

## 🎯 Översikt

Implementerat en funktion för att avbryta pågående scraping processer direkt från admin-gränssnittet.

## ✨ Funktioner

### 1. Cancel Button
- ✅ Visas endast när det finns pågående scraping processer
- ✅ Röd färg för att indikera avbrytning
- ✅ Bekräftelse innan avbrytning
- ✅ Loading state under avbrytning

### 2. Running Process Detection
- ✅ Automatisk upptäckt av pågående processer
- ✅ Real-time uppdatering var 5:e sekund
- ✅ Visar antal och namn på pågående processer
- ✅ Orange varningstext när processer kör

### 3. Database Support
- ✅ Ny 'cancelled' status för scraper_logs
- ✅ API endpoint för att avbryta processer
- ✅ Uppdaterad UI för att visa cancelled status

## 📁 Implementerade Filer

### 1. Database Migration
**[database/migrations/ADD_CANCELLED_STATUS.sql](database/migrations/ADD_CANCELLED_STATUS.sql)**

**Kör migrationen:**
```bash
# Logga in på Supabase Dashboard → SQL Editor
# Kopiera och kör innehållet från filen
```

### 2. API Endpoint
**[src/app/api/scrape/cancel/route.ts](src/app/api/scrape/cancel/route.ts)**

- `GET /api/scrape/cancel` - Hämta pågående processer
- `POST /api/scrape/cancel` - Avbryt alla pågående processer

### 3. UI Updates
**[src/app/scrapers/page.tsx](src/app/scrapers/page.tsx)**

- Cancel button som visas när processer kör
- Running process indicator
- Uppdaterad status handling för 'cancelled'

### 4. Type Updates
**[src/types/database.ts](src/types/database.ts)**

- Lagt till 'cancelled' i ScraperLogStatus type

## 🚀 Användning

1. **Kör databas migrationen** (se ovan)
2. **Starta applikationen**
3. **Gå till Scrapers-sidan**
4. **Starta en scraping process**
5. **Klicka på "Avbryt pågående" knappen** som visas när processer kör

## 🔧 Tekniska Detaljer

### Cancel Logic
- Uppdaterar alla 'running' processer till 'cancelled' status
- Sätter completed_at timestamp
- Lägger till "Process cancelled by user" i errors array

### UI Behavior
- Cancel button visas endast när runningProcesses.length > 0
- Automatisk refresh var 5:e sekund
- Real-time updates via Supabase subscriptions
- Bekräftelse dialog innan avbrytning

### Error Handling
- Graceful error handling i API
- User feedback vid fel
- Console logging för debugging

## ⚠️ Viktiga Anteckningar

1. **Database Migration**: Måste köras innan funktionen fungerar
2. **Real-time Updates**: Fungerar via Supabase subscriptions
3. **Process Detection**: Pollar var 5:e sekund för nya processer
4. **Status Updates**: 'cancelled' processer visas med grå färg och kvadrat-ikon

## 🧪 Testning

1. Starta en scraping process
2. Verifiera att cancel button visas
3. Klicka på cancel button
4. Verifiera att processen markeras som 'cancelled'
5. Verifiera att cancel button försvinner
