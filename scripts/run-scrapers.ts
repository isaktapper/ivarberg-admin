import { getScrapers } from '../src/lib/scrapers/scraper-registry';
import { EventImporter } from '../src/lib/services/event-importer';
import { createClient } from '@supabase/supabase-js';

// Note: Environment variables should be loaded BEFORE running this script.
// For local development: npx tsx --env-file=.env.local scripts/run-scrapers.ts
// For GitHub Actions: Variables are provided via secrets

async function main() {
  console.log('🚀 Starting iVarberg event scraping...\n');
  
  // Validera environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }

  const startTime = Date.now();
  const scrapers = getScrapers();
  const importer = new EventImporter();
  
  let totalFound = 0;
  let totalImported = 0;
  let totalDuplicates = 0;
  let failedScrapers = 0;
  
  console.log(`📋 Found ${scrapers.length} active scrapers\n`);
  
  for (const scraper of scrapers) {
    const config = scraper.getConfig();
    console.log(`${'='.repeat(60)}`);
    console.log(`📡 Running: ${config.name}`);
    console.log(`🔗 URL: ${config.url}`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
      const scrapeStart = Date.now();
      const events = await scraper.scrape();
      const scrapeDuration = ((Date.now() - scrapeStart) / 1000).toFixed(1);
      
      console.log(`  ✓ Found ${events.length} events (${scrapeDuration}s)`);
      
      if (events.length === 0) {
        console.log(`  ⚠️  No events found - this might be normal or indicate an issue\n`);
        continue;
      }
      
      const importStart = Date.now();
      const result = await importer.importEvents(
        events,
        config.name,
        config.organizerId
      );
      const importDuration = ((Date.now() - importStart) / 1000).toFixed(1);
      
      totalFound += result.eventsFound;
      totalImported += result.eventsImported;
      totalDuplicates += result.duplicatesSkipped;
      
      console.log(`\n  📊 Results for ${config.name}:`);
      console.log(`     • Imported: ${result.eventsImported} new events`);
      console.log(`     • Duplicates: ${result.duplicatesSkipped} skipped`);
      console.log(`     • Import time: ${importDuration}s`);
      
      if (result.errors.length > 0) {
        console.log(`     • Errors: ${result.errors.length}`);
        result.errors.slice(0, 3).forEach(err => {
          console.log(`       - ${err}`);
        });
        if (result.errors.length > 3) {
          console.log(`       ... and ${result.errors.length - 3} more errors`);
        }
      }
      
      console.log('');
      
    } catch (error) {
      failedScrapers++;
      console.error(`  ❌ Error scraping ${config.name}:`);
      
      if (error instanceof Error) {
        console.error(`     ${error.message}`);
        if (error.stack) {
          console.error(`     Stack trace: ${error.stack.split('\n').slice(0, 3).join('\n     ')}`);
        }
      } else {
        console.error(`     ${String(error)}`);
      }
      
      console.log('  ⏭️  Continuing with next scraper...\n');
    }
  }
  
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`${'='.repeat(60)}`);
  console.log('📊 FINAL SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Successfully scraped: ${scrapers.length - failedScrapers}/${scrapers.length} sources`);
  console.log(`📥 Total events found: ${totalFound}`);
  console.log(`➕ Total imported: ${totalImported}`);
  console.log(`🔄 Total duplicates: ${totalDuplicates}`);
  console.log(`⏱️  Total time: ${totalDuration}s`);
  
  if (failedScrapers > 0) {
    console.log(`⚠️  Failed scrapers: ${failedScrapers}`);
  }
  
  console.log(`${'='.repeat(60)}`);
  console.log('✅ Scraping complete!\n');
  
  // Exit code: 0 if at least one scraper succeeded, 1 if all failed
  if (failedScrapers === scrapers.length && scrapers.length > 0) {
    console.error('💥 All scrapers failed!');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n💥 Fatal error:');
  console.error(error);
  process.exit(1);
});

