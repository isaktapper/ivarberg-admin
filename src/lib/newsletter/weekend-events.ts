/**
 * Torsdagsbrevet – helgens evenemang som kandidater.
 *
 *   1. getWeekendEvents()  hämtar publicerade evenemang fredag 00:00–söndag 23:59
 *   2. buildCandidates()   slår ihop upprepade tillfällen av samma evenemang
 *                          och poängsätter varje kandidat
 *   3. pickDiverse()       väljer de högst rankade med spridning på kategori,
 *                          plats och dag (reserv när AI:n inte svarar)
 */
import { SupabaseClient } from '@supabase/supabase-js'
import { Event } from '@/types/database'
import { fetchAllRows } from '../supabase-fetch-all'
import { eventDay, eventTime, weekendQueryRange } from './dates'
import { NewsletterCandidate } from './proposal'

type WeekendEvent = Pick<
  Event,
  | 'id'
  | 'event_id'
  | 'name'
  | 'description'
  | 'date_time'
  | 'location'
  | 'venue_name'
  | 'price'
  | 'is_free'
  | 'image_url'
  | 'categories'
  | 'featured'
  | 'quality_score'
>

const EVENT_COLUMNS =
  'id, event_id, name, description, date_time, location, venue_name, price, is_free, image_url, categories, featured, quality_score'

const EXCERPT_LENGTH = 320

/** Publicerade evenemang som startar fredag 00:00–söndag 23:59 (svensk tid), i tidsordning */
export async function getWeekendEvents(supabase: SupabaseClient, issueDate: string): Promise<WeekendEvent[]> {
  const { from, to } = weekendQueryRange(issueDate)
  return fetchAllRows<WeekendEvent>((rangeFrom, rangeTo) =>
    supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('status', 'published')
      .gte('date_time', from)
      .lt('date_time', to)
      .order('date_time', { ascending: true })
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)
  )
}

