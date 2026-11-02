/**
 * Avgör om två event är samma, utifrån tid, plats och namn.
 * Ren funktion - all I/O (geokodning, AI) ligger i detector.ts.
 *
 *   duplicate = säker dublett, hanteras automatiskt
 *   maybe     = gråzon, skickas till AI-bedömning
 *   distinct  = olika event
 */
import { nameSimilarity, placeTokens, type TokenWeights } from './text'
import type { VenueRelation } from './venues'

export type Verdict = 'duplicate' | 'maybe' | 'distinct'

export interface MatchableEvent {
  name: string
  date_time: string
  venue_name?: string | null
  location?: string | null
  organizer_event_url?: string | null
}

export interface MatchResult {
  verdict: Verdict
  nameScore: number
  minutesApart: number | null // null = minst ett heldagsevent samma dag
  venue: VenueRelation
  venueMeters?: number
  reason: string
}

/** Minsta ömsesidiga namnöverlapp för automatisk dublett när platsen inte är bekräftad */
const MIN_OVERLAP_UNKNOWN_VENUE = 0.65

/** Längsta tidsskillnad som alls kan vara samma event (insläpp vs start o.d.) */
export const MAX_MINUTES_APART = 180

export function sourceHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

function datePart(dt: string): string {
  return dt.slice(0, 10)
}

/** Midnatt tolkas som "tid saknas" - flera källor sätter 00:00 för heldagsevent */
function isAllDay(dt: string): boolean {
  return /T00:00(:00)?/.test(dt)
}

/** Minuter mellan starttiderna, null om ena saknar tid men datumet är samma, Infinity om för långt isär */
export function minutesBetween(a: string, b: string): number | null {
  if (isAllDay(a) || isAllDay(b)) {
    if (datePart(a) !== datePart(b)) return Infinity
    return isAllDay(a) && isAllDay(b) ? 0 : null
  }
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000
}

export function matchEvents(
  a: MatchableEvent,
  b: MatchableEvent,
  venue: { relation: VenueRelation; meters?: number },
  weights: TokenWeights
): MatchResult {
  const minutesApart = minutesBetween(a.date_time, b.date_time)
  const base = { nameScore: 0, minutesApart, venue: venue.relation, venueMeters: venue.meters }

  if (minutesApart !== null && minutesApart > MAX_MINUTES_APART) {
    return { ...base, verdict: 'distinct', reason: 'för långt isär i tid' }
  }

  // Samma källa listar själv eventen separat med olika tider = olika tillfällen
  const hostA = sourceHost(a.organizer_event_url)
  if (
    hostA &&
    hostA === sourceHost(b.organizer_event_url) &&
    a.organizer_event_url !== b.organizer_event_url &&
    minutesApart !== 0
  ) {
    return { ...base, verdict: 'distinct', reason: 'samma källa, olika tillfällen' }
  }

  if (venue.relation === 'different') {
    return { ...base, verdict: 'distinct', reason: `olika platser (${venue.meters} m isär)` }
  }

  const strip = placeTokens(a.venue_name, a.location, b.venue_name, b.location)
  const { score: nameScore, overlap } = nameSimilarity(a.name, b.name, weights, strip)
  const result = { ...base, nameScore }
  const sameVenue = venue.relation === 'same'

  // [dublett-gräns, gråzon-gräns] per tidsläge och platsläge
  let limits: [number, number]
  if (minutesApart === 0) limits = sameVenue ? [0.6, 0.35] : [0.8, 0.45]
  else if (minutesApart === null) limits = sameVenue ? [0.95, 0.6] : [Infinity, 0.7] // heldag vs klockslag: ofta en utställning och ett program i den
  else if (minutesApart <= 60) limits = sameVenue ? [0.85, 0.5] : [0.95, 0.6]
  else limits = [Infinity, 0.8]

  const when = minutesApart === null ? 'samma dag' : minutesApart === 0 ? 'samma tid' : `${minutesApart} min isär`
  const where = sameVenue ? 'samma plats' : 'plats okänd'
  const summary = `${when}, ${where}, namn ${Math.round(nameScore * 100)}%`

  // Utan bekräftad plats räcker det inte att det korta namnet ryms i det långa
  // ("Tredje advent" ⊂ "Åk jultåget andra, tredje och fjärde advent") - då får AI avgöra
  const overlapOk = sameVenue || overlap >= MIN_OVERLAP_UNKNOWN_VENUE
  if (nameScore >= limits[0] && overlapOk) return { ...result, verdict: 'duplicate', reason: summary }
  if (nameScore >= limits[1]) return { ...result, verdict: 'maybe', reason: summary }
  return { ...result, verdict: 'distinct', reason: summary }
}
