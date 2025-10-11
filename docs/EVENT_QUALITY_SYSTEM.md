# Automatisk Kvalitetsbedömning & Publicering

## Översikt
Systemet bedömer automatiskt kvaliteten på scrapade events och bestämmer om de ska:
- ✅ **Auto-publiceras** (hög kvalitet från betrodda källor)
- ⏳ **Gå till manuell granskning** (tveksam kvalitet)
- 📝 **Sparas som draft** (undermålig kvalitet)

## Beslutlogik

### Status-beslut
- **Score ≥ 80 + Betrodd källa** → `published` (auto-publicerad)
- **Score ≥ 50** → `pending_approval` (manuell granskning)
- **Score < 50** → `draft` (behöver fixas)

### Betrodda organisatörer
- Arena Varberg (ID: 5)
- Varbergs Teater (ID: 6)

## Kvalitetspoäng (0-100)

### Avdrag
- **-30p** - Titel saknas eller för kort (<5 tecken)
- **-30p** - Beskrivning saknas
- **-20p** - Beskrivning för kort (<50 tecken)
- **-30p** - Datum saknas
- **-15p** - Eventet är i det förflutna
- **-15p** - Bild saknas
- **-10p** - Plats saknas eller för kort (<3 tecken)
- **-50p** - Flaggat av innehållskontroll (OpenAI Moderation API)

### Exempel
```
Event med allt:          100 poäng → ✅ published (om betrodd källa)
Event utan bild:         85 poäng  → ⏳ pending_approval
Event utan beskrivning:  70 poäng  → ⏳ pending_approval
Event utan bild + kort beskrivning: 45 poäng → 📝 draft
```

## Innehållskontroll (Gratis)

Använder **OpenAI Moderation API** för att flagga:
- Hatiskt innehåll
- Hotfullt innehåll
- Trakassering
- Olämpligt sexuellt innehåll
- Våldsamt innehåll
- Självskadande beteende

Om innehållet flaggas: -50 poäng och eventet kan inte auto-publiceras.

## Implementation

### 1. Database Schema
Kör SQL-migration: `ADD_QUALITY_COLUMNS.sql`

```sql
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS quality_score INTEGER,
ADD COLUMN IF NOT EXISTS quality_issues TEXT,
ADD COLUMN IF NOT EXISTS auto_published BOOLEAN DEFAULT FALSE;
```

### 2. Nya filer
- `src/lib/services/eventQualityChecker.ts` - Kvalitetsbedömning
- Updated: `src/lib/services/event-importer.ts` - Integration

### 3. Nya fält i Event
```typescript
quality_score?: number      // 0-100
quality_issues?: string     // "Bild saknas; Beskrivning för kort"
auto_published?: boolean    // true om auto-publicerad
```

## Användning

### Scraping med kvalitetsbedömning
Scraping körs som vanligt - kvalitetsbedömningen sker automatiskt:

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"scraperId": "arena-varberg"}'
```

### Förväntad output
```
📦 Importerar 50 events...
✓ Efter deduplicering: 48 unika events

🤖 Startar AI-kategorisering och kvalitetsbedömning...
  ✅ Björn Gustafsson Live...
     Kategori: Scen | Status: published | Score: 100/100
     
  ⏳ Jazzkonsert med Lisa Nilsson...
     Kategori: Scen | Status: pending_approval | Score: 85/100
     Problem: Bild saknas
     
  📝 Event utan fullständig data...
     Kategori: Okategoriserad | Status: draft | Score: 40/100
     Problem: Beskrivning saknas, Bild saknas

✓ Kategorisering och kvalitetsbedömning klar: 48 events

💾 Sparar till databas...

📊 Statistik:
  - 35 auto-publicerade
  - 10 behöver granskning
  - 3 markerade som draft
  - Genomsnittlig kvalitetspoäng: 87/100

✅ Import klar!
```

## Filtrera events i admin

### Endast events som behöver granskas
```typescript
const needsReview = events
  .filter(e => e.status === 'pending_approval')
  .sort((a, b) => (a.quality_score || 0) - (b.quality_score || 0));
```

### Auto-publicerade events
```typescript
const autoPublished = events
  .filter(e => e.auto_published === true);
```

### Events med kvalitetsproblem
```typescript
const withIssues = events
  .filter(e => e.quality_issues && e.quality_issues.length > 0)
  .map(e => ({
    ...e,
    issues: e.quality_issues.split('; ')
  }));
```

## Justera tröskelvärden

### Ändra poängavdrag
I `eventQualityChecker.ts`:
```typescript
// Gör bilden mindre viktig
if (!event.image_url) {
  score -= 10; // Istället för 15
  issues.push('Bild saknas');
}
```

### Ändra beslutsgränser
```typescript
// Lägre krav för auto-publicering
if (score >= 75 && isTrusted && contentCheck.safe) {
  status = 'published';
  autoPublished = true;
}
```

### Lägg till fler betrodda organisatörer
```typescript
const TRUSTED_ORGANIZERS = [5, 6, 7]; // Lägg till ID 7
```

## Kostnad

- **OpenAI Moderation API**: Gratis ✅
- **Ingen extra kostnad** utöver befintlig AI-kategorisering

## Fördelar

1. **Automatisering** - Högkvalitativa events publiceras direkt
2. **Tidsbesparing** - Mindre manuell granskning
3. **Kvalitetskontroll** - Undermåliga events stoppas automatiskt
4. **Säkerhet** - Innehållskontroll med OpenAI Moderation API
5. **Transparens** - Tydlig poäng och problemlista för varje event
6. **Flexibilitet** - Enkelt att justera tröskelvärden

## Övervakning

### Kvalitetsstatistik per scraper
Spåra genomsnittlig kvalitetspoäng för att upptäcka försämringar:

```sql
SELECT 
  organizer_id,
  AVG(quality_score) as avg_score,
  COUNT(*) FILTER (WHERE auto_published = true) as auto_published_count,
  COUNT(*) FILTER (WHERE status = 'pending_approval') as needs_review_count,
  COUNT(*) FILTER (WHERE status = 'draft') as draft_count
FROM events
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY organizer_id;
```

### Vanligaste kvalitetsproblem
```sql
SELECT 
  quality_issues,
  COUNT(*) as count
FROM events
WHERE quality_issues IS NOT NULL
GROUP BY quality_issues
ORDER BY count DESC
LIMIT 10;
```

