/**
 * Daglig automatisk Instagram-post: "Det här händer i Varberg idag"
 *
 * Körs av GitHub Actions via flera cron-tider (GitHub-cron är opålitlig:
 * försenas ofta 1-2 h och droppas ibland). Timvakten släpper igenom
 * kl 08-11 Europe/Stockholm; idempotenskollen hindrar dubbelposter och
 * en körning efter fönstret larmar om dagens post aldrig gick ut.
 *
 * Flöde:
 *   1. Timvakt + idempotenskoll (en post per dag)
 *   2. Hämta dagens publicerade event
 *   3. AI: ranka event -> granska bilder (vision) -> generera caption
 *   4. Skicka { image_url, caption } till Make.com-webhook som postar
 *   5. Logga i instagram_posts + PostHog
 *
 * Lokalt:
 *   pnpm instagram-post -- --dry-run --force
 *   (--dry-run = skriv bara ut resultatet, --force = kringgå timvakten)
 */
import { createClient } from '@supabase/supabase-js';
import { Event } from '../src/types/database';
import {
  getStockholmHour,
  getStockholmDateString,
  getTodayEvents,
  getRecentlyFeatured,
  rankEvents,
  validateImage,
  reviewImages,
  generateCaption,
  uploadInstagramImage,
} from '../src/lib/services/instagram-post-service';
import { MakeWebhookPublisher } from '../src/lib/services/instagram-publisher';
import { getPostHogClient, shutdownAITelemetry } from '../src/lib/services/openai-client';
import { alertService } from '../src/lib/services/alert-service';

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const FORCE = process.argv.includes('--force') || process.env.FORCE_RUN === 'true';
const POSTING_HOUR = 8; // Europe/Stockholm
const POSTING_WINDOW_END = 11; // sista timmen (inklusive) då en försenad cron får posta

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable`);
  return value;
}

async function main() {
  console.log('📸 Daglig Instagram-post: "Det här händer i Varberg idag"\n');

  // Validera environment variables
  requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  requireEnv('OPENAI_API_KEY');
  if (!DRY_RUN) requireEnv('MAKE_WEBHOOK_URL');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const posthog = getPostHogClient();
  const postDate = getStockholmDateString();

  // Idempotenskoll: har vi redan postat idag?
  const { data: existing } = await supabase
    .from('instagram_posts')
    .select('id, status')
    .eq('post_date', postDate)
    .eq('status', 'published')
    .maybeSingle();

  if (existing) {
    console.log(`✅ Redan postat idag (${postDate}, rad #${existing.id}) - avslutar.`);
    return;
  }

  // Timvakt: GitHub-cron försenas ofta med 1-2 timmar och droppar ibland
  // körningar helt, så fönstret är brett (08-11 Stockholm) och workflowen
  // har flera cron-tider som backup. Idempotenskollen ovan hindrar dubbletter.
  const hour = getStockholmHour();
  if (hour < POSTING_HOUR && !FORCE) {
    console.log(`⏭️  Klockan är ${hour} i Stockholm (före ${POSTING_HOUR}) - hoppar över. Använd --force för att kringgå.`);
    return;
  }
  if (hour > POSTING_WINDOW_END && !FORCE) {
    // För sent att posta OCH inget har postats idag - det här betyder att
    // alla dagens cron-försök missade fönstret. Larma istället för att
    // tyst avsluta med grön status.
    console.error(`🚨 Klockan är ${hour} i Stockholm och ingen post har publicerats ${postDate} - dagens post missades.`);
    await alertService.alert({
      severity: 'critical',
      category: 'api',
      title: '🚨 Dagens Instagram-post missades',
      message: `Cron-körningen nådde skriptet först kl ${hour} (fönstret är ${POSTING_HOUR}-${POSTING_WINDOW_END}) och ingen post publicerades ${postDate}. Kör workflowen manuellt med force=true för att posta i efterhand.`,
      details: { post_date: postDate, stockholm_hour: hour },
      source: 'publish-instagram-post',
    });
    process.exitCode = 1;
    return;
  }

  async function recordSkip(reason: string, candidatesCount: number) {
    console.log(`⏭️  Hoppar över dagens post: ${reason}`);
    if (!DRY_RUN) {
      await supabase.from('instagram_posts').upsert(
        { post_date: postDate, status: 'skipped', error: reason, candidates_count: candidatesCount },
        { onConflict: 'post_date' }
      );
    }
    posthog.capture({
      distinctId: 'instagram-bot',
      event: 'instagram_post_skipped',
      properties: { post_date: postDate, reason, candidates_count: candidatesCount },
    });
  }

  // 1. Hämta dagens event
  console.log(`📅 Hämtar publicerade event för ${postDate} (Europe/Stockholm)...`);
  const events = await getTodayEvents(supabase);
  console.log(`   Hittade ${events.length} event\n`);

  if (events.length === 0) {
    await recordSkip('Inga publicerade event idag', 0);
    return;
  }

  // 2. Variationshistorik + AI-ranking
  console.log('🕑 Hämtar Instagram-historik (variationsregler, 7 dagar)...');
  const recentlyFeatured = await getRecentlyFeatured(supabase);
  console.log(`   ${recentlyFeatured.recentPrimaryIds.size} nyligen primära, ${recentlyFeatured.recentMentionIds.size} nyligen nämnda\n`);

  console.log('🤖 Steg 1/3: AI rankar dagens event...');
  const ranking = await rankEvents(events, recentlyFeatured);
  const eventById = new Map(events.map((e) => [e.id, e]));
  console.log(`   Primärkandidater: ${ranking.primaryCandidates.map((id) => eventById.get(id)?.name).join(' | ')}`);
  console.log(`   Också idag: ${ranking.alsoToday.length} event\n`);

  // 3. Bildvalidering + vision-granskning
  console.log('🖼️  Steg 2/3: Validerar och granskar bilder...');
  const validCandidates: { event: Event; imageUrl: string }[] = [];
  for (const id of ranking.primaryCandidates) {
    const event = eventById.get(id);
    if (!event?.image_url) continue;
    if (await validateImage(event.image_url)) {
      validCandidates.push({ event, imageUrl: event.image_url });
      console.log(`   ✓ ${event.name}`);
    } else {
      console.log(`   ✗ ${event.name} (bild ej användbar)`);
    }
  }

  let primary: Event | null = null;
  if (validCandidates.length > 0) {
    const review = await reviewImages(validCandidates);
    if (review.bestEventId !== null) {
      primary = eventById.get(review.bestEventId) ?? null;
    } else {
      // Vision underkände alla - ta första som inte flaggats oanvändbar
      const fallback = validCandidates.find((c) => !review.unusableEventIds.includes(c.event.id));
      primary = fallback?.event ?? null;
    }
  }

  // Fallback-kedja: prova övriga event med bild (enbart programmatisk validering)
  if (!primary) {
    console.log('   ⚠️ Ingen av toppkandidaterna hade användbar bild - provar övriga event...');
    const tried = new Set(ranking.primaryCandidates);
    const remaining = events.filter(
      (e) => e.image_url && !tried.has(e.id) && !recentlyFeatured.recentPrimaryIds.has(e.id)
    );
    for (const event of remaining) {
      if (await validateImage(event.image_url!)) {
        primary = event;
        break;
      }
    }
  }

  if (!primary) {
    await recordSkip('Inga event med användbar bild', ranking.primaryCandidates.length);
    await alertService.alert({
      severity: 'warning',
      category: 'api',
      title: '⚠️ Instagram-post skippades',
      message: `Inga av dagens ${events.length} event hade en användbar bild. Ingen post publicerades ${postDate}.`,
      details: { post_date: postDate, events_count: events.length },
      source: 'publish-instagram-post',
    });
    return;
  }

  console.log(`   🏆 Primärt event: ${primary.name}\n`);

  // 4. Caption
  console.log('✍️  Steg 3/3: Genererar caption...');
  const alsoEvents = ranking.alsoToday
    .filter((id) => id !== primary!.id)
    .map((id) => eventById.get(id))
    .filter((e): e is Event => !!e);
  const caption = await generateCaption(primary, alsoEvents);

  // Konvertera bilden till Instagram-godkänd JPEG och ladda upp till
  // publik Supabase Storage (görs även i dry-run så URL:en kan granskas)
  console.log('🖼️  Konverterar och laddar upp bilden till Supabase Storage...');
  const publishedImageUrl = await uploadInstagramImage(supabase, primary.image_url!, postDate);

  console.log('\n' + '='.repeat(60));
  console.log('📋 POST-INNEHÅLL');
  console.log('='.repeat(60));
  console.log(`Primärt event: ${primary.name} (id ${primary.id})`);
  console.log(`Bild (original): ${primary.image_url}`);
  console.log(`Bild (publicerad): ${publishedImageUrl}`);
  console.log(`Också idag: ${alsoEvents.map((e) => e.name).join(' | ') || '(inga)'}`);
  console.log('-'.repeat(60));
  console.log(caption);
  console.log('='.repeat(60) + '\n');

  if (DRY_RUN) {
    console.log('🧪 DRY RUN - ingen post skickas, ingen databasrad skapas.');
    return;
  }

  // 5. Publicera via Make-webhook
  console.log('🚀 Skickar till Make.com-webhook...');
  const publisher = new MakeWebhookPublisher();
  try {
    await publisher.publish({ imageUrl: publishedImageUrl, caption });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
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
    );
    throw error;
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
  );
  if (insertError) {
    console.error('⚠️ Posten skickades men kunde inte loggas i instagram_posts:', insertError.message);
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
  });

  console.log('✅ Posten skickad till Make - klar!\n');
}

main()
  .then(async () => {
    await shutdownAITelemetry();
  })
  .catch(async (error) => {
    console.error('\n💥 Fatal error:');
    console.error(error);

    await alertService.alert({
      severity: 'critical',
      category: 'api',
      title: '🚨 Daglig Instagram-post misslyckades!',
      message: error instanceof Error ? error.message : String(error),
      details: {
        stack: error instanceof Error ? error.stack : undefined,
      },
      source: 'publish-instagram-post',
    });

    await shutdownAITelemetry();
    process.exit(1);
  });
