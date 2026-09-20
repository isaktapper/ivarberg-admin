/**
 * Datamodell för dagens Instagram-FÖRSLAG (instagram_posts.proposal) och
 * validering av det slutliga valet innan publicering.
 *
 * Modulen är medvetet fri från server-beroenden (sharp, OpenAI, Supabase)
 * så att godkännandesidan i webbläsaren kan importera den.
 */

export type InstagramFormatKey = 'square' | 'portrait' | 'landscape'

/** Formaten i preferensordning (samma som INSTAGRAM_FORMATS i post-servicen) */
export const PROPOSAL_FORMATS: { key: InstagramFormatKey; label: string; width: number; height: number }[] = [
  { key: 'square', label: '1:1', width: 1080, height: 1080 },
  { key: 'portrait', label: '4:5', width: 1080, height: 1350 },
  { key: 'landscape', label: '1.91:1', width: 1080, height: 566 },
]

export const PROPOSAL_MAX_SLIDES = 5
export const CAPTION_MAX_LENGTH = 2200 // Instagrams gräns

export interface ProposalCandidate {
  eventId: number
  name: string
  venueName: string | null
  /** "19:00" eller "Heldag" */
  timeLabel: string
  /** Originalbilden (utan ImageKit-transformation) - det som croppas vid publicering */
  imageUrl: string
  width: number
  height: number
  /** Bildbedömning per format: ok = klarar strikta gaten, relaxedOk = duger för enbildspost */
  fits: Record<InstagramFormatKey, { ok: boolean; relaxedOk: boolean }>
  /** AI-rankningen listade eventet som huvudkandidat */
  isPrimaryCandidate: boolean
  /** Position i vision-rankningen (0 = bäst), null om bilden inte granskades */
  visionRank: number | null
  /** Variationsregler: eventet har varit huvudevent/slide nyligen */
  primaryRepeatBlocked: boolean
  slideRepeatBlocked: boolean
  lastShown: string | null
  timesShownThisWeek: number
}

export interface ProposalSuggestion {
  primaryEventId: number
  /** Övriga slides i ordning (utan huvudeventet) */
  slideEventIds: number[]
  format: InstagramFormatKey
  caption: string
  /** true = bilden klarade bara relaxed-gaten (enbildspost) */
  relaxed: boolean
}

export interface InstagramProposal {
  version: 1
  generatedAt: string
  postDate: string
  candidates: ProposalCandidate[]
  /** AI-rankningens huvudkandidater i prioritetsordning */
  primaryCandidateIds: number[]
  /** AI-rankningens "Det händer också"-lista */
  alsoTodayIds: number[]
  /** Dagens event som saknar bild och därför bara kan nämnas i captionen */
  eventsWithoutImage: { eventId: number; name: string; timeLabel: string }[]
  /** AI:ns rekommendation, null om ingen bild var användbar */
  suggestion: ProposalSuggestion | null
}

/** Det slutliga valet som publiceras */
export interface InstagramSelection {
  primaryEventId: number
  slideEventIds: number[] // övriga slides i ordning, utan huvudeventet
  format: InstagramFormatKey
  caption: string
}

export function formatLabel(key: InstagramFormatKey): string {
  return PROPOSAL_FORMATS.find((f) => f.key === key)?.label ?? key
}

/** Första formatet (i preferensordning) som kandidaten klarar strikt, annars relaxed, annars null */
export function defaultFormatFor(candidate: ProposalCandidate): InstagramFormatKey | null {
  return (
    PROPOSAL_FORMATS.find((f) => candidate.fits[f.key].ok)?.key ??
    PROPOSAL_FORMATS.find((f) => candidate.fits[f.key].relaxedOk)?.key ??
    null
  )
}

/** Format som kandidaten kan vara huvudevent i (strikt, eller relaxed för enbildspost) */
export function formatsFor(candidate: ProposalCandidate): InstagramFormatKey[] {
  return PROPOSAL_FORMATS.filter((f) => candidate.fits[f.key].ok || candidate.fits[f.key].relaxedOk).map(
    (f) => f.key
  )
}

export function selectionFromSuggestion(proposal: InstagramProposal): InstagramSelection | null {
  const s = proposal.suggestion
  if (!s) return null
  return { primaryEventId: s.primaryEventId, slideEventIds: [...s.slideEventIds], format: s.format, caption: s.caption }
}

export type SelectionValidation =
  | { ok: true; primary: ProposalCandidate; slides: ProposalCandidate[] }
  | { ok: false; error: string }

/**
 * Kontrollerar att ett val går att publicera: huvudeventet finns och klarar
 * formatet, övriga slides klarar samma format (karusellkrav), inga dubbletter,
 * max 5 slides, caption inom Instagrams gräns.
 */
export function validateSelection(proposal: InstagramProposal, selection: InstagramSelection): SelectionValidation {
  const byId = new Map(proposal.candidates.map((c) => [c.eventId, c]))
  const primary = byId.get(selection.primaryEventId)
  if (!primary) return { ok: false, error: 'Huvudeventet finns inte bland dagens kandidater' }

  if (!PROPOSAL_FORMATS.some((f) => f.key === selection.format)) {
    return { ok: false, error: `Okänt format: ${selection.format}` }
  }

  const slideIds = selection.slideEventIds.filter((id) => id !== primary.eventId)
  if (new Set(slideIds).size !== slideIds.length) return { ok: false, error: 'Samma event finns flera gånger bland slides' }
  if (slideIds.length > PROPOSAL_MAX_SLIDES - 1) {
    return { ok: false, error: `Max ${PROPOSAL_MAX_SLIDES} slides totalt` }
  }

  const primaryFit = primary.fits[selection.format]
  if (!primaryFit.ok) {
    if (!(primaryFit.relaxedOk && slideIds.length === 0)) {
      return {
        ok: false,
        error: `Bilden för "${primary.name}" klarar inte formatet ${formatLabel(selection.format)}${primaryFit.relaxedOk ? ' i en karusell (fungerar bara som enbildspost)' : ''}`,
      }
    }
  }

  const slides: ProposalCandidate[] = []
  for (const id of slideIds) {
    const c = byId.get(id)
    if (!c) return { ok: false, error: `Slide-event ${id} finns inte bland dagens kandidater` }
    if (!c.fits[selection.format].ok) {
      return { ok: false, error: `Bilden för "${c.name}" klarar inte formatet ${formatLabel(selection.format)}` }
    }
    slides.push(c)
  }

  const caption = selection.caption?.trim() ?? ''
  if (!caption) return { ok: false, error: 'Captionen är tom' }
  if (caption.length > CAPTION_MAX_LENGTH) {
    return { ok: false, error: `Captionen är ${caption.length} tecken, max är ${CAPTION_MAX_LENGTH}` }
  }

  return { ok: true, primary, slides }
}
