# Event-statistik med Excel-export

## Översikt
Komplett statistiksida som visar granskningshistorik för events med möjlighet att filtrera och exportera till Excel.

## ✅ Implementerat

### 1. Database Schema (Redan kört i Supabase)
- `event_audit_log` tabell för att logga alla ändringar
- Automatiska triggers för att spåra statusändringar
- Index för snabb filtrering och sökning

### 2. API Endpoints

#### Statistics API
**Path:** `/api/admin/statistics`
- Hämtar audit log med filter
- Beräknar statistik (totalt, auto-publicerade, godkända, etc.)
- Grupperar per organisatör och kategori

**Query parameters:**
- `startDate` - Filtrera från datum
- `endDate` - Filtrera till datum
- `action` - Filtrera på åtgärd (auto_published, approved, rejected, edited)
- `organizerId` - Filtrera på organisatör

#### Excel Export API
**Path:** `/api/admin/statistics/export`
- Exporterar all data till .xlsx format
- Automatiskt filnamn med datum
- Innehåller alla kolumner från audit log

### 3. Frontend Sida
**Path:** `/events/statistics`

#### Features:
- **Statistik-kort** med nyckeltal:
  - Totalt granskade events
  - Auto-publicerade (antal + procent)
  - Manuellt godkända
  - Genomsnittlig kvalitetspoäng

- **Filter:**
  - Från/till datum
  - Åtgärd (alla, auto-publicerade, godkända, nekade, redigerade)

- **Granskningshistorik:**
  - Tabellvy med alla ändringar
  - Färgkodade åtgärdsbadges
  - Kvalitetspoäng med färgkodning
  - Sorterad på datum (senaste först)

- **Excel-export:**
  - Knapp för att ladda ner hela datasetet
  - Automatiskt filnamn: `event-statistik-YYYY-MM-DD.xlsx`

### 4. Navigation
- Ny länk i sidebar: "Statistik" med BarChart3-ikon
- Placerad mellan "Granska Events" och "Scrapers"

## Användning

### Visa statistik
1. Navigera till "Statistik" i sidebaren
2. Se översikt av granskningsaktivitet
3. Använd filter för att begränsa data

### Exportera till Excel
1. Klicka på "Exportera till Excel"-knappen
2. Excel-fil laddas ner automatiskt
3. Öppna i Excel/Google Sheets

### Filtrera data
```typescript
// Exempel på filter via API
GET /api/admin/statistics?startDate=2025-01-01&endDate=2025-01-31&action=auto_published
```

## Audit Log Åtgärder

| Åtgärd | Beskrivning | Färg |
|--------|-------------|------|
| `created` | Event skapades | Grå |
| `auto_published` | Auto-publicerad av systemet | Grön |
| `approved` | Manuellt godkänd | Blå |
| `rejected` | Nekad/avböjd | Röd |
| `edited` | Redigerad | Gul |

## Automatisk Loggning

Triggers i databasen loggar automatiskt:

1. **Vid INSERT (ny event):**
   - Loggar `created` action
   - Sparar kvalitetspoäng
   - Markerar `changed_by` som 'system'

2. **Vid UPDATE (statusändring):**
   - Loggar korrekt action baserat på ny status
   - Sparar gammal och ny status
   - Sparar ändringar i JSONB (vad som ändrades)
   - Använder `current_user` eller 'system'

## Excel-export Format

Exporterad Excel-fil innehåller:
- **Datum** - När ändringen gjordes
- **Event** - Eventnamn
- **Åtgärd** - Typ av ändring (svenska)
- **Gammal status** - Tidigare status
- **Ny status** - Uppdaterad status
- **Kvalitetspoäng** - Score 0-100
- **Ändrad av** - Email eller 'system'
- **Arrangör** - Organisatörens namn
- **Plats** - Venue name
- **Kategori** - Event kategori
- **Ändringar** - JSON med detaljerade ändringar

## Statistik-beräkningar

### Procent auto-publicerade
```typescript
const autoPublishRate = (autoPublished / total) * 100
```

### Genomsnittlig kvalitetspoäng
```typescript
const avgScore = total > 0 
  ? Math.round(sum(quality_scores) / total)
  : 0
```

### Gruppering per organisatör
```typescript
stats.byOrganizer[orgId] = (stats.byOrganizer[orgId] || 0) + 1
```

## Felsökning

### Excel-filen laddas inte ner
1. Kontrollera att API:et returnerar data
2. Kolla nätverkstab i DevTools
3. Verifiera att xlsx-paketet är installerat

### Statistik visas inte
1. Kontrollera att audit log-tabellen finns i Supabase
2. Verifiera att triggers är aktiva
3. Kolla att events faktiskt har granskats (audit log har data)

### Filter fungerar inte
1. Datumformat ska vara YYYY-MM-DD
2. Action-filter är case-sensitive
3. Kontrollera API query i nätverkstab

## SQL Queries för Analys

### Vanligaste kvalitetsproblem
```sql
SELECT 
  quality_issues,
  COUNT(*) as count
FROM event_audit_log
WHERE quality_issues IS NOT NULL
GROUP BY quality_issues
ORDER BY count DESC
LIMIT 10;
```

### Kvalitet per organisatör
```sql
SELECT 
  e.organizer_id,
  o.name,
  AVG(eal.quality_score) as avg_score,
  COUNT(*) FILTER (WHERE eal.action = 'auto_published') as auto_count,
  COUNT(*) as total_count
FROM event_audit_log eal
JOIN events e ON e.event_id = eal.event_id
JOIN organizers o ON o.id = e.organizer_id
GROUP BY e.organizer_id, o.name
ORDER BY avg_score DESC;
```

### Granskningsaktivitet per dag
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_actions,
  COUNT(*) FILTER (WHERE action = 'auto_published') as auto_published,
  COUNT(*) FILTER (WHERE action = 'approved') as manually_approved
FROM event_audit_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Nästa steg (valfritt)

### Dashboard-widgets
Lägg till statistik-widgets på huvudsidan:
```typescript
// På dashboard-sidan
const stats = await fetch('/api/admin/statistics?startDate=' + last30Days);
```

### Email-rapporter
Skicka veckovis rapport via email med statistik

### Real-time updates
Använd Supabase subscriptions för att uppdatera statistik i realtid:
```typescript
const subscription = supabase
  .channel('audit-log-changes')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'event_audit_log' },
    () => fetchStatistics()
  )
  .subscribe();
```

### Grafiska diagram
Lägg till Chart.js eller Recharts för visualisering:
- Linjediagram för granskningar över tid
- Pajdiagram för fördelning av åtgärder
- Stapeldiagram för kvalitetspoäng per kategori

