/**
 * Delad pipeline för den dagliga Instagram-posten:
 * "Det här händer i Varberg idag".
 *
 * Körs av två triggers (idempotenskollen gör dubbletter omöjliga):
 *   - Vercel cron via /api/cron/instagram-post (primär - punktlig)
 *   - GitHub Actions via scripts/publish-instagram-post.ts (backup + manuell)
 *
 * GODKÄNNANDEFLÖDET (standard när NTFY_TOPIC är satt):
 *   1. Första körningen efter kl 07 (Stockholm) analyserar dagen: hämtar
 *      publicerade event, AI-rankar, kvalitetsbedömer bilder per format,
 *      vision-granskar och tar fram ett förslag (huvudevent, slides, format,
 *      caption). Förslaget sparas i instagram_posts med status 'pending' och
 *      en engångstoken, och en ntfy-notis skickas med länk till
 *      godkännandesidan (/instagram/approve/<token>) + knappar för att
 *      publicera förslaget direkt eller hoppa över dagen.
 *   2. På sidan väljer man huvudevent, ordnar slides, justerar captionen och
 *      publicerar (API: /api/instagram/approve/<token>).
 *   3. Nästa cron-körning efter kl 10 publicerar förslaget automatiskt om
 *      ingen svarat (INSTAGRAM_AUTO_PUBLISH=false stänger av det).
 *
 * DIREKTFLÖDET (INSTAGRAM_APPROVAL_FLOW=off, --direct, --event=ID, eller när
 * NTFY_TOPIC saknas): som tidigare - analysera och posta i samma körning.
 *
 * Publicering = croppa slides till formatet, ladda upp till Supabase Storage
 * och skicka { image_urls, caption } till Make.com-webhooken som postar
 * (karusell vid >= 2 bilder, enbildspost annars). Loggas i instagram_posts
 * + PostHog.
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
  assessImageQuality,
  originalImageUrl,
  reviewImages,
  generateCaption,
  uploadInstagramSlides,
  isSlideRepeatBlocked,
  isPrimaryRepeatBlocked,
  lastAppearance,
  appearanceCount,
  INSTAGRAM_FORMATS,
  InstagramFormat,
  InstagramFormatKey,
  ImageQualityResult,
  RecentlyFeatured,
  MAX_SLIDES,
  MAX_VISION_CANDIDATES,
  MAX_ALSO_COUNT,
} from './instagram-post-service'
import {
  InstagramProposal,
  InstagramSelection,
  ProposalCandidate,
  formatLabel,
  selectionFromSuggestion,
  validateSelection,
} from './instagram-proposal'
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
   * Tvinga ett visst event som huvudevent (slide 1). Formatet väljs efter
   * vad DET eventets bild klarar; övriga slides fylls som vanligt. Kringgår
   * idempotenskollen och timvakten och postar direkt - används för att göra
   * om dagens post manuellt. Kastar fel om eventet inte finns bland dagens
   * event eller inte har en användbar bild i något format.
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
  imageUrl?: string // första sliden (bakåtkompat för cron-route/CLI-output)
  imageUrls?: string[] // alla slides i publiceringsordning
  format?: InstagramFormatKey // formatet posten publicerades i
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
// Analys av dagen: event -> ranking -> bildbedömning -> plan + förslag
// ---------------------------------------------------------------------------

type Candidate = { event: Event; imageUrl: string; quality: ImageQualityResult }

interface SlidePlan {
  format: InstagramFormat
  relaxed: boolean
  slides: { event: Event; imageUrl: string }[]
}

export interface DayAnalysis {
  events: Event[]
  eventById: Map<number, Event>
  primaryCandidateIds: number[]
  alsoTodayIds: number[]
  recentlyFeatured: RecentlyFeatured
  plan: SlidePlan | null
  /** Caption för planen (genereras bara när plan finns) */
  caption: string | null
  /** "Också"-event för planen, i captionordning */
  alsoEvents: Event[]
  proposal: InstagramProposal
}

