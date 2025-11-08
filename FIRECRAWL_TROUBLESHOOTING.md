# Firecrawl Troubleshooting

## Vanliga fel och lösningar

### ❌ "Failed to scrape URL with Firecrawl"

Detta är det vanligaste felet och kan ha flera orsaker:

#### 1. API-nyckel saknas eller är felaktig

**Symptom:**
```
Error: FIRECRAWL_API_KEY is not set in environment variables
```

**Lösning:**
1. Kontrollera att `.env.local` innehåller:
   ```env
   FIRECRAWL_API_KEY=fc-your-actual-api-key-here
   ```

2. Starta om dev-servern:
   ```bash
   # Stoppa servern (Ctrl+C)
   npm run dev
   ```

3. Verifiera att miljövariabeln laddas:
   ```bash
   # I en ny terminal
   echo $FIRECRAWL_API_KEY
   ```

#### 2. Firecrawl SDK-versionsproblem

**Symptom:**
```
scrapeResult.success is undefined
```

**Lösning:**
Kontrollera vilken version av Firecrawl SDK du har:

```bash
npm list @mendable/firecrawl-js
```

Om versionen är äldre än 1.0.0, uppdatera:

```bash
npm update @mendable/firecrawl-js
```

#### 3. API-format har ändrats

**Symptom:**
Firecrawl returnerar data men i ett annat format än förväntat.

**Debug-steg:**

1. Lägg till extra loggning i `organizer-crawler.ts`:

```typescript
const scrapeResult = await firecrawl.scrape(url, {
  formats: ['markdown', 'html'],
  onlyMainContent: true,
}) as any

// Debug: Log hela responsen
console.log('Full Firecrawl response:', JSON.stringify(scrapeResult, null, 2))
```

2. Kör importen igen och leta efter strukturen i loggen

3. Uppdatera koden baserat på den faktiska strukturen

#### 4. Rate Limit

**Symptom:**
```
Error: Firecrawl API rate limit exceeded
```

**Lösning:**
- Free tier: 500 requests/månad
- Vänta tills nästa månad eller uppgradera planen
- Kontrollera användning på: https://www.firecrawl.dev/dashboard

#### 5. Webbplatsen blockerar Firecrawl

**Symptom:**
Vissa webbplatser fungerar, andra inte.

**Lösning:**
Vissa webbplatser har striktare bot-detection. Prova:
1. Använd en annan URL från samma domän
2. Kontakta webbplatsens ägare för whitelist
3. Använd Firecrawl's premium tier som har bättre bot-hantering

## Testning steg-för-steg

### Steg 1: Verifiera miljövariabel

```bash
# Skapa/uppdatera .env.local
echo "FIRECRAWL_API_KEY=fc-your-key-here" >> .env.local

# Verifiera att filen finns
cat .env.local | grep FIRECRAWL
```

### Steg 2: Testa Firecrawl SDK isolerat

Skapa en testfil: `test-firecrawl.js`

```javascript
const FirecrawlApp = require('@mendable/firecrawl-js').default;

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY
});

async function test() {
  try {
    console.log('Testing Firecrawl...');
    const result = await firecrawl.scrape('https://example.com', {
      formats: ['markdown'],
      onlyMainContent: true
    });
    
    console.log('Success:', result.success);
    console.log('Markdown length:', result.markdown?.length);
    console.log('Full result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

test();
```

Kör:
```bash
FIRECRAWL_API_KEY=your-key-here node test-firecrawl.js
```

### Steg 3: Verifiera API-nyckel på Firecrawl Dashboard

1. Gå till https://www.firecrawl.dev/dashboard
2. Logga in
3. Gå till "API Keys"
4. Verifiera att nyckeln är aktiv
5. Kontrollera usage (ska vara < 500/månad för free tier)

## Alternativ lösning: Fallback till Cheerio

Om Firecrawl fortsätter att ha problem, kan du tillfälligt återgå till Cheerio:

```typescript
// I organizer-crawler.ts
export async function extractMetadataAndContent(url: string): Promise<CrawledData> {
  try {
    // Try Firecrawl first
    return await extractWithFirecrawl(url);
  } catch (firecrawlError) {
    console.warn('⚠️ Firecrawl failed, falling back to Cheerio:', firecrawlError);
    return await extractWithCheerio(url);
  }
}
```

## Debug-kommandon

### Testa Next.js miljövariabler
```bash
# I dev-konsolen
console.log('Env:', process.env.FIRECRAWL_API_KEY?.substring(0, 10) + '...')
```

### Testa från terminal
```bash
# API test med curl
curl -X POST 'https://api.firecrawl.dev/v0/scrape' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{
    "url": "https://example.com",
    "formats": ["markdown"]
  }'
```

## Kontakta support

Om inget fungerar:

1. **Firecrawl Support**
   - Email: support@firecrawl.dev
   - Discord: https://discord.gg/firecrawl
   - Documentation: https://docs.firecrawl.dev/

2. **Skapa ett GitHub issue**
   - Inkludera loggarna (utan API-nyckel!)
   - Beskriv exakt vad som händer
   - Inkludera miljö (Node version, OS, etc.)

## Förbättrad loggning

Om du behöver mer detaljerad loggning, uppdatera `organizer-crawler.ts`:

```typescript
export async function extractMetadataAndContent(url: string): Promise<CrawledData> {
  const startTime = Date.now();
  
  try {
    console.log('=== FIRECRAWL DEBUG START ===');
    console.log('URL:', url);
    console.log('API Key set:', !!process.env.FIRECRAWL_API_KEY);
    console.log('API Key prefix:', process.env.FIRECRAWL_API_KEY?.substring(0, 8));
    
    const scrapeResult = await firecrawl.scrape(url, {
      formats: ['markdown', 'html'],
      onlyMainContent: true,
    }) as any;
    
    console.log('Response time:', Date.now() - startTime, 'ms');
    console.log('Response keys:', Object.keys(scrapeResult || {}));
    console.log('Success:', scrapeResult?.success);
    console.log('=== FIRECRAWL DEBUG END ===');
    
    // ... rest of code
  } catch (error) {
    console.log('=== FIRECRAWL ERROR ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error details:', error);
    console.log('=== END ERROR ===');
    throw error;
  }
}
```

## Vanliga misstag

1. ❌ **Glömmer att starta om dev-servern** efter att ha lagt till `.env.local`
2. ❌ **Använder fel env-filnamn** (ska vara `.env.local` inte `.env`)
3. ❌ **API-nyckel har mellanslag** i början eller slutet
4. ❌ **Fel API-nyckel** (kopierat fel nyckel från dashboard)
5. ❌ **Node modules cache** - prova `rm -rf .next && npm run dev`

## Nästa steg

Om problemet kvarstår efter att ha provat ovanstående:

1. Skicka hela terminalloggen (ta bort API-nyckel!)
2. Inkludera innehållet från `.env.local` (ta bort faktisk nyckel!)
3. Beskriv vilka steg du har provat