/** Namn/plats utan versaler, citattecken och dubbla mellanslag – för jämförelse */
function normalize(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/["'"''`´”“]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Beskrivningen som ren text, kortad */
function excerptOf(description: string | null | undefined): string | null {
  const text = (description || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : text
}

function priceOf(event: WeekendEvent): string | null {
  const price = (event.price || '').trim()
  if (price) return price
  return event.is_free === true ? 'Gratis' : null
}

// Vikt per kategori: det som brukar locka en fredag- eller lördagkväll först,
// det som pågår hela tiden sist.
const CATEGORY_WEIGHT: Record<string, number> = {
  Scen: 18,
  Nattliv: 14,
  Marknader: 12,
  'Mat & Dryck': 10,
  Sport: 9,
  Jul: 9,
  'Film & bio': 7,
  'Barn & Familj': 7,
  Föreläsningar: 6,
  'Djur & Natur': 5,
  'Guidade visningar': 4,
  Utställningar: 3,
  Konst: 3,
  Okategoriserad: 0,
}
const EXHIBITION_CATEGORIES = new Set(['Utställningar', 'Konst'])
const ONGOING_PENALTY = 25

/**
 * Poäng för en kandidat (ungefär 0–90): kvalitetspoäng, featured, bild,
 * kategori, kvällstid och beskrivning. Pågående utställningar som upprepas
 * dag efter dag får avdrag.
 */
export function scoreCandidate(c: Omit<NewsletterCandidate, 'score'>): number {
  const hour = Number((eventTime(c.dateTime) ?? '00:00').slice(0, 2))
  let score = (c.qualityScore ?? 50) * 0.3
  if (c.featured) score += 15
  if (c.imageUrl) score += 15
  score += CATEGORY_WEIGHT[c.categories[0] ?? 'Okategoriserad'] ?? 0
  if (eventTime(c.dateTime)) score += hour >= 17 ? 8 : 3
  if ((c.excerpt ?? '').length >= 80) score += 4
  if (c.ongoing) score -= ONGOING_PENALTY
  return Math.round(score * 10) / 10
}

/**
 * Slår ihop upprepade tillfällen av samma evenemang (samma namn på samma
 * plats) och returnerar kandidaterna med högst poäng först.
 *
 * Skrapade långkörare ligger som ett evenemang per dag, så en utställning som
 * visas fredag–söndag blir annars tre rader i brevet.
 */
export function buildCandidates(events: WeekendEvent[]): NewsletterCandidate[] {
  const groups = new Map<string, WeekendEvent[]>()
  for (const event of events) {
    const key = `${normalize(event.name)}|${normalize(event.venue_name || event.location)}`
    const group = groups.get(key)
    if (group) group.push(event)
    else groups.set(key, [event])
  }

  const candidates: NewsletterCandidate[] = []
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.date_time.localeCompare(b.date_time) || a.id - b.id)
    const first = sorted[0]
    const days = new Set(sorted.map((e) => eventDay(e.date_time)))
    const categories = (first.categories || []).filter(Boolean) as string[]
    // "Pågående": samma evenemang flera dagar i helgen och antingen en
    // utställning eller utan klockslag. En föreställning som ges både fredag
    // och lördag kväll räknas inte hit.
    const ongoing = days.size >= 2 && (categories.some((c) => EXHIBITION_CATEGORIES.has(c)) || !eventTime(first.date_time))
    const qualities = sorted.map((e) => e.quality_score).filter((q): q is number => typeof q === 'number')

    const base: Omit<NewsletterCandidate, 'score'> = {
      eventId: first.id,
      slug: first.event_id,
      name: first.name.trim(),
      dateTime: first.date_time,
      venue: (first.venue_name || first.location || '').trim() || null,
      price: priceOf(first),
      categories,
      excerpt: excerptOf(sorted.find((e) => e.description?.trim())?.description),
      imageUrl: sorted.find((e) => e.image_url)?.image_url ?? null,
      emailImageUrl: null,
      featured: sorted.some((e) => e.featured),
      qualityScore: qualities.length ? Math.max(...qualities) : null,
      occurrences: sorted.map((e) => ({ eventId: e.id, slug: e.event_id, dateTime: e.date_time })),
      ongoing,
    }
    candidates.push({ ...base, score: scoreCandidate(base) })
  }

  return candidates.sort((a, b) => b.score - a.score || a.dateTime.localeCompare(b.dateTime) || a.eventId - b.eventId)
}

/**
 * Väljer `count` kandidater med spridning: varje ny kandidat får avdrag om
 * dess kategori, plats eller dag redan finns bland de valda. Kandidater utan
 * bild väljs bara om inget annat finns.
 */
export function pickDiverse(
  candidates: NewsletterCandidate[],
  count: number,
  alreadyPicked: NewsletterCandidate[] = []
): NewsletterCandidate[] {
  const chosen: NewsletterCandidate[] = [...alreadyPicked]
  const pool = candidates.filter((c) => !chosen.some((p) => p.eventId === c.eventId))
  const result: NewsletterCandidate[] = []

  while (result.length < count && pool.length > 0) {
    let bestIndex = 0
    let bestScore = -Infinity
    pool.forEach((c, i) => {
      const sameCategory = chosen.filter((p) => (p.categories[0] ?? '') === (c.categories[0] ?? '')).length
      const sameVenue = chosen.filter((p) => normalize(p.venue) && normalize(p.venue) === normalize(c.venue)).length
      const sameDay = chosen.filter((p) => eventDay(p.dateTime) === eventDay(c.dateTime)).length
      const adjusted = c.score - sameCategory * 12 - sameVenue * 15 - sameDay * 4 - (c.imageUrl ? 0 : 30)
      if (adjusted > bestScore) {
        bestScore = adjusted
        bestIndex = i
      }
    })
    const [picked] = pool.splice(bestIndex, 1)
    chosen.push(picked)
    result.push(picked)
  }
  return result
}