/**
 * Kör hela analysen för dagen och bygger både den körbara planen och det
 * sparbara förslaget. Kastar inte på "inga event"/"ingen bild" - då är
 * plan null och proposal.suggestion null.
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

  const emptyProposal = (extra: Partial<InstagramProposal> = {}): InstagramProposal => ({
    version: 1,
    generatedAt: new Date().toISOString(),
    postDate,
    candidates: [],
    primaryCandidateIds: [],
    alsoTodayIds: [],
    eventsWithoutImage: events
      .filter((e) => !e.image_url)
      .map((e) => ({ eventId: e.id, name: e.name, timeLabel: eventTimeLabel(e) })),
    suggestion: null,
    ...extra,
  })

  const recentlyFeatured = await getRecentlyFeatured(supabase)

  if (events.length === 0) {
    return {
      events,
      eventById,
      primaryCandidateIds: [],
      alsoTodayIds: [],
      recentlyFeatured,
      plan: null,
      caption: null,
      alsoEvents: [],
      proposal: emptyProposal(),
    }
  }

  // 2. Variationshistorik + AI-ranking
  console.log('🕑 Hämtar Instagram-historik (variationsregler, 7 dagar)...')
  console.log(
    `   ${recentlyFeatured.recentPrimaryIds.size} nyligen primära, ${recentlyFeatured.recentMentionIds.size} nyligen nämnda\n`
  )

  console.log('🤖 Steg 1/3: AI rankar dagens event...')
  const ranking = await rankEvents(events, recentlyFeatured)
  console.log(`   Primärkandidater: ${ranking.primaryCandidates.map((id) => eventById.get(id)?.name).join(' | ')}`)
  console.log(`   Också idag: ${ranking.alsoToday.length} event\n`)

  // 3. Bildkvalitet per format + vision-rankning -> välj format och 1-5 slides
  console.log('🖼️  Steg 2/3: Kvalitetsbedömer och granskar bilder...')

  // Kandidatpool i prioritetsordning: primärkandidater, "också"-listan,
  // och därefter dagens övriga event med bild - rankingens listor är
  // optimerade för captionen, inte bildkvalitet, så bra bilder utanför
  // dem ska ändå kunna bli slides. Dedupe på normaliserat namn
  // (återkommande event får nya id:n varje dag av scrapern).
  // imageUrl = originalbilden, utan ImageKits banner-transformation.
  const rankedPoolIds = new Set([...ranking.primaryCandidates, ...ranking.alsoToday])
  const extraIds = events.filter((e) => !rankedPoolIds.has(e.id)).map((e) => e.id)
  const pool: { event: Event; imageUrl: string }[] = []
  const poolNames = new Set<string>()
  for (const id of [...rankedPoolIds, ...extraIds]) {
    const event = eventById.get(id)
    if (!event?.image_url) continue
    const name = normalizeEventName(event.name)
    if (poolNames.has(name)) continue
    poolNames.add(name)
    pool.push({ event, imageUrl: originalImageUrl(event.image_url) })
  }

  // Programmatisk gate per format: upplösning + hur mycket croppen äter.
  // Parallellt - poolen är liten och varje bild hämtas bara en gång.
  const assessed: Candidate[] = await Promise.all(
    pool.map(async (c) => ({ ...c, quality: await assessImageQuality(c.imageUrl) }))
  )
  for (const c of assessed) {
    const q = c.quality
    if (q.unreachable) {
      console.log(`   ✗ ${c.event.name} (bilden kunde inte läsas)`)
      continue
    }
    const perFormat = INSTAGRAM_FORMATS.map(
      (f) => `${f.label} ${q.fits[f.key].ok ? '✓' : q.fits[f.key].relaxedOk ? '~' : '✗'}`
    ).join('  ')
    console.log(`   ${q.ok ? '✓' : q.relaxedOk ? '~' : '✗'} ${c.event.name} (${q.width}x${q.height}) → ${perFormat}`)
  }

  const primaryCandidateIds = new Set(ranking.primaryCandidates)
  // Vision-ordning per event (0 = bäst) från det format som till slut valdes
  const visionRankById = new Map<number, number>()

  // Vision-rankning (ett anrop per prövat format). Kraschar den används
  // programmatisk poolordning i stället för att avbryta posten.
  async function rankByVision(candidates: Candidate[]): Promise<number[]> {
    if (candidates.length <= 1) return candidates.map((c) => c.event.id)
    try {
      const review = await reviewImages(
        candidates.slice(0, MAX_VISION_CANDIDATES).map((c) => ({ event: c.event, imageUrl: c.imageUrl }))
      )
      const unusable = new Set(review.unusableEventIds)
      const ranked = review.rankedEventIds.filter((id) => !unusable.has(id))
      for (const c of candidates) {
        if (!ranked.includes(c.event.id) && !unusable.has(c.event.id)) ranked.push(c.event.id)
      }
      return ranked
    } catch (error) {
      console.warn(
        '   ⚠️ Vision-granskningen misslyckades - använder programmatisk ordning:',
        error instanceof Error ? error.message : error
      )
      return candidates.map((c) => c.event.id)
    }
  }

  /**
   * Bygg en post i ett givet format, eller null om formatet inte fungerar
   * idag. Alla slides måste klara samma format (karusellkrav i Graph API).
   */
  async function planForFormat(format: InstagramFormat): Promise<SlidePlan | null> {
    const passers = assessed.filter((c) => c.quality.fits[format.key].ok)
    if (passers.length === 0) return null
    const rankedIds = await rankByVision(passers)
    const byId = new Map(passers.map((c) => [c.event.id, c]))
    const ranked = rankedIds.map((id) => byId.get(id)).filter((c): c is Candidate => !!c)

    // Slide 1: tvingat event om angivet (formatet måste passa just det),
    // annars bäst rankade primärkandidat, annars valfritt event som inte
    // är blockerat av huvudevent-reglerna (isPrimaryRepeatBlocked).
    let primaryEntry: Candidate | null = null
    if (forcedPrimaryId != null) {
      primaryEntry = ranked.find((c) => c.event.id === forcedPrimaryId) ?? null
      if (!primaryEntry) return null
    } else {
      primaryEntry = ranked.find((c) => primaryCandidateIds.has(c.event.id)) ?? null
    }
    if (!primaryEntry) {
      primaryEntry = ranked.find((c) => !isPrimaryRepeatBlocked(c.event, recentlyFeatured)) ?? null
      if (primaryEntry) {
        console.log(`   ⚠️ Ingen toppkandidat med användbar ${format.label}-bild - väljer ${primaryEntry.event.name}`)
      }
    }
    if (!primaryEntry) return null

    visionRankById.clear()
    rankedIds.forEach((id, i) => visionRankById.set(id, i))

    // Slides 2-N: resterande godkända event i kvalitetsordning, minus
    // namn-dubbletter av slide 1 och event som synts för nyligen/för ofta.
    const primaryName = normalizeEventName(primaryEntry.event.name)
    const slides = [{ event: primaryEntry.event, imageUrl: primaryEntry.imageUrl }]
    for (const c of ranked) {
      if (slides.length >= MAX_SLIDES) break
      if (c.event.id === primaryEntry.event.id) continue
      if (normalizeEventName(c.event.name) === primaryName) continue
      if (isSlideRepeatBlocked(c.event, recentlyFeatured)) {
        console.log(
          `   ↩️  Slide "${c.event.name}" hoppas över (visad ${lastAppearance(c.event, recentlyFeatured)}, ${appearanceCount(c.event, recentlyFeatured)} ggr senaste veckan)`
        )
        continue
      }
      slides.push({ event: c.event, imageUrl: c.imageUrl })
    }
    return { format, relaxed: false, slides }
  }

  if (forcedPrimaryId != null) {
    const forced = assessed.find((c) => c.event.id === forcedPrimaryId)
    if (!forced) {
      throw new Error(
        `Event ${forcedPrimaryId} finns inte bland dagens publicerade event med bild (eller är namn-dubblett av ett annat)`
      )
    }
    if (forced.quality.unreachable || !INSTAGRAM_FORMATS.some((f) => forced.quality.fits[f.key].ok)) {
      throw new Error(`Bilden för "${forced.event.name}" (id ${forcedPrimaryId}) klarar inget Instagram-format`)
    }
  }

  // Formatval: kvadrat först, sedan stående, sedan liggande. Ett format
  // används så snart det ger ett användbart huvudevent - en bra kvadratisk
  // bild vinner alltid, medan bannrar räddar dagar där inget event har en
  // kvadratisk bild (tidigare skippades posten helt de dagarna).
  let plan: SlidePlan | null = null
  for (const format of INSTAGRAM_FORMATS) {
    plan = await planForFormat(format)
    if (plan) break
  }

  // Sista utväg före skip: relaxed-kvalitet duger för en enbildspost
  // (attention-croppen hittar oftast motivet ändå). Poolordning =
  // prioritetsordning; event som varit primära nyligen tas bara om inget
  // annat finns - en repris är ändå bättre än ingen post.
  if (!plan) {
    const relaxedIn = (format: InstagramFormat) => assessed.filter((c) => c.quality.fits[format.key].relaxedOk)
    outer: for (const preferFresh of [true, false]) {
      for (const format of INSTAGRAM_FORMATS) {
        const entry = relaxedIn(format).find((c) => !preferFresh || !isPrimaryRepeatBlocked(c.event, recentlyFeatured))
        if (entry) {
          console.warn(
            `   ⚠️ Ingen bild klarade strikta gaten - enbildspost i ${format.label} med relaxed-kvalitet: ${entry.event.name}`
          )
          plan = { format, relaxed: true, slides: [{ event: entry.event, imageUrl: entry.imageUrl }] }
          break outer
        }
      }
    }
  }

  // Kandidatlista till förslaget (alla bedömda event med läsbar bild)
  const candidates: ProposalCandidate[] = assessed
    .filter((c) => !c.quality.unreachable)
    .map((c) => ({
      eventId: c.event.id,
      name: c.event.name,
      venueName: c.event.venue_name || c.event.location || null,
      timeLabel: eventTimeLabel(c.event),
      imageUrl: c.imageUrl,
      width: c.quality.width,
      height: c.quality.height,
      fits: {
        square: { ok: c.quality.fits.square.ok, relaxedOk: c.quality.fits.square.relaxedOk },
        portrait: { ok: c.quality.fits.portrait.ok, relaxedOk: c.quality.fits.portrait.relaxedOk },
        landscape: { ok: c.quality.fits.landscape.ok, relaxedOk: c.quality.fits.landscape.relaxedOk },
      },
      isPrimaryCandidate: primaryCandidateIds.has(c.event.id),
      visionRank: visionRankById.get(c.event.id) ?? null,
      primaryRepeatBlocked: isPrimaryRepeatBlocked(c.event, recentlyFeatured),
      slideRepeatBlocked: isSlideRepeatBlocked(c.event, recentlyFeatured),
      lastShown: appearanceCount(c.event, recentlyFeatured) > 0 ? lastAppearance(c.event, recentlyFeatured) : null,
      timesShownThisWeek: appearanceCount(c.event, recentlyFeatured),
    }))

  let caption: string | null = null
  let alsoEvents: Event[] = []

  if (plan) {
    const primary = plan.slides[0].event
    console.log(
      `   🏆 Primärt event: ${primary.name} (${plan.format.label}${plan.relaxed ? ', relaxed' : ''}, ${plan.slides.length} slide${plan.slides.length > 1 ? 's' : ''})\n`
    )

    // 4. Caption (med öppningshistorik för variation). Event som fått en
    // slide ska alltid nämnas i captionen - därefter fylls listan på med
    // rankingens "också"-val upp till taket.
    console.log('✍️  Steg 3/3: Genererar caption...')
    alsoEvents = buildAlsoEvents(
      primary,
      plan.slides.slice(1).map((s) => s.event),
      ranking.alsoToday.map((id) => eventById.get(id)).filter((e): e is Event => !!e)
    )
    const recentOpenings = await getRecentCaptionOpenings(supabase)
    caption = await generateCaption(primary, alsoEvents, recentOpenings)
  }

  const proposal: InstagramProposal = emptyProposal({
    candidates,
    primaryCandidateIds: ranking.primaryCandidates,
    alsoTodayIds: ranking.alsoToday,
    suggestion:
      plan && caption
        ? {
            primaryEventId: plan.slides[0].event.id,
            slideEventIds: plan.slides.slice(1).map((s) => s.event.id),
            format: plan.format.key,
            caption,
            relaxed: plan.relaxed,
          }
        : null,
  })

  return {
    events,
    eventById,
    primaryCandidateIds: ranking.primaryCandidates,
    alsoTodayIds: ranking.alsoToday,
    recentlyFeatured,
    plan,
    caption,
    alsoEvents,
    proposal,
  }
}

