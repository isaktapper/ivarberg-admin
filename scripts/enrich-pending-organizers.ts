/**
 * Berika pending-arrangörer: hitta webbplats, crawla kontaktuppgifter,
 * AI-granska och auto-godkänn/slå ihop/flagga.
 *
 * Körning:
 *   pnpm enrich-organizers                     # berika upp till 20 o-berikade
 *   pnpm enrich-organizers -- --dry-run        # visa vad som skulle hända
 *   pnpm enrich-organizers -- --limit=100      # höj taket (backfill)
 *   pnpm enrich-organizers -- --id=123         # endast en specifik arrangör
 *   pnpm enrich-organizers -- --force          # inkludera redan berikade
 *
 * Kräver env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 * (Ingen Firecrawl - sajterna hämtas med vanlig fetch och sökning görs via DuckDuckGo)
 */
import { organizerEnricher } from '../src/lib/services/organizer-enricher';
import { shutdownAITelemetry } from '../src/lib/services/openai-client';

function parseArgs() {
  const args = process.argv.slice(2);
  const getValue = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg?.split('=')[1];
  };

  return {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    limit: getValue('limit') ? parseInt(getValue('limit')!, 10) : 20,
    onlyId: getValue('id') ? parseInt(getValue('id')!, 10) : undefined,
  };
}

async function main() {
  for (const envVar of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
  ]) {
    if (!process.env[envVar]) {
      throw new Error(`Missing ${envVar} environment variable`);
    }
  }

  const options = parseArgs();
  console.log('🚀 Startar berikning av pending-arrangörer');
  console.log(`   Options: ${JSON.stringify(options)}\n`);

  const outcomes = await organizerEnricher.enrichPendingOrganizers(options);

  // Lista det som fortfarande behöver manuell granskning
  const needsReview = outcomes.filter(o => o.action === 'flagged' || o.action === 'updated_pending');
  if (needsReview.length > 0) {
    console.log('👀 Behöver fortfarande manuell granskning:');
    for (const o of needsReview) {
      console.log(`   - [${o.organizerId}] ${o.name}: ${o.note}`);
    }
    console.log('');
  }

  const failed = outcomes.filter(o => o.action === 'failed');
  if (failed.length > 0 && failed.length === outcomes.length) {
    throw new Error('Alla berikningar misslyckades - kontrollera API-nycklar och nätverksfel');
  }
}

main()
  .then(async () => {
    await shutdownAITelemetry();
  })
  .catch(async (error) => {
    console.error('\n💥 Fatal error:');
    console.error(error);
    await shutdownAITelemetry();
    process.exit(1);
  });
