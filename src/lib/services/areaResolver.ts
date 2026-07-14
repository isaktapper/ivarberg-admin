/**
 * Områdes-resolver för Varbergs kommun
 *
 * Härleder vilket område ett event tillhör baserat på adress (location)
 * och platsnamn (venue_name). Används vid import (event-importer),
 * tips-konvertering och backfill (scripts/backfill-areas.ts).
 *
 * Princip: gissa aldrig. Träffar ingen regel returneras null,
 * vilket i publika filtret hamnar under "Övriga kommunen".
 *
 * Prioritetsordning:
 *   1. Kurerad venue-mappning (kända platser, högst precision)
 *   2. Ortnamn/områdesnamn i venue_name eller adress (postorten står
 *      alltid i svenska adresser, t.ex. "432 75 Träslövsläge")
 *   3. Postnummer i adressen (endast verifierade intervall)
 */

export const EVENT_AREAS = [
  'Centrala Varberg',
  'Getterön',
  'Apelviken',
  'Träslövsläge',
  'Tvååker',
  'Veddige',
  'Bua',
  'Övriga kommunen',
] as const

export type EventArea = (typeof EVENT_AREAS)[number]

// Kända platser → område. Matchas som delsträng (normaliserad).
// Lägg till fler venues här när nya återkommande platser dyker upp.
const VENUE_AREAS: Array<{ keywords: string[]; area: EventArea }> = [
  {
    area: 'Centrala Varberg',
    keywords: [
      'arena varberg',
      'sparbankshallen',
      'rotundan',
      'societen', // matchar även "Societén" efter normalisering
      'societetsparken',
      'varbergs teater',
      'komedianten',
      'kulturhuset',
      'varbergs fastning',
      'fastningsterrassen',
      'kallbadhuset',
      'campus varberg',
      'varbergs bibliotek',
      'stadsbiblioteket',
      'paskbergsvallen',
      'paskbergsskogen',
      'brunnsparken',
      'varbergs kyrka',
      'engelska parken',
    ],
  },
  {
    area: 'Getterön',
    keywords: ['naturum', 'getterons naturreservat'],
  },
  {
    area: 'Apelviken',
    keywords: ['apelvikens camping', 'first camp apelviken'],
  },
]

// Ortnamn/områdesnamn → område. Matchas med ordgräns så att t.ex.
// "träslöv" inte träffar "träslövsläge" och "bua" inte träffar andra ord.
// Ordningen spelar roll: specifika områden före generella nyckelord.
const PLACE_AREAS: Array<{ keywords: string[]; area: EventArea }> = [
  { area: 'Träslövsläge', keywords: ['traslovslage', 'lajet'] },
  { area: 'Getterön', keywords: ['getteron'] },
  { area: 'Apelviken', keywords: ['apelviken'] },
  { area: 'Tvååker', keywords: ['tvaaker'] },
  { area: 'Veddige', keywords: ['veddige'] },
  { area: 'Bua', keywords: ['bua'] },
  {
    // Kända orter i kommunen utanför de listade områdena
    area: 'Övriga kommunen',
    keywords: [
      'varobacka',
      'varo bruk',
      'rolfstorp',
      'skallinge',
      'kungsater',
      'grimeton',
      'himle',
      'sibbarp',
      'dagsas',
      'stravalla',
      'askloster',
      'derome',
      'spannarp',
      'godestad',
      'valinge',
      'hunnestad',
      'karl gustav',
      'traslov', // Träslöv (byn, öster om stan) – ej Träslövsläge, som fångas ovan
      'tronninge',
      'tofta',
      'ostroo', // Öströö
    ],
  },
  // Generellt nyckelord sist så att "Tvååkers centrum" hinner träffa Tvååker först
  { area: 'Centrala Varberg', keywords: ['centrum'] },
]

// Verifierade postnummerintervall i Varbergs kommun → område.
// Endast intervall vi är säkra på – hellre null än fel område.
function areaFromPostalCode(code: number): EventArea | null {
  if (code === 43274 || code === 43275) return 'Träslövsläge'
  if (code >= 43276 && code <= 43279) return 'Tvååker'
  if (code >= 43230 && code <= 43259) return 'Centrala Varberg' // Varbergs tätort
  if (code >= 43260 && code <= 43299) return 'Övriga kommunen' // Kommunen utanför tätorten
  if (code === 51993) return 'Övriga kommunen' // Kungsäter
  return null
}

/**
 * Normalisera text för matchning: gemener, å/ä/ö → a/a/o, é → e,
 * övriga specialtecken → mellanslag.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/å|ä/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Delsträngsmatchning med ordgränser ("bua" träffar inte "buad").
 * Tillåter genitiv-s så att t.ex. "Tvååkers centrum" träffar "tvaaker".
 */
function containsWord(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\s)${escaped}s?(\\s|$)`).test(haystack)
}

/**
 * Härled område från adress och platsnamn.
 * Returnerar null när ingen säker träff finns (t.ex. bara "Varberg, Sweden").
 */
export function resolveArea(
  location?: string | null,
  venueName?: string | null
): EventArea | null {
  const haystack = normalize([venueName || '', location || ''].join(' '))
  if (!haystack) return null

  // 1. Kurerad venue-mappning
  for (const { keywords, area } of VENUE_AREAS) {
    if (keywords.some((kw) => haystack.includes(kw))) return area
  }

  // 2. Ortnamn/områdesnamn (med ordgräns)
  for (const { keywords, area } of PLACE_AREAS) {
    if (keywords.some((kw) => containsWord(haystack, kw))) return area
  }

  // 3. Postnummer (endast i adressen, inte i venue-namnet)
  const postalMatch = (location || '').match(/\b(\d{3})\s?(\d{2})\b/)
  if (postalMatch) {
    return areaFromPostalCode(parseInt(postalMatch[1] + postalMatch[2], 10))
  }

  return null
}
