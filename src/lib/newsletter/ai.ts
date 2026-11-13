/**
 * Torsdagsbrevet – AI-förslag på urval och text.
 *
 * Ett anrop (gpt-4o-mini via den delade, PostHog-mätta klienten) som väljer
 * tre evenemang, tre reserver och skriver en rad om varje samt ämnesrad,
 * preheader och intro. Allt är ett FÖRSLAG: en människa läser och ändrar på
 * godkännandesidan innan något skickas.
 *
 * Tonreglerna står i prompten och kontrolleras dessutom i kod efteråt
 * (utropstecken, emojier och förbjudna uttryck). Saknas nyckel eller svar
 * används de högst rankade kandidaterna med tomma rader.
 */
import { getOpenAIClient } from '../services/openai-client'
import { eventWhenLabel, formatDateLong } from './dates'
import {
  COMMENT_MAX_LENGTH,
  MAX_PICKS,
  NewsletterCandidate,
  NewsletterSuggestion,
  SUBJECT_MAX_LENGTH,
  SUBJECT_PREFIX,
} from './proposal'
import { pickDiverse } from './weekend-events'

const MODEL = 'gpt-4o-mini'
/** Så många av de högst rankade kandidaterna får AI:n se */
const MAX_AI_CANDIDATES = 20
const ALTERNATE_COUNT = 3

const BANNED_PHRASES = /missa inte|upplevelse|pärla|pärlor|något för hela familjen/i
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu

/** Stryker emojier och byter utropstecken mot punkt */
export function cleanTone(text: string): string {
  return text
    .replace(EMOJI, '')
    .replace(/([?.,:;…])\s*!+/g, '$1') // "?!" blir "?"
    .replace(/\s*!+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/\.(\s*[,.:;?])/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([,.:;?])/g, '$1')
    .trim()
}

export function hasBannedPhrase(text: string): boolean {
  return BANNED_PHRASES.test(text)
}

/** En rad: städad ton, tom om den bryter mot ordlistan, kapad vid meningsslut om den är för lång */
function cleanComment(raw: unknown, name: string): string {
  if (typeof raw !== 'string') return ''
  let text = cleanTone(raw.replace(/\s+/g, ' '))
  if (!text) return ''
  if (hasBannedPhrase(text)) {
    console.warn(`  ⚠️ AI-raden för "${name}" innehöll ett förbjudet uttryck och ströks: "${text}"`)
    return ''
  }
  if (text.length > COMMENT_MAX_LENGTH) {
    const cut = text.slice(0, COMMENT_MAX_LENGTH)
    const lastStop = cut.lastIndexOf('. ')
    text = lastStop > 60 ? cut.slice(0, lastStop + 1) : `${cut.slice(0, COMMENT_MAX_LENGTH - 1).trimEnd()}…`
  }
  return text
}

function shortName(name: string, max = 30): string {
  const trimmed = name.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed
}

/** Ämnesrad utan AI: "I Varberg i helgen: A, B och C" */
export function fallbackSubject(picks: NewsletterCandidate[]): string {
  const names = picks.map((p) => shortName(p.name))
  if (names.length === 0) return `${SUBJECT_PREFIX} det här händer`
  if (names.length === 1) return `${SUBJECT_PREFIX} ${names[0]}`
  return `${SUBJECT_PREFIX} ${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}`
}

export function fallbackPreheader(total: number): string {
  return `Tre tips och ${total} evenemang från fredag till söndag.`
}

export const FALLBACK_INTRO = 'Hej. Här är tre saker att göra i Varberg i helgen, och resten av det som händer.'

/** Reserven: de högst rankade med spridning, tomma rader som redaktören fyller i */
export function fallbackSuggestion(candidates: NewsletterCandidate[], total: number): NewsletterSuggestion {
  const picks = pickDiverse(candidates, MAX_PICKS)
  return {
    pickEventIds: picks.map((p) => p.eventId),
    comments: {},
    subject: fallbackSubject(picks),
    preheader: fallbackPreheader(total),
    intro: FALLBACK_INTRO,
    source: 'fallback',
  }
}

