/**
 * TESTSKRIPT: Kör Firecrawl-varianterna av Visit Varberg- och Varbergs Teater-
 * scrapersarna i DRY RUN - ingenting skrivs till databasen.
 *
 * Helt frånkopplat från det ordinarie scrape-flödet (run-scrapers.ts rörs inte).
 * Databasen används endast för att LÄSA vilka event-URL:er som redan finns,
 * så att bara nya events hämtas (det är så Firecrawls gratiscredits räcker).
 *
 * Kör lokalt:
 *   pnpm tsx --env-file=.env.local scripts/test-firecrawl-scrapers.ts
 *   pnpm tsx --env-file=.env.local scripts/test-firecrawl-scrapers.ts -- --source=teater --limit=5
 *
 * Kör i GitHub Actions: workflow "Test Firecrawl Scraper" (manuell trigger).
 *
 * Flaggor:
 *   --source=visit-varberg|teater|both   (default: both)
 *   --limit=N   max detaljsidor per källa (default: 10, skydd för credits)
 *   --no-db-skip   hämta även events som redan finns i databasen
 */
import { createClient } from '@supabase/supabase-js';
import { VisitVarbergFirecrawlScraper } from '../src/lib/scrapers/visit-varberg-firecrawl-scraper';
import { VarbergsTeaternFirecrawlScraper } from '../src/lib/scrapers/varbergs-teatern-firecrawl-scraper';
import { getFirecrawlFetchCount } from '../src/lib/scrapers/firecrawl-fetcher';
import { ScrapedEvent } from '../src/lib/scrapers/types';

const args = process.argv.slice(2);
const source = args.find(a => a.startsWith('--source='))?.split('=')[1] || 'both';
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10', 10);
const skipDb = !args.includes('--no-db-skip');

async function loadKnownUrls(pattern: string): Promise<Set<string>> {
  if (!skipDb) return new Set();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ Supabase-env saknas - kör utan databas-filter (alla events hämtas, upp till --limit)');
    return new Set();
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const urls = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('events')
      .select('organizer_event_url')
      .ilike('organizer_event_url', pattern)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Kunde inte läsa kända URL:er: ${error.message}`);
    for (const row of data ?? []) {
      if (row.organizer_event_url) urls.add(row.organizer_event_url);
    }
    if (!data || data.length < pageSize) break;
  }
  return urls;
}

function printSummary(name: string, events: ScrapedEvent[], skippedKnown: number) {
  console.log('\n' + '='.repeat(60));
  console.log(`📊 DRY RUN-RESULTAT: ${name}`);
  console.log('='.repeat(60));
  console.log(`   Nya events hittade: ${events.length}`);
  console.log(`   Hoppade över (redan i databasen): ${skippedKnown}`);
  if (events.length > 0) {
    console.log('\n   Exempel på första eventet (så här skulle datan se ut):');
    console.log(JSON.stringify(events[0], null, 2).split('\n').map(l => '   ' + l).join('\n'));
    if (events.length > 1) {
      console.log('\n   Övriga:');
      events.slice(1, 10).forEach(e => console.log(`   - ${e.name} | ${e.date_time} | ${e.venue_name || '?'}`));
      if (events.length > 10) console.log(`   ... och ${events.length - 10} till`);
    }
  }
}

async function main() {
  console.log('🧪 Firecrawl-scraper DRY RUN - ingenting skrivs till databasen\n');
  console.log(`   Källa: ${source} | Max detaljsidor/källa: ${limit} | DB-filter: ${skipDb ? 'på' : 'AV'}\n`);

  if (!process.env.FIRECRAWL_API_KEY) {
    console.error('❌ FIRECRAWL_API_KEY saknas i miljön');
    process.exit(1);
  }

  if (source === 'visit-varberg' || source === 'both') {
    const knownUrls = await loadKnownUrls('%visitvarberg.se%');
    console.log(`🗄️ ${knownUrls.size} kända Visit Varberg-URL:er i databasen\n`);

    const scraper = new VisitVarbergFirecrawlScraper(
      // Samma config som ordinarie 'Visit Varberg' i scraper-registry
      { name: 'Visit Varberg (Firecrawl)', url: 'https://visitvarberg.se/evenemang?limit=500', enabled: true, organizerId: 7 },
      { knownUrls, maxDetailPages: limit }
    );
    const events = await scraper.scrape();
    printSummary('Visit Varberg', events, scraper.skippedKnown);
  }

  if (source === 'teater' || source === 'both') {
    const knownUrls = await loadKnownUrls('%varberg.se/kulturhuset-komedianten%');
    console.log(`\n🗄️ ${knownUrls.size} kända Varbergs Teater-URL:er i databasen\n`);

    const scraper = new VarbergsTeaternFirecrawlScraper(
      // Samma config som ordinarie 'Varbergs Teater' i scraper-registry
      { name: 'Varbergs Teater (Firecrawl)', url: 'https://varberg.se/kulturhuset-komedianten/kalender', enabled: true, organizerId: 6 },
      { knownUrls, maxDetailPages: limit }
    );
    const events = await scraper.scrape();
    printSummary('Varbergs Teater', events, scraper.skippedKnown);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`🔥 Firecrawl-sidhämtningar denna körning: ${getFirecrawlFetchCount()} (≈ credits)`);
  console.log('✅ Dry run klar - ingenting sparades');
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('\n❌ Testet misslyckades:', error);
  process.exit(1);
});
