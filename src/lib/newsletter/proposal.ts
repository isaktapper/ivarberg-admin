/**
 * Torsdagsbrevet – datamodell för veckans FÖRSLAG (newsletter_issues.proposal)
 * och bygget av brevets innehåll (newsletter_issues.content) utifrån det
 * redaktören valt och skrivit.
 *
 * Modulen är medvetet fri från serverberoenden (sharp, OpenAI, Supabase,
 * Resend) så att godkännandesidan i webbläsaren kan importera den.
 */
import type { NewsletterContent, NewsletterListItem, NewsletterPick } from './types'

/** "Veckans tre" */
export const MAX_PICKS = 3
/** Riktmärke för raden om varje evenemang. Längre än så blir det tungt i mejlet. */
export const COMMENT_TARGET_LENGTH = 110
export const COMMENT_MAX_LENGTH = 240
export const SUBJECT_PREFIX = 'I Varberg i helgen:'
/** Längre ämnesrader kapas i de flesta inkorgar */
export const SUBJECT_TARGET_LENGTH = 70
export const SUBJECT_MAX_LENGTH = 150
export const PREHEADER_MAX_LENGTH = 200
export const INTRO_MAX_LENGTH = 800
export const SIGNOFF_MAX_LENGTH = 300
export const PS_MAX_LENGTH = 500

/** Ett tillfälle av ett evenemang under helgen */
export interface NewsletterOccurrence {
  eventId: number
  /** events.event_id */
  slug: string
  /** Lokal tid som i events.date_time */
  dateTime: string
}

/**
 * Ett helgevenemang att välja bland. Upprepade tillfällen av samma evenemang
 * (t.ex. en utställning som ligger som ett evenemang per dag) är sammanslagna
 * till EN kandidat – eventId/slug/dateTime gäller första tillfället i helgen.
 */
export interface NewsletterCandidate {
  eventId: number
  slug: string
  name: string
  dateTime: string
  venue: string | null
  price: string | null
  categories: string[]
  /** Början av beskrivningen, underlag för raden och visas på godkännandesidan */
  excerpt: string | null
  /** Evenemangets bild som den ligger i events.image_url (miniatyr på godkännandesidan) */
  imageUrl: string | null
  /** Färdig mejlbild: JPEG 1200×675 i publik Storage. Skapas när evenemanget väljs. */
  emailImageUrl: string | null
  featured: boolean
  qualityScore: number | null
  /** Rankningspoäng, högre är bättre (se scoreCandidate i weekend-events.ts) */
  score: number
  /** Alla tillfällen i helgen, i tidsordning */
  occurrences: NewsletterOccurrence[]
  /** Pågående utställning eller liknande som upprepas dag efter dag – hamnar sist i "Mer i helgen" */
  ongoing: boolean
}

export interface NewsletterSuggestion {
  /** Föreslaget urval i ordning, normalt tre */
  pickEventIds: number[]
  /** Föreslagen rad per evenemang (nyckel = eventId). Kan även finnas för reserver. */
  comments: Record<string, string>
  subject: string
  preheader: string
  intro: string
  /** 'ai' = OpenAI valde och skrev, 'fallback' = de högst rankade med tomma rader */
  source: 'ai' | 'fallback'
}

export interface NewsletterProposal {
  version: 1
  generatedAt: string
  issueDate: string
  weekendStart: string
  weekendEnd: string
  /** Alla helgens evenemang (sammanslagna), högst rankade först */
  candidates: NewsletterCandidate[]
  /** Antal unika evenemang i helgen (efter sammanslagning) */
  totalWeekendCount: number
  /** Antal rader i events för helgen (före sammanslagning) */
  rawEventCount: number
  suggestion: NewsletterSuggestion | null
}

/** Det redaktören kan ändra på godkännandesidan */
export interface NewsletterDraft {
  /** Utvalda evenemang i ordning (eventId från kandidaterna) */
  pickEventIds: number[]
  /** Rad per evenemang, nyckel = eventId */
  comments: Record<string, string>
  subject: string
  preheader: string
  intro: string
  signoff: string
  ps: string | null
}

/**
 * Ordningen i "Mer i helgen": viktigast först, pågående utställningar som
 * upprepas dag efter dag sist. Mallen visar de fem första per dag.
 */
export function compareForMore(a: NewsletterCandidate, b: NewsletterCandidate): number {
  if (a.ongoing !== b.ongoing) return a.ongoing ? 1 : -1
  if (a.score !== b.score) return b.score - a.score
  return a.dateTime.localeCompare(b.dateTime) || a.name.localeCompare(b.name, 'sv')
}

function toListItem(c: NewsletterCandidate): NewsletterListItem {
  return { slug: c.slug, name: c.name, dateTime: c.dateTime, venue: c.venue, price: c.price }
}

function toPick(c: NewsletterCandidate, comment: string): NewsletterPick {
  return {
    eventId: c.eventId,
    slug: c.slug,
    name: c.name,
    dateTime: c.dateTime,
    venue: c.venue,
    price: c.price,
    imageUrl: c.emailImageUrl ?? null,
    comment,
  }
}

/**
 * Bygger brevets innehåll av förslaget och redaktörens val. All evenemangsdata
 * tas från förslaget – utkastet bidrar bara med urval, ordning och text.
 */
