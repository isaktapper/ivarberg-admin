/**
 * Delad pipeline för den dagliga Instagram-posten:
 * "Det här händer i Varberg idag".
 *
 * Körs av två triggers (idempotenskollen gör dubbletter omöjliga):
 *   - Vercel cron via /api/cron/instagram-post (primär - punktlig)
 *   - GitHub Actions via scripts/publish-instagram-post.ts (backup + manuell)
 *
 * Flöde:
 *   1. Idempotenskoll (en post per dag) + timvakt (08-12 Europe/Stockholm)
 *   2. Hämta dagens publicerade event
 *   3. AI: ranka event -> kvalitetsbedöm + granska bilder -> välj 1-5 slides
 *      (slide 1 = primärt event med bäst bild) -> generera caption
 *   4. Skicka { image_urls, caption } till Make.com-webhook som postar
 *      (karusell vid >= 2 bilder, enbildspost annars)
 *   5. Logga i instagram_posts + PostHog
 */
import { createClient } from '@supabase/supabase-js'
import { Event } from '@/types/database'
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
  MAX_SLIDES,
  MAX_VISION_CANDIDATES,
  MAX_ALSO_COUNT,
} from './instagram-post-service'
import { MakeWebhookPublisher } from './instagram-publisher'
import { getPostHogClient } from './openai-client'
import { alertService } from './alert-service'

export const POSTING_HOUR = 8 // Europe/Stockholm
export const POSTING_WINDOW_END = 12 // sista timmen (inklusive) då en försenad cron får posta

export interface InstagramRunOptions {
  force?: boolean // kringgå timvakten
  dryRun?: boolean // generera allt men skicka/logga inte
}

