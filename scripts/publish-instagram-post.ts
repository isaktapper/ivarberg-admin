/**
 * CLI-wrapper för den dagliga Instagram-posten. Själva pipelinen ligger i
 * src/lib/services/instagram-post-runner.ts och körs primärt av Vercel
 * cron (/api/cron/instagram-post) - det här skriptet är GitHub Actions-
 * backupen och det manuella verktyget.
 *
 * Lokalt:
 *   pnpm instagram-post -- --dry-run --force
 *   pnpm instagram-post -- --event=1234
 *   pnpm instagram-post -- --direct
 *   (--dry-run = skriv bara ut resultatet, --force = kringgå timvakten,
 *    --event=ID = tvinga huvudevent och gör om dagens post,
 *    --direct = posta utan ntfy-godkännande)
 */
import { runDailyInstagramPost } from '../src/lib/services/instagram-post-runner';
import { shutdownAITelemetry } from '../src/lib/services/openai-client';

const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const force = process.argv.includes('--force') || process.env.FORCE_RUN === 'true';
// --event=1234 tvingar ett visst event som huvudevent (gör om dagens post)
const eventArg = process.argv.find((a) => a.startsWith('--event='));
const primaryEventId = eventArg ? parseInt(eventArg.split('=')[1], 10) : undefined;
if (eventArg && (primaryEventId == null || Number.isNaN(primaryEventId))) {
  console.error('Ogiltigt värde för --event, ange ett numeriskt event-id');
  process.exit(1);
}

// --direct postar utan godkännandeflödet (ntfy) - gamla beteendet
const direct = process.argv.includes('--direct');

runDailyInstagramPost({ force, dryRun, primaryEventId, direct })
  .then(async (result) => {
    await shutdownAITelemetry();
    if (!result.ok) process.exitCode = 1;
  })
  .catch(async () => {
    // Larm och felutskrift sköts i runnern
    await shutdownAITelemetry();
    process.exit(1);
  });
