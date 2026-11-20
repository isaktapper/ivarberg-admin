/**
 * Delad pipeline för den dagliga Instagram-posten:
 * "Det här händer i Varberg idag".
 *
 * Körs av två triggers (idempotenskollen gör dubbletter omöjliga):
 *   - Vercel cron via /api/cron/instagram-post (primär - punktlig)
 *   - GitHub Actions via scripts/publish-instagram-post.ts (backup + manuell)
 *
 * POSTEN ("vykortet", alltid 4:5):
 *   1. Huvudeventet som vykort med en AI-skriven rubrik
 *   2. "Mer i dag": topp tre + upp till fyra rader (event utan bild går bra)
 *   3+. Extra vykort när vision-granskningen hittar riktigt snygga foton
 *
 * GODKÄNNANDEFLÖDET (standard när NTFY_TOPIC är satt):
 *   1. Första körningen efter kl 07 (Stockholm) analyserar dagen: hämtar
 *      publicerade event, AI-rankar, bedömer och vision-granskar bilder och
 *      tar fram ett förslag (huvudevent, rubrik, lista, extra vykort,
 *      caption). Förslaget sparas i instagram_posts med status 'pending' och
 *      en engångstoken, och en ntfy-notis med det färdiga vykortet skickas
 *      med länk till godkännandesidan (/instagram/approve/<token>) + knappar
 *      för att publicera förslaget direkt eller hoppa över dagen.
 *   2. På sidan väljer man huvudevent, ändrar rubrik och lista, justerar
 *      captionen och publicerar (API: /api/instagram/approve/<token>).
 *   3. Nästa cron-körning efter kl 10 publicerar förslaget automatiskt om
 *      ingen svarat (INSTAGRAM_AUTO_PUBLISH=false stänger av det).
 *
 * DIREKTFLÖDET (INSTAGRAM_APPROVAL_FLOW=off, --direct, --event=ID, eller när
 * NTFY_TOPIC saknas): analysera och posta i samma körning.
 *
 * Publicering = rita slidesen (instagram-slides.ts), ladda upp till Supabase
 * Storage och skicka { image_urls, caption } till Make.com-webhooken som
 * postar karusellen. Loggas i instagram_posts + PostHog.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'
import { Event, InstagramApprovalSource, InstagramPost } from '@/types/database'
import {
  getStockholmHour,
  getStockholmDateString,
  getTodayEvents,
  getRecentlyFeatured,
  getRecentCaptionOpenings,
  normalizeEventName,
  rankEvents,
  assessPhoto,
  originalImageUrl,
  reviewImages,
  generateHeadline,
  generateCaption,
  uploadSlideImages,
  uploadPreviewImage,
  isSlideRepeatBlocked,
  isPrimaryRepeatBlocked,
  hasHitWeeklyCap,
  lastAppearance,
  appearanceCount,
  PhotoAssessment,
  RecentlyFeatured,
  MAX_VISION_CANDIDATES,
  MAX_ALSO_COUNT,
} from './instagram-post-service'
import {
  InstagramProposal,
  InstagramSelection,
  ProposalEvent,
  PROPOSAL_MAX_EXTRA_SLIDES,
  normalizeProposal,
  selectionFromSuggestion,
  slideSpecsFor,
  validateSelection,
} from './instagram-proposal'
import { renderSlide } from './instagram-slides'
import { MakeWebhookPublisher } from './instagram-publisher'
import { getPostHogClient } from './openai-client'
import { alertService } from './alert-service'
import { ntfyConfigured, sendNtfy } from './ntfy'

export const POSTING_HOUR = 8 // Europe/Stockholm - direktflödet postar tidigast då
export const POSTING_WINDOW_END = 12 // sista timmen (inklusive) då en försenad cron får posta direkt
export const PROPOSAL_HOUR = 7 // godkännandeflödet: förslag + notis tidigast då
export const AUTO_PUBLISH_HOUR = 10 // godkännandeflödet: pending-förslag auto-publiceras av körningar från och med då

export interface InstagramRunOptions {
  force?: boolean // kringgå timvakten
  dryRun?: boolean // generera allt men skicka/logga inte
  /**
   * Tvinga ett visst event som huvudevent (vykortet). Listan fylls som
   * vanligt. Kringgår idempotenskollen och timvakten och postar direkt -
   * används för att göra om dagens post manuellt. Kastar fel om eventet inte
   * finns bland dagens event eller saknar en bild som räcker till vykortet.
   */
  primaryEventId?: number
  /** Posta direkt utan godkännande (gamla flödet) även om ntfy är konfigurerat */
  direct?: boolean
}