function candidateLine(c: NewsletterCandidate): string {
  const days = new Set(c.occurrences.map((o) => o.dateTime.slice(0, 10))).size
  return [
    `id: ${c.eventId}`,
    `namn: ${c.name}`,
    `när: ${eventWhenLabel(c.dateTime)}${days > 1 ? ` (${days} dagar i helgen)` : ''}`,
    `plats: ${c.venue ?? 'okänd'}`,
    `kategorier: ${c.categories.join(', ') || 'okänd'}`,
    `pris: ${c.price ?? 'okänt'}`,
    `har_bild: ${c.imageUrl ? 'ja' : 'nej'}`,
    c.ongoing ? 'pågår_länge: ja' : null,
    `beskrivning: ${c.excerpt ?? '(saknas)'}`,
  ]
    .filter(Boolean)
    .join(' | ')
}

function buildPrompt(candidates: NewsletterCandidate[], weekendStart: string, weekendEnd: string, total: number): string {
  return `Helgen gäller ${formatDateLong(weekendStart)} till ${formatDateLong(weekendEnd)}. Här är de ${candidates.length} högst rankade av helgens ${total} evenemang i Varberg:

${candidates.map(candidateLine).join('\n')}

UPPGIFT
1. Välj tre evenemang till "Veckans tre". Sprid dem: helst olika kategorier, olika platser och gärna olika dagar. Välj evenemang med har_bild: ja. Föredra sådant som bara händer den här helgen framför det som pågår länge.
2. Välj tre reserver som redaktören kan byta till.
3. Skriv en rad om varje (alla sex): varför just det här är värt att gå på. Högst 110 tecken per rad.
4. Skriv ämnesrad, preheader och intro till brevet.

TONREGLER (gäller all text)
- Korta meningar. Konkret. Det ska låta som en granne som har koll, inte som reklam.
- Inga utropstecken. Inga emojier.
- Använd aldrig uttrycken "missa inte", "upplevelse", "pärla" eller "något för hela familjen".
- Hitta ALDRIG på fakta. Använd bara det som står i evenemangets data ovan. Står det inte där, skriv det inte. Hellre en enkel rad än en gissning.
- Upprepa inte dag, klockslag, plats eller pris i raden. Det står redan på kortet.
- Ämnesrad: börjar med "${SUBJECT_PREFIX} " följt av två eller tre konkreta saker ur urvalet. Högst 70 tecken totalt.
- Preheader: en mening på högst 90 tecken som kompletterar ämnesraden utan att upprepa den.
- Intro: en eller två korta meningar som hälsning överst i brevet. Räkna inte upp evenemangen där.

Svara ENDAST med JSON i den här formen:
{
  "picks": [{ "id": 0, "comment": "..." }, { "id": 0, "comment": "..." }, { "id": 0, "comment": "..." }],
  "alternates": [{ "id": 0, "comment": "..." }, { "id": 0, "comment": "..." }, { "id": 0, "comment": "..." }],
  "subject": "...",
  "preheader": "...",
  "intro": "..."
}`
}

interface AiEntry {
  id?: unknown
  comment?: unknown
}

/**
 * Tar fram veckans förslag. Kastar aldrig: vid saknad nyckel, fel eller
 * oanvändbart svar returneras reservförslaget (source: 'fallback').
 */
