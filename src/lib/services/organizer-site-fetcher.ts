/**
 * Gratis sajthämtning för arrangörs-enrichment - ingen Firecrawl.
 *
 * Arrangörernas egna webbplatser blockerar (till skillnad från
 * visitvarberg.se) inte vanliga HTTP-anrop, så vi hämtar dem med fetch +
 * cheerio. Startsidan hämtas alltid; hittas en "Kontakt"-länk hämtas även
 * den sidan eftersom mejl/telefon oftast bor där.
 *
 * För arrangörer utan sparad webbplats gissas domänen från namnet
 * ("Teater Halland" → teaterhalland.se) - sökmotorernas HTML-endpoints
 * (DuckDuckGo, Bing) bot-blockerar serveranrop så de går inte att använda.
 * En AI-kontroll nedströms verifierar alltid att sajten faktiskt tillhör
 * arrangören innan något godkänns.
 */
import * as cheerio from 'cheerio';

// Repot har äldre @types/cheerio som krockar med cheerios egna typer -
// härled typen från load() så fungerar det med båda
type CheerioDoc = ReturnType<typeof cheerio.load>;

export interface SiteData {
  url: string;
  title: string;
  metaDescription: string;
  /** Ren text från startsida (+ ev. kontaktsida), för AI-bedömning */
  textContent: string;
  email?: string;
  phone?: string;
  address?: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 ivarberg-bot/1.0 (+https://ivarberg.se)';

const FETCH_TIMEOUT_MS = 15000;

async function fetchHtml(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('html')) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Hämta en arrangörs webbplats (startsida + ev. kontaktsida) och extrahera
 * titel, text och kontaktuppgifter. Returnerar null om sajten inte kunde nås.
 */
export async function fetchSiteData(url: string): Promise<SiteData | null> {
  const homeHtml = await fetchHtml(url);
  if (!homeHtml) return null;

  const $home = cheerio.load(homeHtml);
  const title = $home('title').first().text().trim() || $home('h1').first().text().trim();
  const metaDescription =
    $home('meta[name="description"]').attr('content')?.trim() ||
    $home('meta[property="og:description"]').attr('content')?.trim() ||
    '';

  // Leta upp kontaktsidan - mejl/telefon bor oftast där, inte på startsidan
  let contactHtml: string | null = null;
  const contactHref = findContactLink($home, url);
  if (contactHref) {
    contactHtml = await fetchHtml(contactHref);
  }

  const pages = [
    { $: $home, html: homeHtml },
    ...(contactHtml ? [{ $: cheerio.load(contactHtml), html: contactHtml }] : []),
  ];

  // mailto:/tel:-länkar är säkrast - fall tillbaka på regex i sidtexten
  let email: string | undefined;
  let phone: string | undefined;
  let address: string | undefined;
  let textContent = '';

  for (const page of pages) {
    email = email || extractMailto(page.$) || undefined;
    phone = phone || extractTel(page.$) || undefined;

    const text = extractText(page.$);
    textContent += (textContent ? '\n\n--- (kontaktsida) ---\n\n' : '') + text;

    email = email || extractEmailFromText(text) || undefined;
    phone = phone || extractPhoneFromText(text) || undefined;
    address = address || extractAddressFromText(text) || undefined;
  }

  return {
    url,
    title,
    metaDescription,
    textContent: textContent.substring(0, 6000),
    email,
    phone,
    address,
  };
}

/**
 * Gissa kandidat-webbplatser från arrangörens namn och testa vilka som svarar.
 * "Teater Halland" → teaterhalland.se, teater-halland.se, teaterhalland.com ...
 * Returnerar de nåbara kandidaterna med titel/beskrivning så att AI:n kan
 * avgöra vilken (om någon) som faktiskt är arrangörens webbplats.
 */
export async function guessWebsiteCandidates(
  name: string,
  maxResults = 3
): Promise<Array<{ url: string; title: string; description: string }>> {
  const slugs = buildDomainSlugs(name);
  const urls: string[] = [];
  for (const slug of slugs) {
    for (const tld of ['se', 'com', 'nu']) {
      urls.push(`https://${slug}.${tld}`);
    }
  }

  const results: Array<{ url: string; title: string; description: string }> = [];
  for (const url of urls.slice(0, 9)) {
    if (results.length >= maxResults) break;
    const html = await fetchHtml(url, 6000);
    if (!html) continue;

    const $ = cheerio.load(html);
    const title = $('title').first().text().trim();
    if (!title) continue; // Parkerade domäner saknar oftast vettig titel

    results.push({
      url,
      title,
      description:
        $('meta[name="description"]').attr('content')?.trim() ||
        $('meta[property="og:description"]').attr('content')?.trim() ||
        '',
    });
  }
  return results;
}

/** Bygg domänkandidater från ett namn: "Teater Halland" → ["teaterhalland", "teater-halland"] */
function buildDomainSlugs(name: string): string[] {
  const normalized = name
    .toLowerCase()
    .replace(/&/g, 'och')
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[éèê]/g, 'e')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim();

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const slugs = new Set<string>();
  slugs.add(words.join(''));
  if (words.length > 1) {
    slugs.add(words.join('-'));
    // "Restaurang Solviken" → även "solviken" (verksamhetstyp som prefix är vanligt)
    const typePrefixes = ['restaurang', 'cafe', 'kafe', 'hotell', 'teater', 'galleri', 'butik'];
    if (typePrefixes.includes(words[0]) && words.length === 2) {
      slugs.add(words[1]);
    }
  }
  return Array.from(slugs).filter(s => s.length >= 3 && s.length <= 40);
}

function findContactLink($: CheerioDoc, baseUrl: string): string | null {
  let found: string | null = null;
  $('a[href]').each((_, el) => {
    if (found) return;
    const href = $(el).attr('href') || '';
    const text = $(el).text().toLowerCase();
    if (/kontakt|contact/.test(href.toLowerCase()) || /kontakta?( oss)?|contact/.test(text)) {
      try {
        const absolute = new URL(href, baseUrl);
        // Stanna på samma sajt
        if (absolute.hostname === new URL(baseUrl).hostname) {
          found = absolute.href;
        }
      } catch {
        // Ogiltig href - hoppa över
      }
    }
  });
  return found;
}

function extractText($: CheerioDoc): string {
  const copy = cheerio.load($.html());
  copy('script, style, noscript, svg, nav, footer form').remove();
  return copy('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 5000);
}

function extractMailto($: CheerioDoc): string | null {
  const href = $('a[href^="mailto:"]').first().attr('href');
  if (!href) return null;
  const email = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
  return email.includes('@') ? email : null;
}

function extractTel($: CheerioDoc): string | null {
  const href = $('a[href^="tel:"]').first().attr('href');
  if (!href) return null;
  const phone = href.replace(/^tel:/i, '').trim();
  return phone.length >= 7 ? phone : null;
}

function extractEmailFromText(text: string): string | null {
  const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (!match) return null;
  const email = match[0].toLowerCase();
  // Filtrera bort bildfilnamn o.dyl. som råkar matcha
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/.test(email)) return null;
  return email;
}

function extractPhoneFromText(text: string): string | null {
  // Svenska telefonnummer. Riktnumret sitter alltid ihop med inledande 0/+46
  // ("0340-17005", "070-545 67 37") - tillåt inte mellanslag efter nollan,
  // annars matchas sifferlistor som "0 11 12 13 14".
  const match = text.match(/(?:\+46[\s-]?|0)[1-9]\d{1,2}[\s-]?\d{2,3}[\s-]?\d{2}(?:[\s-]?\d{2})?/);
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

function extractAddressFromText(text: string): string | null {
  // "Gatunamn 12, 432 44 Varberg"-mönster. Obs: håll regexen linjär
  // (bundna kvantifierare, obligatoriska mellanslag) - en tidigare variant
  // med nästlade valfria kvantifierare gav katastrofal backtracking.
  const match = text.match(/[A-ZÅÄÖ][a-zåäö]+(?: [A-Za-zåäö]+){0,3} \d{1,4}[A-Za-z]?,? ?\d{3} ?\d{2} [A-ZÅÄÖ][a-zåäö]+/);
  return match ? match[0].trim() : null;
}
