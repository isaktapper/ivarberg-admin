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
 *   3. AI: ranka event -> granska bilder (vision) -> generera caption
 *   4. Skicka { image_url, caption } till Make.com-webhook som postar
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
  validateImage,
  reviewImages,
  generateCaption,
  uploadInstagramImage,
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
  imageUrl?: string
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
      console.log(`✅ Redan postat idag (${postDate}, rad #${existing.id}) - avslutar.`)
      return { ok: true, status: 'already-posted', postDate }
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

    // 3. Bildvalidering + vision-granskning
    console.log('🖼️  Steg 2/3: Validerar och granskar bilder...')
    const validCandidates: { event: Event; imageUrl: string }[] = []
    for (const id of ranking.primaryCandidates) {
      const event = eventById.get(id)
      if (!event?.image_url) continue
      if (await validateImage(event.image_url)) {
        validCandidates.push({ event, imageUrl: event.image_url })
        console.log(`   ✓ ${event.name}`)
      } else {
        console.log(`   ✗ ${event.name} (bild ej användbar)`)
      }
    }

    let primary: Event | null = null
    if (validCandidates.length > 0) {
      const review = await reviewImages(validCandidates)
      if (review.bestEventId !== null) {
        primary = eventById.get(review.bestEventId) ?? null
      } else {
        // Vision underkände alla - ta första som inte flaggats oanvändbar
        const fallback = validCandidates.find((c) => !review.unusableEventIds.includes(c.event.id))
        primary = fallback?.event ?? null
      }
    }

    // Fallback-kedja: prova övriga event med bild (enbart programmatisk validering)
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
        if (await validateImage(event.image_url!)) {
          primary = event
          break
        }
      }
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

    console.log(`   🏆 Primärt event: ${primary.name}\n`)

    // 4. Caption (med öppningshistorik för variation)
    console.log('✍️  Steg 3/3: Genererar caption...')
    const alsoEvents = ranking.alsoToday
      .filter((id) => id !== primary!.id)
      .map((id) => eventById.get(id))
      .filter((e): e is Event => !!e)
    const recentOpenings = await getRecentCaptionOpenings(supabase)
    const caption = await generateCaption(primary, alsoEvents, recentOpenings)

    // Konvertera bilden till Instagram-godkänd JPEG och ladda upp till
    // publik Supabase Storage (görs även i dry-run så URL:en kan granskas)
    console.log('🖼️  Konverterar och laddar upp bilden till Supabase Storage...')
    const publishedImageUrl = await uploadInstagramImage(supabase, primary.image_url!, postDate)

    console.log('\n' + '='.repeat(60))
    console.log('📋 POST-INNEHÅLL')
    console.log('='.repeat(60))
    console.log(`Primärt event: ${primary.name} (id ${primary.id})`)
    console.log(`Bild (original): ${primary.image_url}`)
    console.log(`Bild (publicerad): ${publishedImageUrl}`)
    console.log(`Också idag: ${alsoEvents.map((e) => e.name).join(' | ') || '(inga)'}`)
    console.log('-'.repeat(60))
    console.log(caption)
    console.log('='.repeat(60) + '\n')

    const resultBase = {
      postDate,
      eventId: primary.id,
      eventName: primary.name,
      caption,
      imageUrl: publishedImageUrl,
    }

    if (dryRun) {
      console.log('🧪 DRY RUN - ingen post skickas, ingen databasrad skapas.')
      return { ok: true, status: 'dry-run', ...resultBase }
    }

    // 5. Publicera via Make-webhook
    console.log('🚀 Skickar till Make.com-webhook...')
    const publisher = new MakeWebhookPublisher()
    try {
      await publisher.publish({ imageUrl: publishedImageUrl, caption })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      await supabase.from('instagram_posts').upsert(
        {
          post_date: postDate,
          event_id: primary.id,
          also_event_ids: alsoEvents.map((e) => e.id),
          caption,
          image_url: primary.image_url,
          proxied_image_url: publishedImageUrl,
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
        proxied_image_url: publishedImageUrl,
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