export function buildContent(
  proposal: NewsletterProposal,
  draft: NewsletterDraft,
  previous?: NewsletterContent | null
): NewsletterContent {
  const byId = new Map(proposal.candidates.map((c) => [c.eventId, c]))
  const picked: NewsletterCandidate[] = []
  for (const id of draft.pickEventIds) {
    const c = byId.get(id)
    if (!c || picked.includes(c)) continue
    picked.push(c)
    if (picked.length >= MAX_PICKS) break
  }
  const pickedIds = new Set(picked.map((c) => c.eventId))

  return {
    issueDate: proposal.issueDate,
    weekendStart: proposal.weekendStart,
    weekendEnd: proposal.weekendEnd,
    subject: draft.subject.trim(),
    preheader: draft.preheader.trim(),
    intro: draft.intro.trim(),
    picks: picked.map((c) => toPick(c, (draft.comments[String(c.eventId)] ?? '').trim())),
    more: proposal.candidates
      .filter((c) => !pickedIds.has(c.eventId))
      .sort(compareForMore)
      .map(toListItem),
    totalWeekendCount: proposal.totalWeekendCount,
    signoff: draft.signoff.trim(),
    ps: draft.ps?.trim() || null,
    sponsor: previous?.sponsor ?? null,
  }
}

/** Utkastet som det sparade innehållet motsvarar (för att fortsätta redigera) */
export function draftFromContent(content: NewsletterContent): NewsletterDraft {
  return {
    pickEventIds: content.picks.map((p) => p.eventId),
    comments: Object.fromEntries(content.picks.map((p) => [String(p.eventId), p.comment])),
    subject: content.subject,
    preheader: content.preheader,
    intro: content.intro,
    signoff: content.signoff,
    ps: content.ps ?? null,
  }
}

/** Första utkastet: AI:ns (eller reservens) förslag plus standardavslutningen */
export function draftFromSuggestion(suggestion: NewsletterSuggestion, signoff: string): NewsletterDraft {
  return {
    pickEventIds: [...suggestion.pickEventIds],
    comments: { ...suggestion.comments },
    subject: suggestion.subject,
    preheader: suggestion.preheader,
    intro: suggestion.intro,
    signoff,
    ps: null,
  }
}

export interface DraftValidation {
  /** Hindrar godkännande */
  errors: string[]
  /** Värt att titta på, men stoppar inte */
  warnings: string[]
}

/** Kontrollerar att utkastet går att skicka. Används både på sidan och i API:t. */
export function validateDraft(proposal: NewsletterProposal, draft: NewsletterDraft): DraftValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const byId = new Map(proposal.candidates.map((c) => [c.eventId, c]))

  const ids = draft.pickEventIds
  if (ids.length === 0) errors.push('Välj minst ett evenemang till Veckans tre')
  if (ids.length > MAX_PICKS) errors.push(`Högst ${MAX_PICKS} utvalda evenemang`)
  if (new Set(ids).size !== ids.length) errors.push('Samma evenemang är valt flera gånger')
  const unknown = ids.filter((id) => !byId.has(id))
  if (unknown.length > 0) errors.push('Ett valt evenemang finns inte längre bland helgens kandidater')
  if (ids.length > 0 && ids.length < MAX_PICKS) warnings.push(`Bara ${ids.length} av ${MAX_PICKS} evenemang är valda`)

  for (const id of ids) {
    const c = byId.get(id)
    if (!c) continue
    const comment = (draft.comments[String(id)] ?? '').trim()
    if (!comment) warnings.push(`Rad saknas för ”${c.name}”`)
    else if (comment.length > COMMENT_MAX_LENGTH) errors.push(`Raden för ”${c.name}” är ${comment.length} tecken, max är ${COMMENT_MAX_LENGTH}`)
    if (!c.imageUrl) warnings.push(`”${c.name}” saknar bild och visas utan`)
  }

  const subject = draft.subject.trim()
  if (!subject) errors.push('Ämnesraden är tom')
  else if (subject.length > SUBJECT_MAX_LENGTH) errors.push(`Ämnesraden är ${subject.length} tecken, max är ${SUBJECT_MAX_LENGTH}`)
  else if (subject.length > SUBJECT_TARGET_LENGTH) warnings.push(`Ämnesraden är ${subject.length} tecken och kapas i många inkorgar`)

  if (draft.preheader.trim().length > PREHEADER_MAX_LENGTH) errors.push(`Preheadern är för lång, max ${PREHEADER_MAX_LENGTH} tecken`)
  if (!draft.intro.trim()) warnings.push('Introt är tomt')
  else if (draft.intro.trim().length > INTRO_MAX_LENGTH) errors.push(`Introt är för långt, max ${INTRO_MAX_LENGTH} tecken`)
  if (!draft.signoff.trim()) errors.push('Avslutningen är tom')
  else if (draft.signoff.trim().length > SIGNOFF_MAX_LENGTH) errors.push(`Avslutningen är för lång, max ${SIGNOFF_MAX_LENGTH} tecken`)
  if ((draft.ps ?? '').trim().length > PS_MAX_LENGTH) errors.push(`P.S. är för långt, max ${PS_MAX_LENGTH} tecken`)

  return { errors, warnings }
}
