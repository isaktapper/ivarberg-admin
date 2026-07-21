/**
 * CLI-wrapper för den dagliga Instagram-posten. Själva pipelinen ligger i
 * src/lib/services/instagram-post-runner.ts och körs primärt av Vercel
 * cron (/api/cron/instagram-post) - det här skriptet är GitHub Actions-
 * backupen och det manuella verktyget.
 *
 * Lokalt:
 *   pnpm instagram-post -- --dry-run --force
 *   (--dry-run = skriv bara ut resultatet, --force = kringgå timvakten)
 */
import { runDailyInstagramPost } from '../src/lib/services/instagram-post-runner';
import { shutdownAITelemetry } from '../src/lib/services/openai-client';

const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const force = process.argv.includes('--force') || process.env.FORCE_RUN === 'true';

runDailyInstagramPost({ force, dryRun })
  .then(async (result) => {
    await shutdownAITelemetry();
    if (!result.ok) process.exitCode = 1;
  })
  .catch(async () => {
    // Larm och felutskrift sköts i runnern
    await shutdownAITelemetry();
    process.exit(1);
  });
