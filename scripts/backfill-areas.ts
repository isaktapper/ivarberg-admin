/**
 * Script för att sätta område (area) på befintliga events
 *
 * Kör med: npx tsx scripts/backfill-areas.ts [--dry-run] [--force] [--all]
 *
 *   --dry-run  Visa vad som skulle hända utan att spara något
 *   --force    Skriv över events som redan har ett område satt
 *   --all      Inkludera även passerade events (default: endast kommande)
 *
 * Detta script:
 * - Hämtar events från databasen (default: utan område, endast kommande)
 * - Härleder område via areaResolver (ingen AI, inga externa anrop)
 * - Uppdaterar area-kolumnen
 * - Skriver ut fördelning per område + lista över events som inte kunde placeras
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { resolveArea, EVENT_AREAS } from '../src/lib/services/areaResolver';

interface EventRow {
  id: number;
  name: string;
  location: string;
  venue_name?: string | null;
  area?: string | null;
  date_time: string;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const includePast = args.includes('--all');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🗺️  Backfill av områden');
  console.log(`   Dry run: ${dryRun ? 'JA (inga ändringar sparas)' : 'NEJ'}`);
  console.log(`   Skriv över befintliga: ${force ? 'JA' : 'NEJ'}`);
  console.log(`   Omfattning: ${includePast ? 'alla events' : 'endast kommande events'}\n`);

  let query = supabase
    .from('events')
    .select('id, name, location, venue_name, area, date_time')
    .order('id', { ascending: true });

  if (!force) query = query.is('area', null);
  if (!includePast) query = query.gte('date_time', new Date().toISOString());

  const { data: events, error } = await query;
  if (error) {
    console.error('❌ Failed to fetch events:', error.message);
    process.exit(1);
  }
  if (!events || events.length === 0) {
    console.log('✅ Inga events att uppdatera!');
    return;
  }

  console.log(`📊 ${events.length} events att bearbeta\n`);

  const distribution = new Map<string, number>();
  const unresolved: EventRow[] = [];
  let updated = 0;
  let failed = 0;

  for (const event of events as EventRow[]) {
    const area = resolveArea(event.location, event.venue_name);
    const label = area ?? '(okänd → NULL)';
    distribution.set(label, (distribution.get(label) || 0) + 1);

    if (!area) {
      unresolved.push(event);
      continue; // area är redan NULL för dessa (eller lämnas orörd med --force)
    }

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from('events')
        .update({ area })
        .eq('id', event.id);

      if (updateError) {
        failed++;
        console.error(`  ❌ #${event.id} "${event.name}": ${updateError.message}`);
        continue;
      }
    }
    updated++;
  }

  console.log('='.repeat(60));
  console.log('📊 FÖRDELNING PER OMRÅDE');
  console.log('='.repeat(60));
  const order = [...EVENT_AREAS, '(okänd → NULL)'];
  for (const label of order) {
    const count = distribution.get(label);
    if (count) console.log(`  ${label.padEnd(20)} ${count}`);
  }
  console.log('');
  console.log(`✓ ${dryRun ? 'Skulle uppdatera' : 'Uppdaterade'}: ${updated}`);
  if (failed > 0) console.log(`✗ Misslyckades: ${failed}`);
  console.log(`⊘ Utan säker plats (NULL): ${unresolved.length}`);

  if (unresolved.length > 0) {
    console.log('\nEvents utan säker platsbestämning (max 30 visas):');
    for (const e of unresolved.slice(0, 30)) {
      console.log(`  #${e.id} "${e.name}" | venue: "${e.venue_name || '-'}" | adress: "${e.location}"`);
    }
    if (unresolved.length > 30) {
      console.log(`  ... och ${unresolved.length - 30} till`);
    }
    console.log('\nTips: lägg till venue-/ortnyckelord i src/lib/services/areaResolver.ts');
    console.log('och kör om scriptet, eller sätt område manuellt i admin.');
  }

  if (dryRun) console.log('\n⚠️  DRY RUN – inga ändringar har sparats');
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
