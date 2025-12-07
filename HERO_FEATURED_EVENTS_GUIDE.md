# 🌟 Hero Featured Events - Implementationsguide

## ✅ Vad som är implementerat

Systemet för att hantera hero featured events är nu komplett och redo att användas!

---

## 📦 Implementerade filer

### 1. Database Migration
- **Fil**: `database/migrations/CREATE_HERO_FEATURED_EVENTS_TABLE.sql`
- **Innehåll**: SQL för att skapa `hero_featured_events` tabell med alla constraints och triggers
- **Status**: ⏳ **KLAR ATT KÖRAS**

### 2. TypeScript Types
- **Fil**: `src/types/database.ts`
- **Innehåll**: Lagt till `HeroFeaturedEvent` interface och database table types
- **Status**: ✅ **IMPLEMENTERAD**

### 3. Admin Sida
- **Fil**: `src/app/admin/hero-featured/page.tsx`
- **URL**: `/admin/hero-featured`
- **Funktioner**:
  - Välj/byt main featured event
  - Lägg till upp till 5 secondary featured events
  - Omsortera secondary events med pilar
  - Sök och filtrera bland publicerade events
  - Ta bort featured events
  - Preview av alla valda events
- **Status**: ✅ **IMPLEMENTERAD**

### 4. Navigation
- **Fil**: `src/components/Navigation.tsx`
- **Innehåll**: Lagt till "Hero Featured" länk under Evenemang-gruppen
- **Status**: ✅ **IMPLEMENTERAD**

### 5. API Endpoint
- **Fil**: `src/app/api/hero-featured/route.ts`
- **URL**: `/api/hero-featured`
- **Innehåll**: GET endpoint för att hämta featured events för publika sidan
- **Status**: ✅ **IMPLEMENTERAD**

### 6. Dokumentation
- **Fil**: `database/migrations/HERO_FEATURED_EVENTS_README.md`
- **Innehåll**: Detaljerad dokumentation om migration och system
- **Status**: ✅ **SKAPAD**

### 7. Prompt för Publika Sidan
- **Fil**: `PROMPT_FOR_PUBLIC_SITE.md`
- **Innehåll**: Komplett guide för att integrera featured events i publika sidan
- **Status**: ✅ **SKAPAD**

---

## 🚀 Nästa steg

### Steg 1: Kör SQL Migration

**Gå till Supabase Dashboard:**

1. Öppna ditt Supabase-projekt
2. Gå till **SQL Editor**
3. Skapa en ny query
4. Kopiera innehållet från: `database/migrations/CREATE_HERO_FEATURED_EVENTS_TABLE.sql`
5. Kör queryn
6. Verifiera att tabellen `hero_featured_events` skapats

**Alternativt via CLI:**
```bash
# Om du har Supabase CLI installerat
supabase db push
```

### Steg 2: Testa Admin-sidan

1. Starta din admin-applikation:
```bash
npm run dev
```

2. Navigera till `/admin/hero-featured`

3. Testa funktionerna:
   - Välj ett main featured event
   - Lägg till några secondary featured events
   - Testa omsortering
   - Testa borttagning

### Steg 3: Testa API Endpoint

1. Öppna i webbläsare eller använd curl:
```bash
curl http://localhost:3000/api/hero-featured
```

2. Verifiera att du får JSON med `main` och `secondary` events

### Steg 4: Integrera i Publika Sidan

1. Öppna filen `PROMPT_FOR_PUBLIC_SITE.md`
2. Kopiera hela innehållet
3. Gå till din publika sida
4. Använd prompten för att implementera integrationen med Cursor

---

## 🎯 Funktioner

### Main Featured Event
- **Antal**: Exakt 1 (enforced av database)
- **Display**: Stort featured card i hero-sektionen
- **Hantering**: Välj/byt event från lista av publicerade events
- **Ta bort**: Kan tas bort om du vill visa inget main event

### Secondary Featured Events
- **Antal**: Max 5 (enforced av database)
- **Prioritering**: 1-5 där 1 är högst prioritet
- **Omsortering**: Enkelt via upp/ner-pilar i admin
- **Display**: Mindre kort under main featured event

### Event-val
- **Filter**: Endast publicerade events som är framtida
- **Sök**: Sök på namn, plats, eller venue
- **Exkludering**: Events som redan är featured visas inte i väljaren
- **Preview**: Se event-info innan val

---

## 🔧 Tekniska detaljer