/** "Det händer också"-listan: slide-event först, sedan rankingens val, dedupe på namn, max MAX_ALSO_COUNT */
export function buildAlsoEvents(primary: Event, slideEvents: Event[], rankedAlso: Event[]): Event[] {
  const seen = new Set<string>([normalizeEventName(primary.name)])
  const result: Event[] = []
  for (const e of [...slideEvents, ...rankedAlso]) {
    if (result.length >= MAX_ALSO_COUNT) break
    if (e.id === primary.id) continue
    const name = normalizeEventName(e.name)
    if (seen.has(name)) continue
    seen.add(name)
    result.push(e)
  }
  return result
}

/** Hämta event per id (behåller angiven ordning) */
export async function getEventsByIds(supabase: SupabaseClient, ids: number[]): Promise<Map<number, Event>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('events').select('*').in('id', ids)
  if (error) throw new Error(`Kunde inte hämta event: ${error.message}`)
  return new Map(((data || []) as Event[]).map((e) => [e.id, e]))
}

// ---------------------------------------------------------------------------
// Publicering av ett val (används av direktflödet, godkännandesidan och
// auto-publiceringen)
// ---------------------------------------------------------------------------

export interface PublishOptions {
  source: InstagramApprovalSource
  /** Hoppa över Make-anropet och databasskrivningen (bilderna laddas ändå upp för granskning) */
  dryRun?: boolean
  /** Redan hämtade event (slipper en extra query) */
  preloaded?: Map<number, Event>
  /** Antal huvudkandidater från rankingen, för statistik */
  candidatesCount?: number
}

