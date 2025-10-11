# AI-kategorisering Setup

## Översikt
Detta system använder OpenAI (GPT-4o-mini) för att automatiskt kategorisera events efter scraping och deduplicering.

## Kostnad
- **~3-4 öre per scrape-körning** (baserat på genomsnittligt antal events)
- Model: `gpt-4o-mini` (billigast och snabbast)
- Endast unika events kategoriseras (efter deduplicering)

## Kategorier (11 st)
1. **Scen** - Teater, musikal, standup, konserter, livemusik
2. **Nattliv** - Klubb, DJ, pub, nattklubb, afterwork
3. **Sport** - Matcher, träning, löpning, idrottsevenemang
4. **Konst** - Utställningar, galleri, konstverkstad, kulturhus
5. **Föreläsningar** - Talks, presentationer, workshops, seminarier
6. **Barn & Familj** - Barnteater, sagostund, familjeaktiviteter
7. **Mat & Dryck** - Restaurangevenemang, matfestival, matmarknad, vinprovning
8. **Jul** - Julmarknader, julgranständning, lucia, julkonserter
9. **Film & bio** - Biografföreställningar, filmvisningar, filmklubbar
10. **Djur & Natur** - Djurparker, naturvandringar, fågelskådning, utomhusaktiviteter
11. **Guidade visningar** - Stadsvandringar, museibesök, konstrundan, guidade turer

## Environment Variable

Lägg till i `.env.local`:

```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxx
```

Hämta API-nyckel från: https://platform.openai.com/api-keys

## Så här fungerar det

### 1. Scraping
- Scrapers (Arena Varberg, Varbergs Teater) samlar in events
- Alla events får kategori: `'Okategoriserad'`

### 2. Deduplicering
- Events dedupliceras baserat på: `namn + datum + plats`
- Sparar pengar genom att undvika AI-anrop för dubbletter

### 3. AI-kategorisering
- **Endast unika events** skickas till OpenAI
- Rate limit: 500ms mellan anrop
- Fallback: `'Scen'` om AI misslyckas

### 4. Databas
- Kategoriserade events sparas till Supabase

## Implementation

### Filer som modifierats:
- `src/types/database.ts` - Uppdaterade kategorier
- `src/lib/services/aiCategorizer.ts` - **NY** - OpenAI kategoriseringstjänst
- `src/lib/services/event-importer.ts` - Deduplicering + AI-integration
- `src/lib/scrapers/arena-varberg-scraper.ts` - Sätter 'Okategoriserad'
- `src/lib/scrapers/varbergs-teatern-scraper.ts` - Sätter 'Okategoriserad'

## Testa

```bash
# Starta dev-servern
npm run dev

# Kör scraper via API
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"scraperId": "arena-varberg"}'
```

### Förväntad output:
```
📦 Importerar 50 events...
✓ Efter deduplicering: 48 unika events

🤖 Startar AI-kategorisering...
  🤖 AI-kategoriserar: Fotbollsmatch Varberg mot Häcken...
     → Sport
  🤖 AI-kategoriserar: Jazzkonsert med Lisa Nilsson...
     → Scen
  🤖 AI-kategoriserar: Barnteater - Tre Små Grisar...
     → Barn & Familj
  ...
✓ Kategorisering klar: 48 events

💾 Sparar till databas...
✅ Import klar!
```

## Felsökning

### "OpenAI API key not found"
- Kontrollera att `OPENAI_API_KEY` finns i `.env.local`
- Starta om dev-servern efter att ha lagt till env-variabel

### "AI kategorisering misslyckades"
- Systemet använder automatiskt fallback: `'Scen'`
- Kontrollera OpenAI API-status: https://status.openai.com/

### Dubbletter importeras inte
- Detta är **avsiktligt** - deduplicering baserat på namn+datum+plats
- Endast första instansen av varje event importeras

## Kostnadsoptimering

- ✅ Deduplicering före AI-anrop
- ✅ Använder `gpt-4o-mini` (billigaste modellen)
- ✅ Max 20 tokens per svar
- ✅ Trunkerar beskrivningar till 300 tecken
- ✅ Rate limiting för att undvika överbelastning

**Estimerad kostnad:**
- 50 events → ~48 unika → ~0.04 SEK
- 100 events → ~95 unika → ~0.08 SEK

