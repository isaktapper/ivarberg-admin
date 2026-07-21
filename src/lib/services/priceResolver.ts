/**
 * Härleder om ett event är gratis utifrån prisfältets fritext.
 *
 * Prisfältet är fritext från flera olika scrapers ("Gratis", "65 kr", "485",
 * "Från 1095:-", "75 kr icke-medlem, gratis för medlemmar", ...) och kan inte
 * visas rakt av publikt. Den här funktionen översätter det till tre säkra lägen:
 *
 *   true  = säkert gratis      (t.ex. "Gratis", "Fri entré", "0 kr")
 *   false = säkert kostar      (t.ex. "65 kr", "485", "Från 1095:-")
 *   null  = okänt/motstridigt  (tomt, "gratis för medlemmar", "barn gratis", ...)
 *
 * Regeln är medvetet konservativ: hellre null (visa inget publikt) än fel.
 */

/** Ord som signalerar att eventet är gratis */
const FREE_KEYWORDS = /(gratis|fri\s*entr[eéè]|fritt\s*intr[äa]de|kostnadsfri)/;

/**
 * Ord som gör en gratis-signal osäker - "gratis för medlemmar" eller
 * "barn under 12 gratis" betyder inte att eventet är gratis för alla.
 */
const FREE_QUALIFIERS = /(medlem|barn|ungdom|student|pension[äa]r|under\s*\d|t\.?\s*o\.?\s*m|år)/;

/** Belopp med valutamarkör: "65 kr", "295.00kr", "525:-", "1095 SEK" */
const AMOUNT_WITH_CURRENCY = /(\d+(?:[.,]\d+)?)\s*(?:kr|:-|sek|kronor)/g;

/** Strängen är bara ett tal (ev. med "från"/"ca"): "485", "från 1095" */
const BARE_NUMBER = /^(?:från|fr\.?|ca\.?)?\s*(\d+(?:[.,]\d+)?)\s*$/;

export function resolveIsFree(price?: string | number | null): boolean | null {
  // Vissa källor (Visit Varbergs JSON) skickar pris som tal, inte sträng
  if (price === null || price === undefined || price === '') return null;
  if (typeof price === 'number') return price === 0 ? true : price > 0 ? false : null;

  // Normalisera: ta bort osynliga tecken (zero-width space förekommer i
  // scrapad data), kollapsa whitespace, gemener
  const normalized = price
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!normalized) return null;

  // Samla alla belopp i strängen
  const amounts: number[] = [];
  for (const match of normalized.matchAll(AMOUNT_WITH_CURRENCY)) {
    amounts.push(parseFloat(match[1].replace(',', '.')));
  }
  const bareMatch = normalized.match(BARE_NUMBER);
  if (bareMatch) {
    amounts.push(parseFloat(bareMatch[1].replace(',', '.')));
  }
  const hasPositiveAmount = amounts.some((a) => a > 0);
  const allAmountsZero = amounts.length > 0 && amounts.every((a) => a === 0);

  const mentionsFree = FREE_KEYWORDS.test(normalized);

  if (mentionsFree) {
    // Motstridigt ("75 kr icke-medlem, gratis för medlemmar") eller
    // kvalificerat ("gratis för barn") -> osäkert, hellre null än fel
    if (hasPositiveAmount || FREE_QUALIFIERS.test(normalized)) return null;
    return true;
  }

  if (allAmountsZero) return true; // "0 kr"
  if (hasPositiveAmount) return false;

  return null;
}
