# Quick Reference - Ivarberg Admin

## 🚀 Starta projektet

```bash
npm run dev
# Öppna http://localhost:3000
```

## 🤖 Kör scrapers

### Via Admin UI
```
Gå till /scrapers → Klicka "Kör scraper" på önskad scraper
```

### Via API
```bash
# Alla scrapers
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json"

# Specifik scraper
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"scrapers": ["Visit Varberg"]}'
```

## 📊 Scraper-status

| Scraper | Events | Quality | Auto-publish |
|---------|--------|---------|--------------|
| **Arena Varberg** | ~20-50 | 85-100 | ✅ 90% |
| **Varbergs Teater** | ~30-80 | 90-100 | ✅ 95% |
| **Visit Varberg** | ~300-500 | 95-100 | ✅ 85% |

## 🎯 Event Quality Scores

| Score | Status | Vad händer |
|-------|--------|------------|
| **≥ 80** | `published` | ✅ Auto-publiceras (betrodda källor) |
| **50-79** | `pending_approval` | ⏳ Manuell granskning |
| **< 50** | `draft` | 📝 Allvarliga problem |

## 📁 Viktiga sidor

```
/events              - Lista alla events
/events/review       - Granska events (pending_approval)
/events/duplicates   - Se detekterade dubbletter
/events/statistics   - Statistik och export
/scrapers            - Scraper management
/organizers          - Organizer management
```

## 🗃️ Database Setup

### Initial setup (kör i ordning):
```sql
1. database/migrations/SCRAPER_LOGS_TABLE.sql
2. database/migrations/ADD_QUALITY_COLUMNS.sql
3. database/migrations/CREATE_DUPLICATE_EVENT_LOGS_TABLE.sql
4. database/fixes/COMPLETE_FIX.sql
5. database/fixes/DISABLE_RLS_AUDIT_LOG.sql
```

### Skapa organizers:
```
ID 5: Arena Varberg
ID 6: Varbergs Teater  
ID 7: Visit Varberg (skapa via admin UI)
```

## 🔍 Duplicate Detection

- **URL Match**: 100% accuracy (exakt URL)
- **Fuzzy Match**: 85%+ similarity (samma namn, datum, venue)
- **Logs**: Alla dubbletter sparas i `/events/duplicates`

## 📊 Performance Metrics

### Visit Varberg Scraper
- **Events**: ~500 events
- **AI-anrop**: ~60 (88% mindre via caching)
- **Tid**: 30-45 sekunder
- **Kostnad**: ~$0.06 per scrape

### Smart Caching
```
"Bockstensmannen" (52 occasions) = 1 AI-anrop
"Fish & Ships" (52 occasions) = 1 AI-anrop
"Do a LongwaveRadioRun" (60 occasions) = 1 AI-anrop
```

## 🐛 Troubleshooting

### Events auto-publiceras inte
→ Kolla att organizerId finns i TRUSTED_ORGANIZERS
→ `src/lib/services/eventQualityChecker.ts:15`

### Duplicates sparas inte
→ Kör migration: `CREATE_DUPLICATE_EVENT_LOGS_TABLE.sql`
→ Kör: `ALTER TABLE duplicate_event_logs DISABLE ROW LEVEL SECURITY;`

### Slugs har fel format
→ Kolla `src/lib/event-id-generator.ts`
→ Bör vara: `eventnamn` (utan source-prefix)

### "Missing required fields"
→ JSON-parsingen misslyckades
→ Kolla regex i `visit-varberg-scraper.ts:103`

## 📚 Dokumentation

- **Master Guide**: `docs/SCRAPER_MASTER_GUIDE.md`
- **Test Guide**: `docs/TEST_INSTRUCTIONS.md`
- **Improvements**: `docs/VISIT_VARBERG_IMPROVEMENTS.md`
- **Full Impl**: `docs/IMPLEMENTATION_SUMMARY.md`

## 🎯 Next Steps

1. ✅ Skapa organizer "Visit Varberg" (ID: 7)
2. ✅ Kör database migration för duplicates
3. ✅ Testa scraping: `curl -X POST http://localhost:3000/api/scrape`
4. ✅ Granska duplicates i `/events/duplicates`
5. ✅ Verifiera auto-publicering fungerar

---

**Quick Tip:** Använd `docs/SCRAPER_MASTER_GUIDE.md` när du skapar nya scrapers! 🚀

