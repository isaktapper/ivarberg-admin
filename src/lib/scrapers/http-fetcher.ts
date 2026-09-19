/**
 * Direkt sidhämtning för scrapers - byggd för att klara de blockeringar
 * GitHub Actions-IP:n möter, så att Firecrawl bara behövs som sista utväg.
 *
 * Vad den gör utöver vanlig fetch():
 *  - Webbläsarlika headers (många WAF:ar ger bot-UA + datacenter-IP lågt förtroende)
 *  - Cookie-jar per host. visitvarberg.se/varberg.se ligger bakom F5 (SiteVisionLTM)
 *    som sätter cookies och redirectar tillbaka - utan cookies blir det en oändlig
 *    redirect-loop ("redirect count exceeded").
 *  - Manuell redirect-följning som loggar hela kedjan när något går fel
 *  - Retry med backoff på nätverksfel, 429 och 5xx
 *  - Timeout per request
 */

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'no-cache',
};

const MAX_REDIRECTS = 10;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;

/** Enkel cookie-jar: host -> (namn -> värde). Ignorerar path/expiry medvetet. */
const cookieJar = new Map<string, Map<string, string>>();

function storeCookies(host: string, response: Response): void {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) return;

  const jar = cookieJar.get(host) ?? new Map<string, string>();
  for (const raw of setCookies) {
    const pair = raw.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  cookieJar.set(host, jar);
}

function cookieHeader(host: string): string | undefined {
  const jar = cookieJar.get(host);
  if (!jar || jar.size === 0) return undefined;
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** Exponerad för tester/diagnostik */
export function clearCookieJar(): void {
  cookieJar.clear();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOnce(url: string, referer?: string): Promise<Response> {
  const host = new URL(url).host;
  const headers: Record<string, string> = { ...BROWSER_HEADERS };
  const cookie = cookieHeader(host);
  if (cookie) headers.Cookie = cookie;
  if (referer) {
    headers.Referer = referer;
    headers['Sec-Fetch-Site'] = 'same-origin';
  }

  const response = await fetch(url, {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  storeCookies(host, response);
  return response;
}

/**
 * Följer redirects manuellt med cookies bevarade mellan hoppen.
 * Kastar med hela redirect-kedjan i felmeddelandet om det loopar.
 */
async function fetchFollowingRedirects(startUrl: string): Promise<Response> {
  const chain: string[] = [startUrl];
  let url = startUrl;
  let referer: string | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchOnce(url, referer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return response;
      // Töm bodyn så att anslutningen kan återanvändas
      await response.arrayBuffer().catch(() => undefined);

      const next = new URL(location, url).toString();
      chain.push(`${response.status} -> ${next}`);
      referer = url;
      url = next;
      continue;
    }

    return response;
  }

  throw new Error(
    `Redirect-loop (>${MAX_REDIRECTS} hopp) för ${startUrl}. Kedja:\n    ${chain.join('\n    ')}`
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/**
 * Hämta HTML för en URL. Kastar Error med tydligt meddelande vid HTTP-fel,
 * redirect-loop eller när alla försök misslyckats.
 */
export async function fetchHTMLDirect(url: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchFollowingRedirects(url);

      if (response.ok) {
        return await response.text();
      }

      const snippet = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      const error = new Error(
        `HTTP ${response.status}: ${response.statusText || 'Fel'} för ${url}` +
          (snippet ? ` | body: ${snippet}` : '')
      );

      if (!isRetryableStatus(response.status)) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      // Redirect-loopar och 4xx (utom 429/408) lönar sig inte att försöka igen
      if (msg.startsWith('Redirect-loop') || /^HTTP 4(?!29|08)\d\d/.test(msg)) throw error;
    }

    if (attempt < MAX_ATTEMPTS) {
      const backoff = 2000 * attempt;
      const msg = lastError instanceof Error ? lastError.message : String(lastError);
      console.warn(`  ⚠️ Försök ${attempt}/${MAX_ATTEMPTS} misslyckades (${msg.slice(0, 120)}), väntar ${backoff}ms...`);
      await sleep(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
