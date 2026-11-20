/**
 * Datamodell för dagens Instagram-FÖRSLAG (instagram_posts.proposal) och
 * validering av det slutliga valet innan publicering.
 *
 * Posten är en karusell i 4:5 ("vykortet"):
 *   1. Huvudeventet som vykort med en kort rubrik
 *   2. Listan "Mer i dag": topp tre + upp till fyra rader (kräver ingen bild)
 *   3+. Ev. extra vykort för riktigt snygga foton (max två)
 *
 * Modulen är medvetet fri från server-beroenden (sharp, OpenAI, Supabase)
 * så att godkännandesidan i webbläsaren kan importera den.
 */
import type { SlideSpec } from './instagram-slides'

export const CAPTION_MAX_LENGTH = 2200 // Instagrams gräns
export const HEADLINE_MAX_LENGTH = 40
export const PROPOSAL_LIST_MAX = 7 // topp tre + fyra rader (samma som LIST_MAX_COUNT i slides)
export const PROPOSAL_LIST_TOP = 3
export const PROPOSAL_MAX_EXTRA_SLIDES = 2
export const LIST_TITLE = 'Mer i dag'

export interface ProposalEvent {
  eventId: number
  name: string
  venueName: string | null
  /** "19:00" eller "Heldag" */
  timeLabel: string
  /** Första kategorin, visas som chip på vykortet */
  category: string | null
  /** Originalbilden (utan ImageKit-transformation), null om eventet saknar bild */
  imageUrl: string | null
  imageWidth: number
  imageHeight: number
  /** Bilden räcker till ett vykort (huvudevent eller extra slide) */
  imageUsable: boolean
  /** AI-rankningen listade eventet som huvudkandidat */
  isPrimaryCandidate: boolean
  /** Position i vision-rankningen (0 = bäst), null om bilden inte granskades */
  visionRank: number | null
  /** Vision-granskningen tyckte att fotot bär en egen slide */
  standout: boolean
  /** Variationsregler: eventet har varit huvudevent/slide nyligen */
  primaryRepeatBlocked: boolean
  slideRepeatBlocked: boolean
  lastShown: string | null
  timesShownThisWeek: number
}

export interface ProposalSuggestion {
  primaryEventId: number
  headline: string
  /** Listsliden i ordning (de tre första = topp tre) */
  listEventIds: number[]
  /** Extra vykort efter listan */
  extraSlideEventIds: number[]
  caption: string
}

export interface InstagramProposal {
  version: 2
  generatedAt: string
  postDate: string
  /** Alla dagens event (även utan bild - de kan stå i listan) */
  events: ProposalEvent[]
  /** AI-rankningens huvudkandidater i prioritetsordning */
  primaryCandidateIds: number[]
  /** AI-rankningens lista (topp tre först) */
  alsoTodayIds: number[]
  /** AI:ns rekommendation, null om ingen bild var användbar */
  suggestion: ProposalSuggestion | null
  /** Det som faktiskt publicerades (sätts vid publicering) */
  published?: InstagramSelection
}

/** Det slutliga valet som publiceras */
export interface InstagramSelection {
  primaryEventId: number
  headline: string
  listEventIds: number[]
  extraSlideEventIds: number[]
  caption: string
}

// ---------------------------------------------------------------------------
// Bakåtkompatibilitet: förslag som skapades före vykortet (version 1)
// ---------------------------------------------------------------------------

interface LegacyCandidate {
  eventId: number
  name: string
  venueName: string | null
  timeLabel: string
  imageUrl: string
  width: number
  height: number
  fits: Record<string, { ok: boolean; relaxedOk: boolean }>
  isPrimaryCandidate: boolean
  visionRank: number | null
  primaryRepeatBlocked: boolean
  slideRepeatBlocked: boolean
  lastShown: string | null
  timesShownThisWeek: number
}

interface LegacyProposal {
  version: 1
  generatedAt: string
  postDate: string
  candidates: LegacyCandidate[]
  primaryCandidateIds: number[]
  alsoTodayIds: number[]
  eventsWithoutImage: { eventId: number; name: string; timeLabel: string }[]
  suggestion: { primaryEventId: number; slideEventIds: number[]; caption: string } | null
}

/** Läser ett sparat förslag oavsett version */
export function normalizeProposal(raw: unknown): InstagramProposal | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as InstagramProposal | LegacyProposal
  if (p.version === 2) return p
  if (p.version !== 1) return null

  const events: ProposalEvent[] = [
    ...p.candidates.map((c) => ({
      eventId: c.eventId,
      name: c.name,
      venueName: c.venueName,
      timeLabel: c.timeLabel,
      category: null,
      imageUrl: c.imageUrl,
      imageWidth: c.width,
      imageHeight: c.height,
      imageUsable: Object.values(c.fits).some((f) => f.ok || f.relaxedOk),
      isPrimaryCandidate: c.isPrimaryCandidate,
      visionRank: c.visionRank,
      standout: false,
      primaryRepeatBlocked: c.primaryRepeatBlocked,
      slideRepeatBlocked: c.slideRepeatBlocked,
      lastShown: c.lastShown,
      timesShownThisWeek: c.timesShownThisWeek,
    })),
    ...p.eventsWithoutImage.map((e) => ({
      eventId: e.eventId,
      name: e.name,
      venueName: null,
      timeLabel: e.timeLabel,
      category: null,
      imageUrl: null,
      imageWidth: 0,
      imageHeight: 0,
      imageUsable: false,
      isPrimaryCandidate: false,
      visionRank: null,
      standout: false,
      primaryRepeatBlocked: false,
      slideRepeatBlocked: false,
      lastShown: null,
      timesShownThisWeek: 0,
    })),
  ]
  const s = p.suggestion
  const primary = s ? events.find((e) => e.eventId === s.primaryEventId) : undefined
  return {
    version: 2,
    generatedAt: p.generatedAt,
    postDate: p.postDate,
    events,
    primaryCandidateIds: p.primaryCandidateIds,
    alsoTodayIds: p.alsoTodayIds,
    suggestion:
      s && primary
        ? {
            primaryEventId: s.primaryEventId,
            headline: primary.name.slice(0, HEADLINE_MAX_LENGTH),
            listEventIds: [...new Set([...s.slideEventIds, ...p.alsoTodayIds])]
              .filter((id) => id !== s.primaryEventId && events.some((e) => e.eventId === id))
              .slice(0, PROPOSAL_LIST_MAX),
            extraSlideEventIds: [],
            caption: s.caption,
          }
        : null,
  }
}

