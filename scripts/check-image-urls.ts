/**
 * Hittar kommande publicerade events vars image_url är död (404/410 eller
 * HTML i stället för bild) och kan reparera dem genom att hämta om källsidan.
 *
 * Kör med: npx tsx scripts/check-image-urls.ts [--apply] [--clear-unfixable] [--json <fil>]
 *
 *   (inga flaggor)      Dry run: lista döda bilder och vilken ny URL som skulle sättas
 *   --apply             Spara nya bild-URL:er i databasen
 *   --clear-unfixable   (med --apply) Sätt image_url = null där ingen fungerande
 *                       ersättning hittades, så att sajten inte visar en trasig bild
 *   --json <fil>        Skriv hela rapporten som JSON
 *
 * Bakgrund: varberg.se (Kulturhuset Komedianten) byter bildadresser - se
 * extractVarbergDetailImage i src/lib/scrapers/varbergs-teatern-scraper.ts.
 * Körs dagligen efter scrapern i .github/workflows/daily-scraper.yml.
 *
 * Använder vanlig fetch mot källsidorna - inga Firecrawl-credits.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { checkImageUrl, checkImageUrls } from '../src/lib/services/imageValidator';
import { fetchCurrentImageUrl } from '../src/lib/scrapers/image-refresher';

interface EventRow {
  id: number;
  name: string;
  date_time: string;
  image_url: string;
  organizer_event_url: string | null;
}

interface ReportRow {
  id: number;
  name: string;
  date_time: string;
  old_image_url: string;
  http_status?: number;
  organizer_event_url: string | null;
  new_image_url: string | null;
  via?: string;
  note?: string;
}

const PAGE_SIZE = 1000;

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const clearUnfixable = args.includes('--clear-unfixable');
  const jsonOut = argValue(args, '--json');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🖼️  Kontroll av bild-URL:er för kommande publicerade events');
  console.log(`   Läge: ${apply ? 'APPLY (sparar ändringar)' : 'DRY RUN (inga ändringar sparas)'}\n`);

  // date_time sparas som lokal tid utan tidszon - jämför med dagens datum
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });

  const events: EventRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('events')
      .select('id, name, date_time, image_url, organizer_event_url')
      .eq('status', 'published')
      .gte('date_time', `${today}T00:00:00`)
      .not('image_url', 'is', null)
      .order('date_time', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('❌ Kunde inte läsa events:', error.message);
      process.exit(1);
    }
    events.push(...((data ?? []) as EventRow[]).filter(e => e.image_url.trim() !== ''));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const checks = await checkImageUrls(events.map(e => e.image_url));
  const dead = events.filter(e => checks.get(e.image_url)?.status === 'dead');
  const unknown = [...checks.values()].filter(c => c.status === 'unknown').length;

  console.log(`   ${events.length} events, ${checks.size} unika bild-URL:er`);
  console.log(`   ${dead.length} events med död bild, ${unknown} URL:er gick inte att kontrollera (lämnas orörda)\n`);

  // Hämta om varje källsida en gång (flera tillfällen delar ofta organizer_event_url)
  const refreshed = new Map<string, { imageUrl: string | null; via?: string; note?: string }>();
  const report: ReportRow[] = [];

  for (const event of dead) {
    const row: ReportRow = {
      id: event.id,
      name: event.name,
      date_time: event.date_time,
      old_image_url: event.image_url,
      http_status: checks.get(event.image_url)?.httpStatus,
      organizer_event_url: event.organizer_event_url,
      new_image_url: null,
    };

    if (!event.organizer_event_url) {
      row.note = 'saknar organizer_event_url';
      report.push(row);
      continue;
    }

    let found = refreshed.get(event.organizer_event_url);
    if (!found) {
      try {
        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
        const result = await fetchCurrentImageUrl(event.organizer_event_url);
        if (!result) {
          found = { imageUrl: null, note: 'källsidan saknar bild' };
        } else if (result.imageUrl === event.image_url) {
          found = { imageUrl: null, note: 'källsidan har fortfarande samma döda bild' };
        } else {
          const check = await checkImageUrl(result.imageUrl);
          found =
            check.status === 'dead'
              ? { imageUrl: null, via: result.via, note: `ny bild är också död: ${result.imageUrl}` }
              : { imageUrl: result.imageUrl, via: result.via };
        }
      } catch (error) {
        found = { imageUrl: null, note: `kunde inte hämta källsidan: ${error instanceof Error ? error.message : error}` };
      }
      refreshed.set(event.organizer_event_url, found);
    }

    row.new_image_url = found.imageUrl;
    row.via = found.via;
    row.note = found.note;
    report.push(row);
  }

  for (const row of report) {
    console.log(`#${row.id}  ${row.date_time.slice(0, 16)}  ${row.name}`);
    console.log(`   död (${row.http_status ?? '-'}): ${row.old_image_url}`);
    if (row.new_image_url) console.log(`   ny  (${row.via}): ${row.new_image_url}`);
    else console.log(`   ⚠️  ingen ersättning: ${row.note}`);
  }

  const fixable = report.filter(r => r.new_image_url);
  const unfixable = report.filter(r => !r.new_image_url);
  console.log(`\n📊 ${fixable.length} kan repareras, ${unfixable.length} saknar ersättning`);

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    console.log(`   Rapport skriven till ${jsonOut}`);
  }

  if (!apply) {
    console.log('\nDry run - kör med --apply för att spara.');
    return;
  }

  let updated = 0;
  let cleared = 0;
  for (const row of report) {
    if (!row.new_image_url && !clearUnfixable) continue;
    // Villkor på gamla URL:en så att vi inte skriver över en bild som ändrats under körningen
    const { error } = await supabase
      .from('events')
      .update({ image_url: row.new_image_url })
      .eq('id', row.id)
      .eq('image_url', row.old_image_url);
    if (error) {
      console.error(`❌ #${row.id}: ${error.message}`);
      continue;
    }
    if (row.new_image_url) updated++;
    else cleared++;
  }
  console.log(`\n✅ Uppdaterade ${updated} events${clearUnfixable ? `, tömde image_url på ${cleared}` : ''}`);
}

main().catch(error => {
  console.error('❌', error);
  process.exit(1);
});
