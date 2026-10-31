/**
 * Hämtar om aktuell bild-URL från ett events källsida (organizer_event_url).
 * Används av reparationsscriptet för döda bilder (scripts/check-image-urls.ts).
 * Använder vanlig fetch - inga Firecrawl-credits.
 */
import * as cheerio from 'cheerio';
import { fetchHTMLDirect } from './http-fetcher';
import { extractInitialStates, pickEventData } from './visit-varberg-scraper';
import { extractVarbergDetailImage } from './varbergs-teatern-scraper';

export interface RefreshedImage {
  imageUrl: string;
  /** Hur bilden hittades - visas i rapporten */
  via: 'visitvarberg-json' | 'varberg-og-image' | 'og-image';
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function visitVarbergImage(html: string): string | undefined {
  const $ = cheerio.load(html);
  let imageUrl: string | undefined;
  $('script').each((_, el) => {
    if (imageUrl) return;
    const content = $(el).html();
    if (!content?.includes('registerInitialState')) return;
    for (const candidate of extractInitialStates(content)) {
      const data = pickEventData(candidate);
      if (data) {
        imageUrl = data.photos?.[0]?.url;
        return;
      }
    }
  });
  return imageUrl;
}

function ogImage(html: string, pageUrl: string): string | undefined {
  const $ = cheerio.load(html);
  const content = $('meta[property="og:image"]').attr('content')?.trim();
  if (!content) return undefined;
  try {
    return new URL(content, pageUrl).toString();
  } catch {
    return undefined;
  }
}

/** Kastar vid HTTP-fel på källsidan; returnerar null om sidan saknar bild */
export async function fetchCurrentImageUrl(eventUrl: string): Promise<RefreshedImage | null> {
  const host = hostOf(eventUrl);
  const html = await fetchHTMLDirect(eventUrl);

  if (host === 'visitvarberg.se') {
    const imageUrl = visitVarbergImage(html);
    return imageUrl ? { imageUrl, via: 'visitvarberg-json' } : null;
  }
  if (host === 'varberg.se') {
    const imageUrl = extractVarbergDetailImage(cheerio.load(html));
    return imageUrl ? { imageUrl, via: 'varberg-og-image' } : null;
  }
  const imageUrl = ogImage(html, eventUrl);
  return imageUrl ? { imageUrl, via: 'og-image' } : null;
}