export type InstagramRunStatus =
  | 'published'
  | 'pending' // förslag skapat, notis skickad
  | 'awaiting-approval' // förslag finns redan, väntar på svar (inget gjort)
  | 'already-posted'
  | 'too-early'
  | 'missed-window'
  | 'skipped'
  | 'failed'
  | 'dry-run'

export interface InstagramRunResult {
  ok: boolean
  status: InstagramRunStatus
  postDate: string
  reason?: string
  eventId?: number
  eventName?: string
  caption?: string
  headline?: string
  imageUrl?: string // första sliden (bakåtkompat för cron-route/CLI-output)
  imageUrls?: string[] // alla slides i publiceringsordning
  approvalUrl?: string // godkännandesidan (status 'pending')
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} environment variable`)
  return value
}

export function approvalFlowEnabled(): boolean {
  return process.env.INSTAGRAM_APPROVAL_FLOW !== 'off' && ntfyConfigured()
}

export function autoPublishEnabled(): boolean {
  return process.env.INSTAGRAM_AUTO_PUBLISH !== 'false'
}

export function approvalUrlFor(token: string): string {
  const base = (process.env.ADMIN_BASE_URL || 'https://admin.ivarberg.nu').replace(/\/$/, '')
  return `${base}/instagram/approve/${token}`
}

function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** "19:00" ur events.date_time (lokal tid utan tidszon), "Heldag" vid 00:00 */
export function eventTimeLabel(event: Pick<Event, 'date_time'>): string {
  const t = (event.date_time || '').slice(11, 16)
  return !t || t === '00:00' ? 'Heldag' : t
}

// ---------------------------------------------------------------------------
// Analys av dagen: event -> ranking -> bildbedömning -> förslag
// ---------------------------------------------------------------------------

export interface DayAnalysis {
  events: Event[]
  eventById: Map<number, Event>
  primaryCandidateIds: number[]
  proposal: InstagramProposal
}

function toProposalEvent(
  event: Event,
  photo: PhotoAssessment | undefined,
  recent: RecentlyFeatured,
  extra: { isPrimaryCandidate: boolean; visionRank: number | null; standout: boolean }
): ProposalEvent {
  const shown = appearanceCount(event, recent)
  return {
    eventId: event.id,
    name: event.name,
    venueName: event.venue_name || event.location || null,
    timeLabel: eventTimeLabel(event),
    category: event.categories?.[0] ?? null,
    imageUrl: event.image_url && photo && !photo.unreachable ? originalImageUrl(event.image_url) : null,
    imageWidth: photo?.width ?? 0,
    imageHeight: photo?.height ?? 0,
    imageUsable: !!photo?.usable,
    isPrimaryCandidate: extra.isPrimaryCandidate,
    visionRank: extra.visionRank,
    standout: extra.standout,
    primaryRepeatBlocked: isPrimaryRepeatBlocked(event, recent),
    slideRepeatBlocked: isSlideRepeatBlocked(event, recent),
    lastShown: shown > 0 ? lastAppearance(event, recent) : null,
    timesShownThisWeek: shown,
  }
}

/**
 * Listan "Mer i dag": rankingens övriga huvudkandidater först (de är dagens
 * starkaste), sedan rankingens lista, och därefter fylls den på med dagens
 * övriga event i tidsordning upp till taket - utom sådana som synts de
 * senaste dagarna eller nått veckotaket (långkörare). Huvudeventet, extra
 * vykort och namn-dubbletter hoppas alltid över.
 */
export function buildListEvents(
  primary: Event,
  exclude: Event[],
  rankedPrimaryCandidates: Event[],
  rankedAlso: Event[],
  allEvents: Event[],
  recent: RecentlyFeatured
): Event[] {
  const seen = new Set<string>([primary, ...exclude].map((e) => normalizeEventName(e.name)))
  const result: Event[] = []
  const add = (e: Event, filler: boolean) => {
    if (result.length >= MAX_ALSO_COUNT) return
    const name = normalizeEventName(e.name)
    if (seen.has(name)) return
    if (filler && (hasHitWeeklyCap(e, recent) || isSlideRepeatBlocked(e, recent))) return
    seen.add(name)
    result.push(e)
  }
  for (const e of [...rankedPrimaryCandidates, ...rankedAlso]) add(e, false)
  for (const e of allEvents) add(e, true)
  return result
}

/**
 * Kör hela analysen för dagen och bygger det sparbara förslaget. Kastar inte
 * på "inga event"/"ingen bild" - då är proposal.suggestion null.
 */
export async function analyzeDay(
  supabase: SupabaseClient,
  postDate: string,
  options: { forcedPrimaryId?: number } = {}
): Promise<DayAnalysis> {
  const forcedPrimaryId = options.forcedPrimaryId

  // 1. Dagens event
  console.log(`📅 Hämtar publicerade event för ${postDate} (Europe/Stockholm)...`)
  const events = await getTodayEvents(supabase)
  console.log(`   Hittade ${events.length} event\n`)
  const eventById = new Map(events.map((e) => [e.id, e]))
  const recentlyFeatured = await getRecentlyFeatured(supabase)

  const proposalBase = {
    version: 2 as const,
    generatedAt: new Date().toISOString(),
    postDate,
  }

  if (events.length === 0) {
    return {
      events,
      eventById,
      primaryCandidateIds: [],
      proposal: { ...proposalBase, events: [], primaryCandidateIds: [], alsoTodayIds: [], suggestion: null },
    }
  }

  // 2. Variationshistorik + AI-ranking
  console.log('🕑 Hämtar Instagram-historik (variationsregler, 7 dagar)...')
  console.log(
    `   ${recentlyFeatured.recentPrimaryIds.size} nyligen primära, ${recentlyFeatured.recentMentionIds.size} nyligen nämnda\n`
  )
  console.log('🤖 Steg 1/4: AI rankar dagens event...')
  const ranking = await rankEvents(events, recentlyFeatured)
  console.log(`   Huvudkandidater: ${ranking.primaryCandidates.map((id) => eventById.get(id)?.name).join(' | ')}`)
  console.log(`   Lista: ${ranking.alsoToday.length} event\n`)

  // 3. Bildbedömning (alla event med bild - listans frimärken behöver också
  // en nåbar bild) + vision-rankning av de som räcker till vykort
  console.log('🖼️  Steg 2/4: Bedömer och granskar bilder...')
  const photos = new Map<number, PhotoAssessment>()
  await Promise.all(
    events
      .filter((e) => e.image_url)
      .map(async (e) => photos.set(e.id, await assessPhoto(originalImageUrl(e.image_url!))))
  )
  for (const e of events) {
    const p = photos.get(e.id)
    if (!p) continue
    console.log(`   ${p.unreachable ? '✗' : p.usable ? '✓' : '~'} ${e.name}${p.unreachable ? ' (kunde inte läsas)' : ` (${p.width}x${p.height})`}`)
  }

  // Vision-pool i prioritetsordning: huvudkandidater, listan, övriga.
  // Dedupe på normaliserat namn (återkommande event får nya id:n varje dag).
  const priorityIds = [...new Set([...ranking.primaryCandidates, ...ranking.alsoToday, ...events.map((e) => e.id)])]
  const visionPool: Event[] = []
  const poolNames = new Set<string>()
  for (const id of priorityIds) {
    const e = eventById.get(id)
    if (!e || !photos.get(id)?.usable) continue
    const name = normalizeEventName(e.name)
    if (poolNames.has(name)) continue
    poolNames.add(name)
    visionPool.push(e)
  }

  let rankedIds = visionPool.map((e) => e.id)
  let standoutIds: number[] = []
  if (visionPool.length > 1) {
    try {
      const review = await reviewImages(
        visionPool.slice(0, MAX_VISION_CANDIDATES).map((e) => ({ event: e, imageUrl: originalImageUrl(e.image_url!) }))
      )
      const unusable = new Set(review.unusableEventIds)
      rankedIds = [...review.rankedEventIds, ...rankedIds.filter((id) => !review.rankedEventIds.includes(id))].filter(
        (id) => !unusable.has(id)
      )
      standoutIds = review.standoutEventIds
    } catch (error) {
      console.warn(
        '   ⚠️ Vision-granskningen misslyckades - använder programmatisk ordning:',
        error instanceof Error ? error.message : error
      )
    }
  }
  const visionRankById = new Map(rankedIds.map((id, i) => [id, i]))
  const primaryCandidateSet = new Set(ranking.primaryCandidates)

  // 4. Huvudevent: tvingat, annars bäst rankade huvudkandidat med vykortsbild,
  // annars bästa bild som inte är spärrad, annars bästa bild över huvud taget
  // (en repris är bättre än ingen post).
  let primary: Event | null = null
  if (forcedPrimaryId != null) {
    primary = eventById.get(forcedPrimaryId) ?? null
    if (!primary) throw new Error(`Event ${forcedPrimaryId} finns inte bland dagens publicerade event`)
    if (!photos.get(forcedPrimaryId)?.usable) {
      throw new Error(`Bilden för "${primary.name}" (id ${forcedPrimaryId}) räcker inte till ett vykort`)
    }
  } else {
    const ranked = rankedIds.map((id) => eventById.get(id)).filter((e): e is Event => !!e)
    primary =
      ranked.find((e) => primaryCandidateSet.has(e.id)) ??
      ranked.find((e) => !isPrimaryRepeatBlocked(e, recentlyFeatured)) ??
      ranked[0] ??
      null
  }

  const proposalEvents = events.map((e) =>
    toProposalEvent(e, photos.get(e.id), recentlyFeatured, {
      isPrimaryCandidate: primaryCandidateSet.has(e.id),
      visionRank: visionRankById.get(e.id) ?? null,
      standout: standoutIds.includes(e.id),
    })
  )

  if (!primary) {
    return {
      events,
      eventById,
      primaryCandidateIds: ranking.primaryCandidates,
      proposal: {
        ...proposalBase,
        events: proposalEvents,
        primaryCandidateIds: ranking.primaryCandidates,
        alsoTodayIds: ranking.alsoToday,
        suggestion: null,
      },
    }
  }
  console.log(`   🏆 Huvudevent: ${primary.name}`)

  // Extra vykort: bara riktigt snygga foton som inte synts nyligen
  const primaryName = normalizeEventName(primary.name)
  const extras = standoutIds
    .map((id) => eventById.get(id))
    .filter((e): e is Event => !!e && e.id !== primary!.id && normalizeEventName(e.name) !== primaryName)
    .filter((e) => !isSlideRepeatBlocked(e, recentlyFeatured))
    .slice(0, PROPOSAL_MAX_EXTRA_SLIDES)
  if (extras.length > 0) console.log(`   ✨ Extra vykort: ${extras.map((e) => e.name).join(' | ')}`)

  const listEvents = buildListEvents(
    primary,
    extras,
    ranking.primaryCandidates.map((id) => eventById.get(id)).filter((e): e is Event => !!e),
    ranking.alsoToday.map((id) => eventById.get(id)).filter((e): e is Event => !!e),
    events,
    recentlyFeatured
  )
  console.log(`   📋 Lista (${listEvents.length}): ${listEvents.map((e) => e.name).join(' | ') || '(tom)'}\n`)

  // 5. Rubrik + caption
  console.log('✍️  Steg 3/4: Skriver rubrik...')
  const headline = await generateHeadline(primary)
  console.log(`   "${headline}"\n`)
  console.log('✍️  Steg 4/4: Skriver caption...')
  const recentOpenings = await getRecentCaptionOpenings(supabase)
  const caption = await generateCaption(primary, listEvents, recentOpenings)

  return {
    events,
    eventById,
    primaryCandidateIds: ranking.primaryCandidates,
    proposal: {
      ...proposalBase,
      events: proposalEvents,
      primaryCandidateIds: ranking.primaryCandidates,
      alsoTodayIds: ranking.alsoToday,
      suggestion: {
        primaryEventId: primary.id,
        headline,
        listEventIds: listEvents.map((e) => e.id),
        extraSlideEventIds: extras.map((e) => e.id),
        caption,
      },
    },
  }
}

/** Hämta event per id */
export async function getEventsByIds(supabase: SupabaseClient, ids: number[]): Promise<Map<number, Event>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('events').select('*').in('id', ids)
  if (error) throw new Error(`Kunde inte hämta event: ${error.message}`)
  return new Map(((data || []) as Event[]).map((e) => [e.id, e]))
}

/** Rita alla slides för ett validerat val */
export async function renderSelectionSlides(
  proposal: InstagramProposal,
  selection: InstagramSelection,
  options: { width?: number; quality?: number; requireCaption?: boolean } = {}
): Promise<Buffer[]> {
  const validation = validateSelection(proposal, selection, { requireCaption: options.requireCaption })
  if (!validation.ok) throw new Error(validation.error)
  const specs = slideSpecsFor(proposal.postDate, validation.primary, selection.headline, validation.list, validation.extras)
  const requiredCount = validation.list.length > 0 ? 2 : 1 // vykort + ev. lista måste lyckas
  const rendered = await Promise.all(
    specs.map(async (spec, i) => {
      try {
        return await renderSlide(spec, { width: options.width, quality: options.quality })
      } catch (error) {
        if (i < requiredCount) throw error
        console.warn(`  ⚠️ Extra vykort ${i + 1} kunde inte ritas - hoppar över:`, error instanceof Error ? error.message : error)
        return null
      }
    })
  )
  return rendered.filter((b): b is Buffer => !!b)
}

// ---------------------------------------------------------------------------
// Publicering av ett val (används av direktflödet, godkännandesidan och
// auto-publiceringen)
// ---------------------------------------------------------------------------

export interface PublishOptions {
  source: InstagramApprovalSource
  /** Hoppa över Make-anropet och databasskrivningen (bilderna laddas ändå upp för granskning) */
  dryRun?: boolean
  /** Antal huvudkandidater från rankingen, för statistik */
  candidatesCount?: number
}

/**
 * Validerar valet mot förslaget, ritar och laddar upp slides, skickar till
 * Make och uppdaterar instagram_posts. Kastar vid fel (raden markeras
 * 'failed' om Make-anropet misslyckas).
 */
export async function publishSelection(
  supabase: SupabaseClient,
  postDate: string,
  proposal: InstagramProposal,
  selection: InstagramSelection,
  options: PublishOptions
): Promise<InstagramRunResult> {
  const validation = validateSelection(proposal, selection)
  if (!validation.ok) throw new Error(validation.error)
  const { primary, list, extras } = validation
  const caption = selection.caption.trim()
  const headline = selection.headline.trim()
  const finalSelection: InstagramSelection = { ...selection, caption, headline }

  console.log('🖼️  Ritar slides och laddar upp till Supabase Storage...')
  const slides = await renderSelectionSlides(proposal, finalSelection)
  const slideImageUrls = await uploadSlideImages(supabase, slides, postDate)

  console.log('\n' + '='.repeat(60))
  console.log('📋 POST-INNEHÅLL')
  console.log('='.repeat(60))
  console.log(`Vykort: ${primary.name} (id ${primary.eventId}) - "${headline}"`)
  console.log(`Lista (${list.length}): ${list.map((e) => e.name).join(' | ') || '(ingen listslide)'}`)
  if (extras.length) console.log(`Extra vykort: ${extras.map((e) => e.name).join(' | ')}`)
  slideImageUrls.forEach((url, i) => console.log(`  ${i + 1}. ${url}`))
  console.log('-'.repeat(60))
  console.log(caption)
  console.log('='.repeat(60) + '\n')

  const resultBase = {
    postDate,
    eventId: primary.eventId,
    eventName: primary.name,
    caption,
    headline,
    imageUrl: slideImageUrls[0],
    imageUrls: slideImageUrls,
  }

  if (options.dryRun) {
    console.log('🧪 DRY RUN - ingen post skickas, ingen databasrad skapas.')
    return { ok: true, status: 'dry-run', ...resultBase }
  }

  const rowBase = {
    post_date: postDate,
    event_id: primary.eventId,
    // Listans event räknas som omnämnda i variationsreglerna
    also_event_ids: list.map((e) => e.eventId),
    caption,
    image_url: primary.imageUrl,
    proxied_image_url: slideImageUrls[0],
    // Event med eget vykort (huvudevent + extra) - slide_image_urls har
    // dessutom listsliden, så längderna skiljer sig när listan finns
    slide_event_ids: [primary.eventId, ...extras.map((e) => e.eventId)],
    slide_image_urls: slideImageUrls,
    candidates_count: options.candidatesCount ?? proposal.primaryCandidateIds.length,
    approval_source: options.source,
    proposal: { ...proposal, published: finalSelection },
  }

  console.log('🚀 Skickar till Make.com-webhook...')
  const publisher = new MakeWebhookPublisher()
  try {
    await publisher.publish({ imageUrls: slideImageUrls, caption })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    await supabase
      .from('instagram_posts')
      .upsert({ ...rowBase, status: 'failed', error: errorMsg }, { onConflict: 'post_date' })
    throw error
  }

  const { error: upsertError } = await supabase.from('instagram_posts').upsert(
    {
      ...rowBase,
      status: 'published',
      error: null,
      posted_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
    },
    { onConflict: 'post_date' }
  )
  if (upsertError) {
    console.error('⚠️ Posten skickades men kunde inte loggas i instagram_posts:', upsertError.message)
  }

  getPostHogClient().capture({
    distinctId: 'instagram-bot',
    event: 'instagram_post_published',
    properties: {
      post_date: postDate,
      event_id: primary.eventId,
      event_name: primary.name,
      headline,
      candidates_count: rowBase.candidates_count,
      list_count: list.length,
      extra_count: extras.length,
      slide_count: slideImageUrls.length,
      caption_length: caption.length,
      approval_source: options.source,
    },
  })

  console.log('✅ Posten skickad till Make - klar!\n')
  return { ok: true, status: 'published', ...resultBase }
}

// ---------------------------------------------------------------------------
// ntfy-notiser
// ---------------------------------------------------------------------------

async function notifyProposal(
  postDate: string,
  proposal: InstagramProposal,
  token: string,
  previewUrl: string | null
): Promise<boolean> {
  const url = approvalUrlFor(token)
  const apiUrl = `${(process.env.ADMIN_BASE_URL || 'https://admin.ivarberg.nu').replace(/\/$/, '')}/api/instagram/approve/${token}`
  const s = proposal.suggestion!
  const byId = new Map(proposal.events.map((e) => [e.eventId, e]))
  const primary = byId.get(s.primaryEventId)
  const top = s.listEventIds.slice(0, 3).map((id) => byId.get(id)?.name).filter(Boolean)

  const lines = [`Vykort: "${s.headline}" (${primary?.name ?? '?'} kl ${primary?.timeLabel ?? '?'})`]
  if (s.listEventIds.length) lines.push(`Lista: ${s.listEventIds.length} tips, topp tre ${top.join(', ')}`)
  if (s.extraSlideEventIds.length) lines.push(`+ ${s.extraSlideEventIds.length} extra vykort`)
  lines.push(
    autoPublishEnabled()
      ? `Publiceras automatiskt från kl ${AUTO_PUBLISH_HOUR} om du inte gör något.`
      : 'Publiceras INTE förrän du godkänner.'
  )

  const jsonHeaders = { 'Content-Type': 'application/json' }
  return sendNtfy({
    title: `Instagram ${postDate}: ${s.headline}`,
    message: lines.join('\n'),
    click: url,
    attach: previewUrl ?? primary?.imageUrl ?? undefined,
    priority: 4,
    tags: ['camera'],
    actions: [
      { action: 'view', label: 'Granska & ändra', url },
      {
        action: 'http',
        label: 'Publicera förslaget',
        url: apiUrl,
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ action: 'publish', source: 'ntfy' }),
        clear: true,
      },
      {
        action: 'http',
        label: 'Hoppa över idag',
        url: apiUrl,
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ action: 'skip', source: 'ntfy' }),
        clear: true,
      },
    ],
  })
}

/** Rita vykortet och lägg upp det som förhandsbild till notisen (null om något går fel) */
async function uploadProposalPreview(supabase: SupabaseClient, proposal: InstagramProposal): Promise<string | null> {
  const selection = selectionFromSuggestion(proposal)
  if (!selection) return null
  try {
    const validation = validateSelection(proposal, selection, { requireCaption: false })
    if (!validation.ok) return null
    const [spec] = slideSpecsFor(proposal.postDate, validation.primary, selection.headline, [], [])
    const jpeg = await renderSlide(spec, { width: 720, quality: 82 })
    return await uploadPreviewImage(supabase, jpeg, proposal.postDate)
  } catch (error) {
    console.warn('  ⚠️ Kunde inte rita förhandsbild till notisen:', error instanceof Error ? error.message : error)
    return null
  }
}

// ---------------------------------------------------------------------------
// Huvudflödet
// ---------------------------------------------------------------------------

export async function runDailyInstagramPost(options: InstagramRunOptions = {}): Promise<InstagramRunResult> {
  const forcedPrimaryId = options.primaryEventId
  const force = (options.force ?? false) || forcedPrimaryId != null
  const dryRun = options.dryRun ?? false
  const direct = (options.direct ?? false) || forcedPrimaryId != null || !approvalFlowEnabled()
  if (forcedPrimaryId != null) console.log(`📌 Tvingat huvudevent: id ${forcedPrimaryId}\n`)

  console.log('📸 Daglig Instagram-post: "Det här händer i Varberg idag"')
  console.log(direct ? '   Läge: direktpublicering\n' : '   Läge: godkännande via ntfy\n')

  requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  requireEnv('OPENAI_API_KEY')
  if (!dryRun) requireEnv('MAKE_WEBHOOK_URL')

  const supabase = serviceClient()
  const posthog = getPostHogClient()
  const postDate = getStockholmDateString()
  const hour = getStockholmHour()

  try {
    const { data: existingRow } = await supabase
      .from('instagram_posts')
      .select('*')
      .eq('post_date', postDate)
      .maybeSingle()
    const existing = (existingRow ?? null) as InstagramPost | null

    async function recordSkip(reason: string, candidatesCount: number) {
      console.log(`⏭️  Hoppar över dagens post: ${reason}`)
      if (!dryRun) {
        await supabase
          .from('instagram_posts')
          .upsert({ post_date: postDate, status: 'skipped', error: reason, candidates_count: candidatesCount }, { onConflict: 'post_date' })
      }
      posthog.capture({
        distinctId: 'instagram-bot',
        event: 'instagram_post_skipped',
        properties: { post_date: postDate, reason, candidates_count: candidatesCount },
      })
    }

    // ------------------------------------------------------------------
    // Godkännandeflödet
    // ------------------------------------------------------------------
    if (!direct) {
      if (existing?.status === 'published') {
        console.log(`✅ Redan postat idag (${postDate}, rad #${existing.id}) - avslutar.`)
        return { ok: true, status: 'already-posted', postDate }
      }
      if (existing?.status === 'skipped') {
        console.log(`⏭️  Dagens post är markerad som överhoppad (${existing.error ?? 'ingen orsak'}) - avslutar.`)
        return { ok: true, status: 'skipped', postDate, reason: existing.error ?? undefined }
      }
      if (existing?.status === 'failed') {
        console.log(`⚠️ Dagens post misslyckades tidigare (${existing.error}) - gör inget automatiskt, försök igen via godkännandesidan.`)
        return { ok: false, status: 'failed', postDate, reason: existing.error ?? undefined }
      }

      if (existing?.status === 'pending') {
        const proposal = normalizeProposal(existing.proposal)
        const selection = proposal ? selectionFromSuggestion(proposal) : null
        if (!proposal || !selection) {
          await recordSkip('Förslaget saknar användbar rekommendation', existing.candidates_count ?? 0)
          return { ok: true, status: 'skipped', postDate, reason: 'Förslaget saknar användbar rekommendation' }
        }
        if (dryRun) {
          console.log('🧪 DRY RUN - förslag väntar, inget görs.')
          return { ok: true, status: 'dry-run', postDate, approvalUrl: approvalUrlFor(existing.approval_token!) }
        }
        if (!autoPublishEnabled()) {
          console.log(`⏳ Förslaget väntar på godkännande (auto-publicering avstängd): ${approvalUrlFor(existing.approval_token!)}`)
          return { ok: true, status: 'awaiting-approval', postDate, approvalUrl: approvalUrlFor(existing.approval_token!) }
        }
        if (hour < AUTO_PUBLISH_HOUR && !force) {
          console.log(`⏳ Förslaget väntar på godkännande (klockan är ${hour}, auto-publicering från ${AUTO_PUBLISH_HOUR}).`)
          return { ok: true, status: 'awaiting-approval', postDate, approvalUrl: approvalUrlFor(existing.approval_token!) }
        }

        console.log(`⏰ Klockan är ${hour} och ingen har svarat - publicerar AI-förslaget automatiskt.`)
        const result = await publishSelection(supabase, postDate, proposal, selection, { source: 'auto' })
        await sendNtfy({
          title: `Instagram ${postDate}: publicerad automatiskt`,
          message: `"${result.headline}" (${result.eventName}) publicerades kl ${hour} eftersom ingen svarade på förslaget.`,
          click: approvalUrlFor(existing.approval_token!),
          priority: 3,
          tags: ['white_check_mark'],
        })
        return result
      }

      // Ingen rad idag: skapa förslag
      if (hour < PROPOSAL_HOUR && !force) {
        console.log(`⏭️  Klockan är ${hour} i Stockholm (före ${PROPOSAL_HOUR}) - hoppar över. Använd force för att kringgå.`)
        return { ok: true, status: 'too-early', postDate, reason: `Stockholm-timme ${hour}` }
      }

      const analysis = await analyzeDay(supabase, postDate)
      if (analysis.events.length === 0) {
        await recordSkip('Inga publicerade event idag', 0)
        await sendNtfy({ title: `Instagram ${postDate}: ingen post`, message: 'Inga publicerade event idag.', priority: 2, tags: ['zzz'] })
        return { ok: true, status: 'skipped', postDate, reason: 'Inga publicerade event idag' }
      }
      if (!analysis.proposal.suggestion) {
        await recordSkip('Inga event med användbar bild', analysis.primaryCandidateIds.length)
        await sendNtfy({
          title: `Instagram ${postDate}: ingen post`,
          message: `Inga av dagens ${analysis.events.length} event hade en bild som räcker till ett vykort.`,
          priority: 3,
          tags: ['warning'],
        })
        return { ok: true, status: 'skipped', postDate, reason: 'Inga event med användbar bild' }
      }

      const token = nanoid(32)
      const s = analysis.proposal.suggestion
      const primaryName = analysis.eventById.get(s.primaryEventId)?.name

      if (dryRun) {
        console.log('🧪 DRY RUN - förslaget sparas inte och ingen notis skickas.')
        console.log(JSON.stringify(analysis.proposal.suggestion, null, 2))
        return { ok: true, status: 'dry-run', postDate, eventId: s.primaryEventId, eventName: primaryName, caption: s.caption, headline: s.headline }
      }

      const previewUrl = await uploadProposalPreview(supabase, analysis.proposal)
      const { error: insertError } = await supabase.from('instagram_posts').upsert(
        {
          post_date: postDate,
          status: 'pending',
          proposal: analysis.proposal,
          approval_token: token,
          event_id: s.primaryEventId,
          caption: s.caption,
          image_url: analysis.eventById.get(s.primaryEventId)?.image_url ?? null,
          proxied_image_url: previewUrl,
          candidates_count: analysis.primaryCandidateIds.length,
          error: null,
          notified_at: new Date().toISOString(),
        },
        { onConflict: 'post_date' }
      )
      if (insertError) throw new Error(`Kunde inte spara förslaget: ${insertError.message}`)

      const notified = await notifyProposal(postDate, analysis.proposal, token, previewUrl)
      if (!notified) {
        await alertService.alert({
          severity: 'warning',
          category: 'api',
          title: '⚠️ Instagram-förslag utan notis',
          message: `Förslaget för ${postDate} sparades men ntfy-notisen kunde inte skickas. Granska här: ${approvalUrlFor(token)}`,
          details: { post_date: postDate },
          source: 'instagram-post-runner',
        })
      }

      posthog.capture({
        distinctId: 'instagram-bot',
        event: 'instagram_post_proposed',
        properties: {
          post_date: postDate,
          event_id: s.primaryEventId,
          list_count: s.listEventIds.length,
          extra_count: s.extraSlideEventIds.length,
          events: analysis.proposal.events.length,
          notified,
        },
      })

      console.log(`📨 Förslag sparat och notis ${notified ? 'skickad' : 'EJ skickad'}: ${approvalUrlFor(token)}\n`)
      return {
        ok: true,
        status: 'pending',
        postDate,
        eventId: s.primaryEventId,
        eventName: primaryName,
        caption: s.caption,
        headline: s.headline,
        approvalUrl: approvalUrlFor(token),
      }
    }

    // ------------------------------------------------------------------
    // Direktflödet (gamla beteendet)
    // ------------------------------------------------------------------
    if (existing?.status === 'published') {
      if (forcedPrimaryId != null) {
        console.log(`ℹ️  Redan postat idag (rad #${existing.id}) - gör om posten med tvingat huvudevent.`)
      } else if (dryRun) {
        console.log(`ℹ️  Redan postat idag (${postDate}, rad #${existing.id}) - fortsätter ändå (dry-run).`)
      } else {
        console.log(`✅ Redan postat idag (${postDate}, rad #${existing.id}) - avslutar.`)
        return { ok: true, status: 'already-posted', postDate }
      }
    }

    // Timvakt: cron-triggers (särskilt GitHub) kan vara timmar försenade,
    // så fönstret är brett (08-12 Stockholm). Idempotenskollen ovan
    // hindrar dubbletter, så många cron-försök är ofarliga.
    if (hour < POSTING_HOUR && !force) {
      console.log(`⏭️  Klockan är ${hour} i Stockholm (före ${POSTING_HOUR}) - hoppar över. Använd force för att kringgå.`)
      return { ok: true, status: 'too-early', postDate, reason: `Stockholm-timme ${hour}` }
    }
    if (hour > POSTING_WINDOW_END && !force) {
      console.error(`🚨 Klockan är ${hour} i Stockholm och ingen post har publicerats ${postDate} - dagens post missades.`)
      await alertService.alert({
        severity: 'critical',
        category: 'api',
        title: '🚨 Dagens Instagram-post missades',
        message: `Cron-körningen nådde pipelinen först kl ${hour} (fönstret är ${POSTING_HOUR}-${POSTING_WINDOW_END}) och ingen post publicerades ${postDate}. Trigga manuellt med force för att posta i efterhand.`,
        details: { post_date: postDate, stockholm_hour: hour },
        source: 'instagram-post-runner',
      })
      return { ok: false, status: 'missed-window', postDate, reason: `Stockholm-timme ${hour}` }
    }

    const analysis = await analyzeDay(supabase, postDate, { forcedPrimaryId })
    if (analysis.events.length === 0) {
      await recordSkip('Inga publicerade event idag', 0)
      return { ok: true, status: 'skipped', postDate, reason: 'Inga publicerade event idag' }
    }
    const selection = selectionFromSuggestion(analysis.proposal)
    if (!selection) {
      await recordSkip('Inga event med användbar bild', analysis.primaryCandidateIds.length)
      await alertService.alert({
        severity: 'warning',
        category: 'api',
        title: '⚠️ Instagram-post skippades',
        message: `Inga av dagens ${analysis.events.length} event hade en bild som räcker till ett vykort. Ingen post publicerades ${postDate}.`,
        details: { post_date: postDate, events_count: analysis.events.length },
        source: 'instagram-post-runner',
      })
      return { ok: true, status: 'skipped', postDate, reason: 'Inga event med användbar bild' }
    }

    return await publishSelection(supabase, postDate, analysis.proposal, selection, {
      source: 'direct',
      dryRun,
      candidatesCount: analysis.primaryCandidateIds.length,
    })
  } catch (error) {
    // Fatalt fel: larma här så att både Vercel-routen och GitHub-skriptet
    // får larmet utan egen duplicerad logik, kasta sedan vidare.
    console.error('\n💥 Fatal error:')
    console.error(error)
    await alertService.alert({
      severity: 'critical',
      category: 'api',
      title: '🚨 Daglig Instagram-post misslyckades!',
      message: error instanceof Error ? error.message : String(error),
      details: { stack: error instanceof Error ? error.stack : undefined },
      source: 'instagram-post-runner',
    })
    throw error
  }
}
