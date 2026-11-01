/**
 * Rättar date_time på kommande Visit Varberg-events som sparats med den gamla,
 * felaktiga tidslogiken i visit-varberg-scraper.ts:
 *
 * 1. Heldagar sparade en dag för tidigt (toLocaleDateString utan tidszon på
 *    GitHub Actions/UTC: källans 2026-10-23T22:00Z = 24 okt blev "2026-10-23").
 * 2. Öppettider som starttid, t.ex. Friskis 04:30-23:00 - sparas nu som heldag.
 *
 * Kör med: npx tsx scripts/fix-visitvarberg-times.ts [--apply]
 *
 * Hämtar om källsidan för varje berört event, räknar fram vad den gamla logiken
 * gav (legacy) och vad resolveLocalDateTime ger nu, och ändrar bara rader vars
 * date_time exakt matchar ett legacy-värde. Vanlig fetch - inga Firecrawl-credits.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { fetchHTMLDirect } from '../src/lib/scrapers/http-fetcher';
import {
  extractInitialStates,
  pickEventData,
  resolveLocalDateTime,
} from '../src/lib/scrapers/visit-varberg-scraper';

interface EventRow {
  id: number;
  name: string;
  date_time: string;
  status: string;
  organizer_event_url: string;
}

/** Vad scrapern sparade före fixen, så som den körde på GitHub Actions (UTC) */
function legacyDateTime(startDate: string, useDefaultStartTime?: boolean): string {
  const d = new Date(startDate);
  if (useDefaultStartTime) return `${d.toISOString().slice(0, 10)}T00:00:00`;
  return d
    .toLocaleString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(' ', 'T');
}

async function loadSource(url: string) {
  const $ = cheerio.load(await fetchHTMLDirect(url));
  let found: ReturnType<typeof pickEventData> = null;
  $('script').each((_, el) => {
    if (found) return;
    const content = $(el).html();
    if (!content?.includes('registerInitialState')) return;
    for (const candidate of extractInitialStates(content)) {
      found = pickEventData(candidate);
      if (found) return;
    }
  });
  return found as ReturnType<typeof pickEventData>;
}

async function main() {
  const apply = process.argv.includes('--apply');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🕓 Rättning av Visit Varberg-tider');
  console.log(`   Läge: ${apply ? 'APPLY (sparar ändringar)' : 'DRY RUN (inga ändringar sparas)'}\n`);

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  const rows: EventRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('events')
      .select('id, name, date_time, status, organizer_event_url')
      .ilike('organizer_event_url', '%visitvarberg.se%')
      .gte('date_time', `${today}T00:00:00`)
      .order('date_time')
      .range(from, from + 999);
    if (error) {
      console.error('❌ Kunde inte läsa events:', error.message);
      process.exit(1);
    }
    rows.push(...((data ?? []) as EventRow[]));
    if (!data || data.length < 1000) break;
  }

  // Bara heldagar och starttider före 06:00 kan vara berörda
  const suspect = rows.filter(r => r.date_time.slice(11, 16) < '06:00');
  const urls = [...new Set(suspect.map(r => r.organizer_event_url))];
  console.log(`   ${rows.length} kommande events, ${suspect.length} misstänkta på ${urls.length} källsidor\n`);

  const changes: Array<{ row: EventRow; to: string; conflict: boolean }> = [];

  for (const url of urls) {
    await new Promise(resolve => setTimeout(resolve, 500));
    let source;
    try {
      source = await loadSource(url);
    } catch (error) {
      console.warn(`⚠️  ${url}: ${error instanceof Error ? error.message.slice(0, 120) : error}`);
      continue;
    }
    if (!source) {
      console.warn(`⚠️  ${url}: ingen eventdata på sidan`);
      continue;
    }

    // Alla rader för källsidan (även passerade) - behövs för att klassa heldagsserier
    const { data: allForUrl } = await supabase
      .from('events')
      .select('date_time')
      .eq('organizer_event_url', url);
    const dbDates = new Set((allForUrl ?? []).map(r => r.date_time as string));

    const pairs = source.dates.map(d => ({
      legacy: legacyDateTime(d.startDate, source.useDefaultStartTime),
      next: resolveLocalDateTime(d, source.useDefaultStartTime),
    }));
    const legacyToNew = new Map(pairs.filter(p => p.legacy !== p.next).map(p => [p.legacy, p.next]));
    if (legacyToNew.size === 0) continue;

    if (source.useDefaultStartTime) {
      // Heldagsserie: legacy-värdet för en dag är samma som rätt värde för dagen
      // innan, så enskilda rader går inte att klassa. En korrekt körning ger
      // alltid seriens sista dag (newOnly), en legacy-körning aldrig.
      const legacyValues = new Set(pairs.map(p => p.legacy));
      const newValues = new Set(pairs.map(p => p.next));
      const newOnly = [...newValues].filter(v => !legacyValues.has(v));
      const legacyOnly = [...legacyValues].filter(v => !newValues.has(v));
      const newHits = newOnly.filter(v => dbDates.has(v)).length;
      const legacyHits = legacyOnly.filter(v => dbDates.has(v)).length;
      if (newHits > 0 || newOnly.length === 0) {
        if (legacyHits > 0) console.warn(`⚠️  ${url}: blandad serie (både gamla och nya datum) - rättas inte`);
        continue;
      }
    }

    const sameUrl = rows.filter(r => r.organizer_event_url === url);
    for (const row of sameUrl) {
      const to = legacyToNew.get(row.date_time);
      if (!to) continue;
      // Krock bara mot rader som inte själva flyttas
      const conflict = sameUrl.some(r => r.id !== row.id && r.date_time === to && !legacyToNew.has(r.date_time));
      changes.push({ row, to, conflict });
    }
  }

  for (const c of changes) {
    console.log(
      `#${c.row.id}  ${c.row.date_time} -> ${c.to}  [${c.row.status}] ${c.row.name}` +
        (c.conflict ? '  ⚠️ krock: rad med rätt tid finns redan, ändras inte' : '')
    );
  }
  const applicable = changes.filter(c => !c.conflict);
  console.log(`\n📊 ${applicable.length} rader att rätta, ${changes.length - applicable.length} krockar`);

  if (!apply) {
    console.log('\nDry run - kör med --apply för att spara.');
    return;
  }

  // Senaste först, så att en heldagsserie som flyttas +1 dag aldrig har två rader på samma datum
  applicable.sort((a, b) => b.row.date_time.localeCompare(a.row.date_time));
  let updated = 0;
  for (const c of applicable) {
    const { error } = await supabase
      .from('events')
      .update({ date_time: c.to })
      .eq('id', c.row.id)
      .eq('date_time', c.row.date_time);
    if (error) console.error(`❌ #${c.row.id}: ${error.message}`);
    else updated++;
  }
  console.log(`\n✅ Uppdaterade ${updated} events`);
}

main().catch(error => {
  console.error('❌', error);
  process.exit(1);
});