export async function suggestNewsletter(input: {
  candidates: NewsletterCandidate[]
  weekendStart: string
  weekendEnd: string
  totalWeekendCount: number
}): Promise<NewsletterSuggestion> {
  const { candidates, weekendStart, weekendEnd, totalWeekendCount } = input
  const fallback = fallbackSuggestion(candidates, totalWeekendCount)
  if (candidates.length === 0) return fallback
  if (!process.env.OPENAI_API_KEY) {
    console.warn('  ⚠️ OPENAI_API_KEY saknas - använder de högst rankade evenemangen utan AI-text')
    return fallback
  }

  const shown = candidates.slice(0, MAX_AI_CANDIDATES)
  const byId = new Map(shown.map((c) => [c.eventId, c]))

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Du är redaktör för Torsdagsbrevet, nyhetsbrevet från ivarberg.nu, en lokal evenemangsguide för Varberg. Brevet går ut på torsdagar och tipsar om helgen. Du skriver som en granne som har koll: korta meningar, konkret och lugnt. Du hittar aldrig på fakta. Svara endast med JSON.',
        },
        { role: 'user', content: buildPrompt(shown, weekendStart, weekendEnd, totalWeekendCount) },
      ],
      temperature: 0.6,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      posthogProperties: { feature: 'newsletter-proposal' },
    })

    const raw = response.choices[0]?.message?.content?.trim()
    if (!raw) throw new Error('Tomt svar från AI')
    const parsed = JSON.parse(raw) as {
      picks?: AiEntry[]
      alternates?: AiEntry[]
      subject?: unknown
      preheader?: unknown
      intro?: unknown
    }

    // Whitelist: bara id:n som faktiskt fanns i underlaget, inga dubbletter
    const comments: Record<string, string> = {}
    const collect = (entries: AiEntry[] | undefined, limit: number): NewsletterCandidate[] => {
      const result: NewsletterCandidate[] = []
      for (const entry of Array.isArray(entries) ? entries : []) {
        const id = typeof entry?.id === 'number' ? entry.id : Number(entry?.id)
        const candidate = byId.get(id)
        if (!candidate || String(id) in comments) continue
        comments[String(id)] = cleanComment(entry.comment, candidate.name)
        result.push(candidate)
        if (result.length >= limit) break
      }
      return result
    }

    let picks = collect(parsed.picks, MAX_PICKS)
    collect(parsed.alternates, ALTERNATE_COUNT)
    if (picks.length === 0) throw new Error('AI-svaret innehöll inga giltiga evenemang')
    if (picks.length < MAX_PICKS) {
      // Fyll på med de högst rankade (utan rad) så att brevet får tre
      picks = [...picks, ...pickDiverse(candidates, MAX_PICKS - picks.length, picks)]
    }
    for (const key of Object.keys(comments)) {
      if (!comments[key]) delete comments[key]
    }

    // En ämnesrad slutar inte med punkt (inte heller när ett utropstecken bytts ut)
    let subject = typeof parsed.subject === 'string' ? cleanTone(parsed.subject.replace(/\s+/g, ' ')).replace(/\.$/, '') : ''
    if (subject && !subject.toLowerCase().startsWith(SUBJECT_PREFIX.toLowerCase().replace(':', ''))) {
      subject = `${SUBJECT_PREFIX} ${subject}`
    }
    if (!subject || hasBannedPhrase(subject) || subject.length > SUBJECT_MAX_LENGTH) subject = fallbackSubject(picks)

    let preheader = typeof parsed.preheader === 'string' ? cleanTone(parsed.preheader.replace(/\s+/g, ' ')) : ''
    if (!preheader || hasBannedPhrase(preheader)) preheader = fallbackPreheader(totalWeekendCount)

    let intro =
      typeof parsed.intro === 'string'
        ? parsed.intro
            .split(/\n+/)
            .map((line) => cleanTone(line))
            .filter(Boolean)
            .join('\n')
        : ''
    if (!intro || hasBannedPhrase(intro)) intro = FALLBACK_INTRO

    return { pickEventIds: picks.map((p) => p.eventId), comments, subject, preheader, intro, source: 'ai' }
  } catch (error) {
    console.warn('  ⚠️ AI-förslaget misslyckades - använder de högst rankade evenemangen:', error instanceof Error ? error.message : error)
    return fallback
  }
}