// ---------------------------------------------------------------------------
// Val och validering
// ---------------------------------------------------------------------------

export function selectionFromSuggestion(proposal: InstagramProposal): InstagramSelection | null {
  const s = proposal.suggestion
  if (!s) return null
  return {
    primaryEventId: s.primaryEventId,
    headline: s.headline,
    listEventIds: [...s.listEventIds],
    extraSlideEventIds: [...s.extraSlideEventIds],
    caption: s.caption,
  }
}

export type SelectionValidation =
  | { ok: true; primary: ProposalEvent; list: ProposalEvent[]; extras: ProposalEvent[] }
  | { ok: false; error: string }

/**
 * Kontrollerar att ett val går att publicera: huvudeventet har en användbar
 * bild, rubriken finns, listan och extraslidesen innehåller dagens event utan
 * dubbletter och inom taken, och captionen håller Instagrams gräns.
 */
export function validateSelection(
  proposal: InstagramProposal,
  selection: InstagramSelection,
  options: { requireCaption?: boolean } = {}
): SelectionValidation {
  const byId = new Map(proposal.events.map((e) => [e.eventId, e]))
  const primary = byId.get(selection.primaryEventId)
  if (!primary) return { ok: false, error: 'Huvudeventet finns inte bland dagens event' }
  if (!primary.imageUsable || !primary.imageUrl) {
    return { ok: false, error: `"${primary.name}" har ingen bild som räcker till ett vykort` }
  }

  const headline = selection.headline?.trim() ?? ''
  if (!headline) return { ok: false, error: 'Rubriken är tom' }
  if (headline.length > HEADLINE_MAX_LENGTH) {
    return { ok: false, error: `Rubriken är ${headline.length} tecken, max är ${HEADLINE_MAX_LENGTH}` }
  }

  const listIds = selection.listEventIds ?? []
  if (new Set(listIds).size !== listIds.length) return { ok: false, error: 'Samma event finns flera gånger i listan' }
  if (listIds.length > PROPOSAL_LIST_MAX) return { ok: false, error: `Max ${PROPOSAL_LIST_MAX} event i listan` }
  const list: ProposalEvent[] = []
  for (const id of listIds) {
    const e = byId.get(id)
    if (!e) return { ok: false, error: `Event ${id} i listan finns inte bland dagens event` }
    if (id === primary.eventId) return { ok: false, error: 'Huvudeventet ska inte stå i listan' }
    list.push(e)
  }

  const extraIds = selection.extraSlideEventIds ?? []
  if (new Set(extraIds).size !== extraIds.length) return { ok: false, error: 'Samma extra vykort finns flera gånger' }
  if (extraIds.length > PROPOSAL_MAX_EXTRA_SLIDES) {
    return { ok: false, error: `Max ${PROPOSAL_MAX_EXTRA_SLIDES} extra vykort` }
  }
  const extras: ProposalEvent[] = []
  for (const id of extraIds) {
    const e = byId.get(id)
    if (!e) return { ok: false, error: `Extra vykort ${id} finns inte bland dagens event` }
    if (id === primary.eventId) return { ok: false, error: 'Huvudeventet kan inte vara ett extra vykort' }
    if (!e.imageUsable || !e.imageUrl) return { ok: false, error: `"${e.name}" har ingen bild som räcker till ett vykort` }
    extras.push(e)
  }

  if (options.requireCaption ?? true) {
    const caption = selection.caption?.trim() ?? ''
    if (!caption) return { ok: false, error: 'Captionen är tom' }
    if (caption.length > CAPTION_MAX_LENGTH) {
      return { ok: false, error: `Captionen är ${caption.length} tecken, max är ${CAPTION_MAX_LENGTH}` }
    }
  }

  return { ok: true, primary, list, extras }
}

/** Slidesen i publiceringsordning: vykort, lista (om den har rader), extra vykort */
export function slideSpecsFor(
  postDate: string,
  primary: ProposalEvent,
  headline: string,
  list: ProposalEvent[],
  extras: ProposalEvent[]
): SlideSpec[] {
  const vykort = (e: ProposalEvent, title: string): SlideSpec => ({
    kind: 'vykort',
    postDate,
    category: e.category,
    headline: title,
    timeLabel: e.timeLabel,
    place: e.venueName,
    imageUrl: e.imageUrl!,
  })
  const specs: SlideSpec[] = [vykort(primary, headline.trim())]
  if (list.length > 0) {
    specs.push({
      kind: 'list',
      postDate,
      title: LIST_TITLE,
      rows: list.map((e) => ({ name: e.name, timeLabel: e.timeLabel, place: e.venueName, imageUrl: e.imageUrl })),
    })
  }
  for (const e of extras) specs.push(vykort(e, e.name))
  return specs
}
