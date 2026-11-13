/**
 * CLI-wrapper för Torsdagsbrevet. Själva pipelinen ligger i
 * src/lib/newsletter/runner.ts. Det här skriptet körs schemalagt av GitHub
 * Actions (.github/workflows/weekly-newsletter.yml) och är också det
 * manuella verktyget.
 *
 * Skriptet skapar veckans förslag och skickar påminnelser. Det skickar
 * ALDRIG brevet - det gör bara ett godkännande på godkännandesidan.
 *
 * Lokalt:
 *   pnpm newsletter -- --dry-run
 *   pnpm newsletter -- --force
 *   (--dry-run = ta fram förslaget och skriv ut det, spara inget;
 *    --force = skapa förslaget oavsett veckodag och klockslag)
 *
 * Utan NEWSLETTER_ENABLED=true gör skriptet ingenting (utom vid --dry-run).
 */
import { runNewsletter } from '../src/lib/newsletter/runner';
import { shutdownAITelemetry } from '../src/lib/services/openai-client';

const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const force = process.argv.includes('--force') || process.env.FORCE_RUN === 'true';

runNewsletter({ force, dryRun })
  .then(async (result) => {
    console.log(`\nResultat: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    await shutdownAITelemetry();
    if (!result.ok) process.exitCode = 1;
  })
  .catch(async () => {
    // Larm och felutskrift sköts i runnern
    await shutdownAITelemetry();
    process.exit(1);
  });