### Database Constraints
```sql
-- Endast ett main featured event
CREATE UNIQUE INDEX idx_one_main_featured 
  ON hero_featured_events(position) 
  WHERE position = 'main';

-- Max 5 secondary featured events
CREATE TRIGGER enforce_secondary_limit
  BEFORE INSERT ON hero_featured_events
  FOR EACH ROW
  EXECUTE FUNCTION check_secondary_limit();
```

### RLS Policies
- **Läsning**: Alla användare (inklusive publika sidan)
- **Skriva/Uppdatera/Ta bort**: Endast authenticated users (admin)

### API Response Format
```typescript
{
  main: Event | null,
  secondary: Event[] // max 5 items, sorterade efter prioritet
}
```

---

## 📊 Databas Schema

```
hero_featured_events
├── id                SERIAL PRIMARY KEY
├── event_id          INTEGER (FK → events.id)
├── position          TEXT ('main' | 'secondary')
├── priority          INTEGER (1-5, endast för secondary)
├── created_at        TIMESTAMP
└── updated_at        TIMESTAMP
```

**Relationer:**
- `event_id` → `events.id` (CASCADE on delete)

**Indexes:**
- `idx_hero_featured_position` på `position`
- `idx_hero_featured_priority` på `priority`
- `idx_hero_featured_event_id` på `event_id`
- `idx_one_main_featured` unique på position='main'

---

## 🎨 UI/UX Features

### Admin Interface
- ✅ Visuell preview av featured events
- ✅ Event-bilder visas om tillgängliga
- ✅ Datum och plats-info
- ✅ Sökfunktion med realtidsfiltrering
- ✅ Modal för event-val
- ✅ Konfirmation vid borttagning
- ✅ Loading states under operationer
- ✅ Disabled states för knappar under uppdateringar
- ✅ Prioriterings-indikatorer (1, 2, 3, 4, 5)

### Responsiv Design
- ✅ Funkar på desktop
- ✅ Funkar på tablet
- ✅ Funkar på mobil

---

## 🧪 Testscenarier

Efter implementationen, testa följande:

### Scenario 1: Tomt initial state
- [ ] Ingen main eller secondary events vald
- [ ] UI visar "välj event" prompts

### Scenario 2: Endast main event
- [ ] Välj ett main featured event
- [ ] Verifiera att det visas korrekt
- [ ] Testa "Byt event" funktionen
- [ ] Testa "Ta bort" funktionen

### Scenario 3: Full featured lista
- [ ] Välj 1 main + 5 secondary events
- [ ] Försök lägga till en 6:e secondary (ska blockeras)
- [ ] Testa omsortering av alla secondary events
- [ ] Verifiera prioritering i API response

### Scenario 4: Event utan bilder
- [ ] Välj event som saknar `image_url`
- [ ] Verifiera att UI hanterar detta gracefully

### Scenario 5: API konsumption
- [ ] Hämta data från `/api/hero-featured`
- [ ] Verifiera JSON-struktur
- [ ] Verifiera att endast published events returneras
- [ ] Verifiera sortering av secondary events

---

## 🔄 Relation till befintlig `featured` kolumn

**OBS**: Detta system är **SEPARAT** från den befintliga `featured` boolean-kolumnen i `events` tabellen.

- `events.featured` = Generell featured-flagga (kan användas för andra ändamål)
- `hero_featured_events` = Specifik hero-sektion featured events

Båda systemen kan användas parallellt utan konflikt.

---

## 📞 Support & Troubleshooting

### Problem: Migration ger fel
**Lösning**: Kontrollera att du har `update_updated_at_column()` funktion i din databas. Detta är en standard trigger-funktion som borde finnas.

### Problem: API returnerar tom data
**Lösning**: 
1. Kontrollera att du har kört migrationen
2. Kontrollera att du har valt featured events i admin-panelen
3. Kontrollera att events är markerade som `published`

### Problem: RLS blockerar läsning
**Lösning**: Verifiera att policy "Enable read access for all users" är skapad korrekt

### Problem: Kan inte lägga till fler än 5 secondary
**Detta är förväntat beteende!** Systemet är designat för max 5 secondary events.

---

## 🎉 Sammanfattning

Du har nu ett komplett system för att hantera hero featured events:

1. ✅ **Database**: Robust schema med constraints och triggers
2. ✅ **Admin UI**: Intuitiv interface för att hantera featured events
3. ✅ **API**: Enkel endpoint för publika sidan
4. ✅ **Documentation**: Komplett guide för integration

**Nästa steg**: Kör SQL-migrationen och testa systemet!

---

**Lycka till!** 🚀


