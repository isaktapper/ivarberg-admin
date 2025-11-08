import { getScrapers } from '../src/lib/scrapers/scraper-registry';
import { EventImporter } from '../src/lib/services/event-importer';
import { createClient } from '@supabase/supabase-js';

// Note: Environment variables should be loaded BEFORE running this script.
// For local development: npx tsx --env-file=.env.local scripts/run-scrapers.ts
// For GitHub Actions: Variables are provided via secrets

/**
 * Beräkna nästa körning baserat på cron-uttryck
 * GitHub Actions kör kl 05:00 UTC varje dag
 */
function calculateNextRun(): Date {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setUTCHours(5, 0, 0, 0); // 05:00 UTC = 06:00 svensk tid
  return tomorrow;
}

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
  
  // Skapa Supabase client för logging
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  // Identifiera om detta körs från GitHub Actions eller lokalt
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const triggeredBy = isGitHubActions ? 'github-actions' : 'script';
  const runUrl = isGitHubActions 
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined;
  
  console.log(`📍 Running from: ${triggeredBy}`);
  if (runUrl) {
    console.log(`🔗 Run URL: ${runUrl}`);
  }
  console.log('');
  
  let totalFound = 0;
  let totalImported = 0;
  let totalDuplicates = 0;
  let failedScrapers = 0;
  
  console.log(`📋 Found ${scrapers.length} active scrapers\n`);
  
  // Uppdatera eller skapa schedules för alla scrapers
  console.log('📅 Updating scraper schedules...');
  const nextRun = calculateNextRun();
  console.log(`   Next scheduled run: ${nextRun.toISOString()} (${nextRun.toLocaleString('sv-SE')})\n`);
  
  for (const scraper of scrapers) {
    const config = scraper.getConfig();
    
    // Upsert schedule
    await supabase
      .from('scraper_schedules')
      .upsert({
        scraper_name: config.name,
        enabled: config.enabled,
        cron_expression: '0 5 * * *', // 05:00 UTC = 06:00 svensk tid
        next_run_at: nextRun.toISOString(),
        last_run_at: new Date().toISOString()
      }, {
        onConflict: 'scraper_name'
      });
  }
  
  for (const scraper of scrapers) {
    const config = scraper.getConfig();
    console.log(`${'='.repeat(60)}`);
    console.log(`📡 Running: ${config.name}`);
    console.log(`🔗 URL: ${config.url}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const scrapeStart = Date.now();
    let logId: number | null = null;
    
    try {
      // Skapa log entry med status 'running'
      const { data: logData, error: logError } = await supabase
        .from('scraper_logs')
        .insert({
          scraper_name: config.name,
          scraper_url: config.url,
          organizer_id: config.organizerId,
          status: 'running',
          started_at: new Date().toISOString(),
          events_found: 0,
          events_imported: 0,
          duplicates_skipped: 0,
          triggered_by: triggeredBy,
          trigger_user_email: runUrl // Spara GitHub Actions URL i detta fält för referens
        })
        .select()
        .single();
      
      if (logError) {
        console.error('  ⚠️  Error creating log entry:', logError.message);
      } else {
        logId = logData?.id;
        console.log(`  📝 Created log entry #${logId}`);
      }
      
      const events = await scraper.scrape();
      const scrapeDuration = ((Date.now() - scrapeStart) / 1000).toFixed(1);
      
      console.log(`  ✓ Found ${events.length} events (${scrapeDuration}s)`);
      
      const importStart = Date.now();
      const result = await importer.importEvents(
        events,
        config.name,
        config.organizerId,
        logId || undefined // Skicka med logId för progress tracking
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
      
      // Uppdatera log entry med resultat
      if (logId) {
        const endTime = Date.now();
        const status = result.errors.length > 0 
          ? (result.eventsImported > 0 ? 'partial' : 'failed')
          : 'success';
        
        await supabase
          .from('scraper_logs')
          .update({
            status,
            completed_at: new Date().toISOString(),
            duration_ms: endTime - scrapeStart,
            events_found: result.eventsFound,
            events_imported: result.eventsImported,
            duplicates_skipped: result.duplicatesSkipped,
            errors: result.errors.length > 0 ? result.errors : null
          })
          .eq('id', logId);
        
        console.log(`  ✅ Updated log entry with status: ${status}`);
      }
      
      console.log('');
      
    } catch (error) {
      failedScrapers++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      console.error(`  ❌ Error scraping ${config.name}:`);
      
      if (error instanceof Error) {
        console.error(`     ${error.message}`);
        if (error.stack) {
          console.error(`     Stack trace: ${error.stack.split('\n').slice(0, 3).join('\n     ')}`);
        }
      } else {
        console.error(`     ${String(error)}`);
      }
      
      // Uppdatera log entry med fel
      if (logId) {
        const endTime = Date.now();
        await supabase
          .from('scraper_logs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            duration_ms: endTime - scrapeStart,
            errors: [errorMsg]
          })
          .eq('id', logId);
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