export interface InstagramRunResult {
  ok: boolean
  status: 'published' | 'already-posted' | 'too-early' | 'missed-window' | 'skipped' | 'dry-run'
  postDate: string
  reason?: string
  eventId?: number
  eventName?: string
  caption?: string
  imageUrl?: string // första sliden (bakåtkompat för cron-route/CLI-output)
  imageUrls?: string[] // alla slides i publiceringsordning
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} environment variable`)
  return value
}

export async function runDailyInstagramPost(
  options: InstagramRunOptions = {}
): Promise<InstagramRunResult> {
  const force = options.force ?? false
  const dryRun = options.dryRun ?? false

  console.log('📸 Daglig Instagram-post: "Det här händer i Varberg idag"\n')

  requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  requireEnv('OPENAI_API_KEY')
  if (!dryRun) requireEnv('MAKE_WEBHOOK_URL')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const posthog = getPostHogClient()
  const postDate = getStockholmDateString()

  try {
    // Idempotenskoll: har vi redan postat idag?
    const { data: existing } = await supabase
      .from('instagram_posts')
      .select('id, status')
      .eq('post_date', postDate)
      .eq('status', 'published')
      .maybeSingle()

    if (existing) {
      if (dryRun) {
        // Dry-run skickar/loggar inget, så den är ofarlig att köra för
        // granskning även efter att dagens post redan gått ut
        console.log(`ℹ️  Redan postat idag (${postDate}, rad #${existing.id}) - fortsätter ändå (dry-run).`)
      } else {
        console.log(`✅ Redan postat idag (${postDate}, rad #${existing.id}) - avslutar.`)
        return { ok: true, status: 'already-posted', postDate }
      }
    }

    // Timvakt: cron-triggers (särskilt GitHub) kan vara timmar försenade,
    // så fönstret är brett (08-12 Stockholm). Idempotenskollen ovan
    // hindrar dubbletter, så många cron-försök är ofarliga.
    const hour = getStockholmHour()
    if (hour < POSTING_HOUR && !force) {
      console.log(`⏭️  Klockan är ${hour} i Stockholm (före ${POSTING_HOUR}) - hoppar över. Använd force för att kringgå.`)
      return { ok: true, status: 'too-early', postDate, reason: `Stockholm-timme ${hour}` }
    }
    if (hour > POSTING_WINDOW_END && !force) {
      // För sent att posta OCH inget har postats idag - alla dagens
      // cron-försök missade fönstret. Larma istället för grön tystnad.
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

    async function recordSkip(reason: string, candidatesCount: number) {
      console.log(`⏭️  Hoppar över dagens post: ${reason}`)
      if (!dryRun) {
        await supabase.from('instagram_posts').upsert(
          { post_date: postDate, status: 'skipped', error: reason, candidates_count: candidatesCount },
          { onConflict: 'post_date' }
        )
      }
      posthog.capture({
        distinctId: 'instagram-bot',
        event: 'instagram_post_skipped',
        properties: { post_date: postDate, reason, candidates_count: candidatesCount },
      })
    }

    // 1. Hämta dagens event
    console.log(`📅 Hämtar publicerade event för ${postDate} (Europe/Stockholm)...`)
    const events = await getTodayEvents(supabase)
    console.log(`   Hittade ${events.length} event\n`)

    if (events.length === 0) {
      await recordSkip('Inga publicerade event idag', 0)
      return { ok: true, status: 'skipped', postDate, reason: 'Inga publicerade event idag' }
    }

    // 2. Variationshistorik + AI-ranking
    console.log('🕑 Hämtar Instagram-historik (variationsregler, 7 dagar)...')
    const recentlyFeatured = await getRecentlyFeatured(supabase)
    console.log(`   ${recentlyFeatured.recentPrimaryIds.size} nyligen primära, ${recentlyFeatured.recentMentionIds.size} nyligen nämnda\n`)

    console.log('🤖 Steg 1/3: AI rankar dagens event...')
    const ranking = await rankEvents(events, recentlyFeatured)
    const eventById = new Map(events.map((e) => [e.id, e]))
    console.log(`   Primärkandidater: ${ranking.primaryCandidates.map((id) => eventById.get(id)?.name).join(' | ')}`)
    console.log(`   Också idag: ${ranking.alsoToday.length} event\n`)

    // 3. Bildkvalitet + vision-rankning -> välj 1-5 slides (kvadratiska)
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

    // Programmatisk gate: upplösning + närhet till 1:1 (kvadrat-croppen får
    // inte förstöra bilden). Parallellt - poolen är liten.
    const assessed = await Promise.all(
      pool.map(async (c) => ({ ...c, quality: await assessImageQuality(c.imageUrl) }))
    )
    for (const c of assessed) {
      const q = c.quality
      const mark = q.ok ? '✓' : q.relaxedOk ? '~' : '✗'
      console.log(
        `   ${mark} ${c.event.name} (${q.width}x${q.height}, retention ${q.retention.toFixed(2)}${q.reason ? ` → ${q.reason}` : ''})`
      )
    }
    const strictPass = assessed.filter((c) => c.quality.ok)
    const relaxedOnly = assessed.filter((c) => !c.quality.ok && c.quality.relaxedOk)

    // Vision-rankning av strikt godkända bilder (ett anrop). Kraschar den
    // används programmatisk ordning i stället för att avbryta posten.
    let rankedIds: number[] = []
    if (strictPass.length > 0) {
      try {
        const review = await reviewImages(strictPass.slice(0, MAX_VISION_CANDIDATES))
        const unusable = new Set(review.unusableEventIds)
        rankedIds = review.rankedEventIds
        for (const c of strictPass) {
          if (!rankedIds.includes(c.event.id) && !unusable.has(c.event.id)) {
            rankedIds.push(c.event.id)
          }
        }
      } catch (error) {
        console.warn(
          '   ⚠️ Vision-granskningen misslyckades - använder programmatisk ordning:',
          error instanceof Error ? error.message : error
        )
        rankedIds = strictPass.map((c) => c.event.id)
      }
    }

    // Slide 1 = bäst rankade primärkandidat (respekterar 7-dagarsregeln)
    const primaryCandidateIds = new Set(ranking.primaryCandidates)
    let primary: Event | null = null
    const primaryId = rankedIds.find((id) => primaryCandidateIds.has(id))
    if (primaryId !== undefined) {
      primary = eventById.get(primaryId) ?? null
    }

    // Fallback-kedja: prova övriga event med bild (enbart programmatisk gate)
    if (!primary) {
      console.log('   ⚠️ Ingen av toppkandidaterna hade användbar bild - provar övriga event...')
      const tried = new Set(ranking.primaryCandidates)
      const remaining = events.filter(
        (e) =>
          e.image_url &&
          !tried.has(e.id) &&
          !recentlyFeatured.recentPrimaryIds.has(e.id) &&
          !recentlyFeatured.recentPrimaryNames.has(normalizeEventName(e.name))
      )
      for (const event of remaining) {
        const known = assessed.find((c) => c.event.id === event.id)
        const quality = known?.quality ?? (await assessImageQuality(originalImageUrl(event.image_url!)))
        if (quality.ok) {
          primary = event
          break
        }
      }
    }

    // Sista utväg före skip: relaxed-kvalitet duger för en enbildspost
    // (attention-croppen hittar oftast motivet även i t.ex. 16:9)
    let relaxedFallback = false
    if (!primary && relaxedOnly.length > 0) {
      primary = relaxedOnly[0].event // poolordning = prioritetsordning
      relaxedFallback = true
      console.warn(
        `   ⚠️ Ingen bild klarade strikta kvalitetsgaten - enbildspost med relaxed-kvalitet: ${primary.name}`
      )
    }

    if (!primary) {
      await recordSkip('Inga event med användbar bild', ranking.primaryCandidates.length)
      await alertService.alert({
        severity: 'warning',
        category: 'api',
        title: '⚠️ Instagram-post skippades',
        message: `Inga av dagens ${events.length} event hade en användbar bild. Ingen post publicerades ${postDate}.`,
        details: { post_date: postDate, events_count: events.length },
        source: 'instagram-post-runner',
      })
      return { ok: true, status: 'skipped', postDate, reason: 'Inga event med användbar bild' }
    }

    // Slides 2-N: resterande strikt godkända event i kvalitetsordning
    // (aldrig relaxed), minus namn-dubbletter av slide 1, max MAX_SLIDES
    const assessedById = new Map(assessed.map((c) => [c.event.id, c]))
    const slides: { event: Event; imageUrl: string }[] = [
      { event: primary, imageUrl: assessedById.get(primary.id)?.imageUrl ?? originalImageUrl(primary.image_url!) },
    ]
    if (!relaxedFallback) {
      const primaryName = normalizeEventName(primary.name)
      for (const id of rankedIds) {
        if (slides.length >= MAX_SLIDES) break
        if (id === primary.id) continue
        const candidate = assessedById.get(id)
        if (!candidate || normalizeEventName(candidate.event.name) === primaryName) continue
        slides.push({ event: candidate.event, imageUrl: candidate.imageUrl })
      }
    }

    console.log(`   🏆 Primärt event: ${primary.name} (${slides.length} slide${slides.length > 1 ? 's' : ''})\n`)

    // 4. Caption (med öppningshistorik för variation). Event som fått en
    // slide ska alltid nämnas i captionen - därefter fylls listan på med
    // rankingens "också"-val upp till taket.
    console.log('✍️  Steg 3/3: Genererar caption...')
    const alsoSeen = new Set<string>([normalizeEventName(primary.name)])
    const alsoEvents: Event[] = []
    for (const e of [
      ...slides.slice(1).map((s) => s.event),
      ...ranking.alsoToday.map((id) => eventById.get(id)).filter((e): e is Event => !!e),
    ]) {
      if (alsoEvents.length >= MAX_ALSO_COUNT) break
      if (e.id === primary.id) continue
      const name = normalizeEventName(e.name)
      if (alsoSeen.has(name)) continue
      alsoSeen.add(name)
      alsoEvents.push(e)
    }
    const recentOpenings = await getRecentCaptionOpenings(supabase)
    const caption = await generateCaption(primary, alsoEvents, recentOpenings)

    // Croppa slides till kvadratisk 1080x1080 JPEG och ladda upp till
    // publik Supabase Storage (görs även i dry-run så URL:erna kan granskas)
    console.log('🖼️  Konverterar och laddar upp bilder till Supabase Storage...')
    const uploadedSlides = await uploadInstagramSlides(supabase, slides, postDate)
    const slideImageUrls = uploadedSlides.map((s) => s.url)
    const slideEventIds = uploadedSlides.map((s) => s.event.id)

    console.log('\n' + '='.repeat(60))
    console.log('📋 POST-INNEHÅLL')
    console.log('='.repeat(60))
    console.log(`Primärt event: ${primary.name} (id ${primary.id})`)
    console.log(`Slides (${uploadedSlides.length}):`)
    uploadedSlides.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.event.name} → ${s.url}`)
    })
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
    }

    if (dryRun) {
      console.log('🧪 DRY RUN - ingen post skickas, ingen databasrad skapas.')
      return { ok: true, status: 'dry-run', ...resultBase }
    }

    // 5. Publicera via Make-webhook
    console.log('🚀 Skickar till Make.com-webhook...')
    const publisher = new MakeWebhookPublisher()
    try {
      await publisher.publish({ imageUrls: slideImageUrls, caption })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      await supabase.from('instagram_posts').upsert(
        {
          post_date: postDate,
          event_id: primary.id,
          also_event_ids: alsoEvents.map((e) => e.id),
          caption,
          image_url: primary.image_url,
          proxied_image_url: slideImageUrls[0],
          slide_event_ids: slideEventIds,
          slide_image_urls: slideImageUrls,
          status: 'failed',
          error: errorMsg,
          candidates_count: ranking.primaryCandidates.length,
        },
        { onConflict: 'post_date' }
      )
      throw error
    }

    // 6. Logga resultat
    const { error: insertError } = await supabase.from('instagram_posts').upsert(
      {
        post_date: postDate,
        event_id: primary.id,
        also_event_ids: alsoEvents.map((e) => e.id),
        caption,
        image_url: primary.image_url,
        proxied_image_url: slideImageUrls[0],
        slide_event_ids: slideEventIds,
        slide_image_urls: slideImageUrls,
        status: 'published',
        error: null,
        candidates_count: ranking.primaryCandidates.length,
        posted_at: new Date().toISOString(),
      },
      { onConflict: 'post_date' }
    )
    if (insertError) {
      console.error('⚠️ Posten skickades men kunde inte loggas i instagram_posts:', insertError.message)
    }

    posthog.capture({
      distinctId: 'instagram-bot',
      event: 'instagram_post_published',
      properties: {
        post_date: postDate,
        event_id: primary.id,
        event_name: primary.name,
        candidates_count: ranking.primaryCandidates.length,
        also_count: alsoEvents.length,
        slide_count: slideImageUrls.length,
        caption_length: caption.length,
      },
    })

    console.log('✅ Posten skickad till Make - klar!\n')
    return { ok: true, status: 'published', ...resultBase }
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
