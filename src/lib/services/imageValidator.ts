/**
 * Kontroll av bild-URL:er (HEAD, med GET-fallback för servrar som inte gillar HEAD).
 *
 * 'dead' = servern säger tydligt att bilden inte finns (404/410) eller svarar
 * med en HTML-sida i stället för en bild. Nätverksfel, timeouts och 5xx blir
 * 'unknown' - då rör vi inte bilden, det kan vara ett tillfälligt fel eller
 * att källan blockerar vår IP.
 */
export type ImageStatus = 'ok' | 'dead' | 'unknown';

export interface ImageCheckResult {
  status: ImageStatus;
  httpStatus?: number;
  contentType?: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function request(url: string, method: 'HEAD' | 'GET', timeoutMs: number): Promise<Response> {
  return fetch(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}),
    },
  });
}

function classify(res: Response): ImageCheckResult {
  const contentType = res.headers.get('content-type') ?? undefined;
  if (res.status === 404 || res.status === 410) {
    return { status: 'dead', httpStatus: res.status, contentType };
  }
  if (res.ok) {
    // Mjuk 404: 200 med en HTML-sida
    if (contentType?.includes('text/html')) return { status: 'dead', httpStatus: res.status, contentType };
    return { status: 'ok', httpStatus: res.status, contentType };
  }
  return { status: 'unknown', httpStatus: res.status, contentType };
}

export async function checkImageUrl(url: string, timeoutMs = 10_000): Promise<ImageCheckResult> {
  try {
    new URL(url);
  } catch {
    return { status: 'dead' };
  }

  try {
    const head = await request(url, 'HEAD', timeoutMs);
    const result = classify(head);
    // Vissa CDN:er svarar 403/405/501 på HEAD men levererar på GET
    if (result.status !== 'unknown') return result;
    const get = await request(url, 'GET', timeoutMs);
    await get.body?.cancel();
    return classify(get);
  } catch {
    return { status: 'unknown' };
  }
}

/** Kontrollerar flera URL:er med begränsad parallellitet och cache per URL */
export async function checkImageUrls(
  urls: string[],
  concurrency = 8
): Promise<Map<string, ImageCheckResult>> {
  const unique = [...new Set(urls)];
  const results = new Map<string, ImageCheckResult>();
  let next = 0;

  async function worker() {
    while (next < unique.length) {
      const url = unique[next++];
      results.set(url, await checkImageUrl(url));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return results;
}
