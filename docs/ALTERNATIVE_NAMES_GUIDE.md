# Guide: Alternativa namn för arrangörer

## Översikt

För att undvika att automatiskt skapa dubbletter av arrangörer under importen från Visit Varberg har vi lagt till stöd för **alternativa namn**. Detta är särskilt användbart när en arrangör har flera namn eller platser.

## Användningsfall

**Exempel:** Arena Varberg har flera olika namn beroende på lokal:
- Sparbankshallen
- Rotundan
- Arena Varberg Scene

Utan alternativa namn skulle systemet skapa tre separata arrangörer. Med alternativa namn matchar alla tre till samma arrangör.

## Hur det fungerar

### 1. Databas
En ny kolumn `alternative_names` (TEXT[]) har lagts till i `organizers`-tabellen. Denna är en array med alternativa namn som används vid matchning men visas inte publikt.

### 2. Matchningslogik
När Visit Varberg-scrapern körs matchar systemet nu på följande sätt:

1. **Exakt match på namn** - Kollar först mot `name`
2. **Exakt match på alternativa namn** - Kollar sedan mot `alternative_names[]`
3. **Fuzzy match på venue** - Kollar även alternativa namn med 80% similarity
4. **Contact match** - Email/telefon
5. **Auto-create** - Endast om inget matchar

### 3. Admin UI
I admin-panelen kan du nu:
- Lägga till alternativa namn när du skapar en ny arrangör
- Redigera alternativa namn för befintliga arrangörer
- Se alla alternativa namn som "taggar" som är lätta att ta bort

## Exempel på användning

### Steg 1: Kör migrationen
```sql
-- Kör i Supabase SQL Editor
\i database/migrations/ADD_ORGANIZER_ALTERNATIVE_NAMES.sql
```

### Steg 2: Lägg till alternativa namn i admin
1. Gå till **Organizers** → Välj arrangör (t.ex. Arena Varberg)
2. Klicka **Redigera**
3. Scrolla ner till **Alternativa namn**
4. Lägg till namn som:
   - Sparbankshallen
   - Rotundan
   - Arena Varberg Scene
5. **Spara**

### Steg 3: Testa med import
När du nu kör Visit Varberg-scrapern kommer events med dessa namn automatiskt matchas till "Arena Varberg" istället för att skapa nya arrangörer.

## Output exempel

**Före (utan alternativa namn):**
```
✨ Auto-created organizer: "Sparbankshallen" (ID: 66, pending review)
✨ Auto-created organizer: "Rotundan" (ID: 67, pending review)
```

**Efter (med alternativa namn):**
```
🔗 Matched "Sparbankshallen" via alternative name for organizer "Arena Varberg" (ID: 12)
🎯 Organizer match for "Hipp hipp live": ID 12 (exact, 100% confidence)
```

## Tips

1. **Case-insensitive** - Matchningen är inte känslig för stora/små bokstäver
2. **Trimmas automatiskt** - Mellanslag i början och slutet tas bort automatiskt
3. **Dubbletter förhindras** - Du kan inte lägga till samma alternativa namn två gånger
4. **Syns inte publikt** - Alternativa namn används endast internt för matchning

## Teknisk implementation

### Filer som ändrats:
- `database/migrations/ADD_ORGANIZER_ALTERNATIVE_NAMES.sql` - Migration
- `src/types/database.ts` - TypeScript types
- `src/lib/validations.ts` - Zod schema
- `src/lib/services/organizerMatcher.ts` - Matchningslogik
- `src/app/organizers/[id]/edit/page.tsx` - Edit UI
- `src/app/organizers/new/page.tsx` - Create UI

### Cache
Matchningsresultat cachas automatiskt för att förbättra prestanda vid stora importer.



