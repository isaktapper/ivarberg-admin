/**
 * Script för att sätta is_free på befintliga events utifrån prisfältet
 *
 * Kör med: npx tsx scripts/backfill-is-free.ts [--dry-run] [--force]
 *
 *   --dry-run  Visa vad som skulle hända utan att spara något
 *   --force    Räkna om även events som redan har is_free satt
 *
 * Kräver att migrationen ADD_IS_FREE_COLUMN.sql har körts först.
 *
 * Detta script:
 * - Hämtar alla events (paginerat)
 * - Härleder is_free via priceResolver (ingen AI, inga externa anrop)
 * - Uppdaterar endast events där ett säkert värde (true/false) kunde härledas
 * - Skriver ut fördelning + exempel på priser som förblir okända (NULL)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { resolveIsFree } from '../src/lib/services/priceResolver';

interface EventRow {
  id: number;
  name: string;
  price: string | null;
  is_free: boolean | null;
}

const PAGE_SIZE = 1000;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('💰 Backfill av is_free');
  console.log(`   Dry run: ${dryRun ? 'JA (inga ändringar sparas)' : 'NEJ'}`);
  console.log(`   Skriv över befintliga: ${force ? 'JA' : 'NEJ'}\n`);

  // Hämta alla events paginerat
  const events: EventRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('events')
      .select('id, name, price, is_free')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (!force) query = query.is('is_free', null);

    const { data, error } = await query;
    if (error) {
      console.error('❌ Failed to fetch events:', error.message);
      if (error.message.includes('is_free')) {
        console.error('   Har du kört migrationen database/migrations/ADD_IS_FREE_COLUMN.sql?');
      }
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    events.push(...(data as EventRow[]));
    if (data.length < PAGE_SIZE) break;
  }

  if (events.length === 0) {
    console.log('✅ Inga events att uppdatera!');
    return;
  }

  console.log(`📊 ${events.length} events att bearbeta\n`);

  let setFree = 0;
  let setPaid = 0;
  let failed = 0;
  const unknownPrices = new Map<string, number>();
  let unknownNoPrice = 0;

  for (const event of events) {
    const isFree = resolveIsFree(event.price);

    if (isFree === null) {
      if (event.price?.trim()) {
        unknownPrices.set(event.price, (unknownPrices.get(event.price) || 0) + 1);
      } else {
        unknownNoPrice++;
      }
      continue; // is_free lämnas som NULL (okänt)
    }

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from('events')
        .update({ is_free: isFree })
        .eq('id', event.id);

      if (updateError) {
        failed++;
        console.error(`  ❌ #${event.id} "${event.name}": ${updateError.message}`);
        continue;
      }
    }
    if (isFree) setFree++;
    else setPaid++;
  }

  console.log('='.repeat(60));
  console.log('📊 RESULTAT');
  console.log('='.repeat(60));
  console.log(`✓ ${dryRun ? 'Skulle sätta' : 'Satte'} is_free = true (gratis):  ${setFree}`);
  console.log(`✓ ${dryRun ? 'Skulle sätta' : 'Satte'} is_free = false (kostar): ${setPaid}`);
  console.log(`⊘ Okänt utan pris (NULL): ${unknownNoPrice}`);
  const unknownWithPrice = [...unknownPrices.values()].reduce((s, c) => s + c, 0);
  console.log(`⊘ Okänt trots pris (NULL): ${unknownWithPrice}`);
  if (failed > 0) console.log(`✗ Misslyckades: ${failed}`);

  if (unknownPrices.size > 0) {
    console.log('\nPriser som inte kunde tolkas säkert (förblir NULL, max 30 visas):');
    const sorted = [...unknownPrices.entries()].sort((a, b) => b[1] - a[1]);
    for (const [price, count] of sorted.slice(0, 30)) {
      console.log(`  ${count}× ${JSON.stringify(price)}`);
    }
    console.log('\nTips: sätt Gratis-status manuellt i admin för dessa,');
    console.log('eller utöka reglerna i src/lib/services/priceResolver.ts och kör om.');
  }

  if (dryRun) console.log('\n⚠️  DRY RUN – inga ändringar har sparats');
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