/**
 * Validerar valet mot förslaget, croppar och laddar upp slides, skickar till
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

  const format = INSTAGRAM_FORMATS.find((f) => f.key === selection.format)!
  const orderedIds = [validation.primary.eventId, ...validation.slides.map((s) => s.eventId)]
  const neededIds = [...new Set([...orderedIds, ...proposal.alsoTodayIds])]
  const eventMap = options.preloaded ?? (await getEventsByIds(supabase, neededIds))
  const missing = orderedIds.filter((id) => !eventMap.has(id))
  if (missing.length > 0) {
    const fetched = await getEventsByIds(supabase, neededIds)
    for (const [id, e] of fetched) eventMap.set(id, e)
    const stillMissing = orderedIds.filter((id) => !eventMap.has(id))
    if (stillMissing.length > 0) throw new Error(`Event saknas i databasen: ${stillMissing.join(', ')}`)
  }

  const primary = eventMap.get(validation.primary.eventId)!
  const slides = [validation.primary, ...validation.slides].map((c) => ({
    event: eventMap.get(c.eventId)!,
    imageUrl: c.imageUrl,
  }))
  const alsoEvents = buildAlsoEvents(
    primary,
    slides.slice(1).map((s) => s.event),
    proposal.alsoTodayIds.map((id) => eventMap.get(id)).filter((e): e is Event => !!e)
  )
  const caption = selection.caption.trim()

  console.log(`🖼️  Konverterar till ${format.label} (${format.width}x${format.height}) och laddar upp till Supabase Storage...`)
  const uploadedSlides = await uploadInstagramSlides(supabase, slides, postDate, format)
  const slideImageUrls = uploadedSlides.map((s) => s.url)
  const slideEventIds = uploadedSlides.map((s) => s.event.id)

  console.log('\n' + '='.repeat(60))
  console.log('📋 POST-INNEHÅLL')
  console.log('='.repeat(60))
  console.log(`Primärt event: ${primary.name} (id ${primary.id})`)
  console.log(`Slides (${uploadedSlides.length}):`)
  uploadedSlides.forEach((s, i) => console.log(`  ${i + 1}. ${s.event.name} → ${s.url}`))
  console.log(`Också idag: ${alsoEvents.map((e) => e.name).join(' | ') || '(inga)'}`)
  console.log('-'.repeat(60))
  console.log(caption)
  console.log('='.repeat(60) + '\n')

  const resultBase = {
    postDate,
    eventId: primary.id,
    eventName: primary.name,
    caption,
    imageUrl: slideImageUrls[0],
    imageUrls: slideImageUrls,
    format: format.key,
  }

  if (options.dryRun) {
    console.log('🧪 DRY RUN - ingen post skickas, ingen databasrad skapas.')
    return { ok: true, status: 'dry-run', ...resultBase }
  }

  const rowBase = {
    post_date: postDate,
    event_id: primary.id,
    also_event_ids: alsoEvents.map((e) => e.id),
    caption,
    image_url: primary.image_url,
    proxied_image_url: slideImageUrls[0],
    slide_event_ids: slideEventIds,
    slide_image_urls: slideImageUrls,
    candidates_count: options.candidatesCount ?? proposal.primaryCandidateIds.length,
    approval_source: options.source,
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
      event_id: primary.id,
      event_name: primary.name,
      candidates_count: rowBase.candidates_count,
      also_count: alsoEvents.length,
      slide_count: slideImageUrls.length,
      format: format.key,
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

async function notifyProposal(postDate: string, proposal: InstagramProposal, token: string): Promise<boolean> {
  const url = approvalUrlFor(token)
  const apiUrl = `${(process.env.ADMIN_BASE_URL || 'https://admin.ivarberg.nu').replace(/\/$/, '')}/api/instagram/approve/${token}`
  const s = proposal.suggestion!
  const byId = new Map(proposal.candidates.map((c) => [c.eventId, c]))
  const primary = byId.get(s.primaryEventId)
  const others = s.slideEventIds.map((id) => byId.get(id)?.name).filter(Boolean)

  const lines = [
    `AI-förslag: ${primary?.name ?? '?'} kl ${primary?.timeLabel ?? '?'} (${formatLabel(s.format)}, ${1 + s.slideEventIds.length} slide${s.slideEventIds.length ? 's' : ''})`,
  ]
  if (others.length) lines.push(`Övriga slides: ${others.join(', ')}`)
  lines.push(`${proposal.candidates.length} event med bild att välja bland.`)
  lines.push(
    autoPublishEnabled()
      ? `Publiceras automatiskt från kl ${AUTO_PUBLISH_HOUR} om du inte gör något.`
      : 'Publiceras INTE förrän du godkänner.'
  )

  const jsonHeaders = { 'Content-Type': 'application/json' }
  return sendNtfy({
    title: `Instagram ${postDate}: ${primary?.name ?? 'förslag klart'}`,
    message: lines.join('\n'),
    click: url,
    attach: primary?.imageUrl,
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
        const proposal = existing.proposal as InstagramProposal | null
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
          message: `${result.eventName} publicerades kl ${hour} eftersom ingen svarade på förslaget.`,
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
          message: `Inga av dagens ${analysis.events.length} event hade en användbar bild.`,
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
        return { ok: true, status: 'dry-run', postDate, eventId: s.primaryEventId, eventName: primaryName, caption: s.caption, format: s.format }
      }

      const { error: insertError } = await supabase.from('instagram_posts').upsert(
        {
          post_date: postDate,
          status: 'pending',
          proposal: analysis.proposal,
          approval_token: token,
          event_id: s.primaryEventId,
          caption: s.caption,
          image_url: analysis.eventById.get(s.primaryEventId)?.image_url ?? null,
          candidates_count: analysis.primaryCandidateIds.length,
          error: null,
          notified_at: new Date().toISOString(),
        },
        { onConflict: 'post_date' }
      )
      if (insertError) throw new Error(`Kunde inte spara förslaget: ${insertError.message}`)

      const notified = await notifyProposal(postDate, analysis.proposal, token)
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
          slide_count: 1 + s.slideEventIds.length,
          format: s.format,
          candidates: analysis.proposal.candidates.length,
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
        format: s.format,
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
        message: `Inga av dagens ${analysis.events.length} event hade en användbar bild i något Instagram-format. Ingen post publicerades ${postDate}.`,
        details: { post_date: postDate, events_count: analysis.events.length },
        source: 'instagram-post-runner',
      })
      return { ok: true, status: 'skipped', postDate, reason: 'Inga event med användbar bild' }
    }

    return await publishSelection(supabase, postDate, analysis.proposal, selection, {
      source: 'direct',
      dryRun,
      preloaded: analysis.eventById,
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
