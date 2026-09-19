/**
 * Sidhämtning via Firecrawl - används av Firecrawl-varianterna av scrapers
 * vars källor blockerar GitHub Actions IP-adresser (varberg.se, visitvarberg.se).
 *
 * Firecrawl hämtar via sina egna proxyer och returnerar samma HTML/JSON som
 * en direkt fetch skulle gjort. 1 credit ≈ 1 sidhämtning.
 */
import Firecrawl from '@mendable/firecrawl-js';

let firecrawl: Firecrawl | null = null;
let pageFetchCount = 0;

function getFirecrawl(): Firecrawl {
  if (!process.env.FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY saknas i miljön');
  }
  if (!firecrawl) {
    firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  }
  return firecrawl;
}

/** Antal sidhämtningar via Firecrawl denna körning (≈ credits förbrukade) */
export function getFirecrawlFetchCount(): number {
  return pageFetchCount;
}

// Gratisplanen tillåter 10 anrop/minut. Håll oss under det med ett minsta
// intervall mellan anrop, och vänta ut resetten om vi ändå får 429.
const MIN_INTERVAL_MS = 6500;
const MAX_ATTEMPTS = 4;
let lastCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pace(): Promise<void> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

/** Läser "retry after 19s" ur Firecrawls 429-meddelande, annars 60s */
function retryAfterMs(message: string): number {
  const m = message.match(/retry after (\d+)s/i);
  return m ? (parseInt(m[1], 10) + 1) * 1000 : 60_000;
}

/**
 * Firecrawl kan ge tillfälliga 500-fel och 429 (rate limit). Vid 429 väntar vi
 * tills gränsen nollställts, annars kort backoff. Ger upp efter MAX_ATTEMPTS.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await pace();
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const status = (error as { status?: number }).status;
      const isRateLimit = status === 429 || /rate limit/i.test(msg);
      if (attempt === MAX_ATTEMPTS) break;

      const wait = isRateLimit ? retryAfterMs(msg) : 3000 * attempt;
      console.warn(
        `  ⚠️ Firecrawl-fel för ${label} (${msg.substring(0, 100)}), försök ${attempt}/${MAX_ATTEMPTS}, väntar ${Math.round(wait / 1000)}s...`
      );
      await sleep(wait);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Hämta en sidas fulla HTML via Firecrawl (motsvarar fetch + response.text()) */
export async function fcFetchHTML(url: string): Promise<string> {
  // rawHtml = orörd HTML inkl. <script>-taggar - krävs eftersom vissa scrapers
  // (Visit Varberg) läser eventdata ur inline-JSON i script-taggar.
  // 'html'-formatet är rensat och saknar dessa.
  const result = await withRetry(url, () =>
    getFirecrawl().scrape(url, {
      formats: ['rawHtml'],
      onlyMainContent: false,
      timeout: 60000,
    })
  );
  pageFetchCount++;

  const html = (result as { rawHtml?: string }).rawHtml;
  if (!html) {
    throw new Error(`Firecrawl returnerade ingen HTML för ${url}`);
  }
  return html;
}

/**
 * Gör ett POST-anrop med JSON-body via Firecrawls webbläsare.
 * Sidan pageUrl laddas först, sedan körs fetch-anropet same-origin därifrån -
 * så anropet kommer från Firecrawls IP och ser ut som ett vanligt XHR-anrop.
 * Returnerar svaret som text (anroparen parsar själv).
 */
export async function fcPostForText(
  pageUrl: string,
  apiUrl: string,
  body: unknown
): Promise<string> {
  const script = `
(async () => {
  const res = await fetch(${JSON.stringify(apiUrl)}, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: ${JSON.stringify(JSON.stringify(body))}
  });
  return await res.text();
})()
`;

  const result = await withRetry(`POST ${apiUrl.substring(0, 60)}`, () =>
    getFirecrawl().scrape(pageUrl, {
      formats: ['html'],
      onlyMainContent: false,
      actions: [{ type: 'executeJavascript', script }],
      timeout: 60000,
    })
  );
  pageFetchCount++;

  const returns = (result as { actions?: { javascriptReturns?: Array<{ value: unknown }> } })
    .actions?.javascriptReturns;
  const value = returns?.[0]?.value;

  if (typeof value === 'string') return value;
  if (value != null) return JSON.stringify(value);
  throw new Error(`Firecrawl JS-action gav inget svar för POST mot ${apiUrl}`);
}
