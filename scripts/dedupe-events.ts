/**
 * Slår ihop dubletter bland kommande event (samma logik som körs efter
 * skraparna varje natt, se scripts/run-scrapers.ts).
 *
 *   pnpm dedupe-events --dry-run          visa vad som skulle slås ihop, skriv inget
 *   pnpm dedupe-events                    slå ihop på riktigt
 *   pnpm dedupe-events --from=2026-10-01  börja från ett annat datum än idag
 */
import { createClient } from '@supabase/supabase-js'
import { DuplicateDetector } from '../src/lib/services/dedup/detector'
import { shutdownAITelemetry } from '../src/lib/services/openai-client'

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const fromArg = process.argv.find((a) => a.startsWith('--from='))
  const from = fromArg?.split('=')[1] ?? new Date().toISOString().slice(0, 10)

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const detector = new DuplicateDetector(supabase, { dryRun })

  console.log(`🧹 Dubblettstädning från ${from}${dryRun ? ' (DRY RUN - inget skrivs)' : ''}\n`)
  const summary = await detector.cleanupExisting(from)

  console.log(`\n${'='.repeat(60)}`)
  for (const p of summary.pairs) {
    const fmt = (e: typeof p.keep) =>
      `#${e.id} "${e.name}" @ ${e.venue_name || e.location} ${e.date_time.slice(0, 16)} (${e.organizer_event_url ?? '-'})`
    console.log(`[${p.decidedBy}] ${p.reason}\n  behåll: ${fmt(p.keep)}\n  dölj:   ${fmt(p.hide)}`)
  }
  console.log(`${'='.repeat(60)}`)
  console.log(
    `${summary.pairs.length} dubletter hittade, ${summary.merged} sammanslagna, ` +
      `${summary.compared} jämförelser, ${summary.aiCalls} AI-bedömningar`
  )
  if (!detector.canMerge && !dryRun) console.log('⚠️ Inget slogs ihop - kör database/migrations/ADD_GENERIC_DEDUP.sql först')
}

main()
  .then(() => shutdownAITelemetry())
  .catch(async (error) => {
    console.error(error)
    await shutdownAITelemetry()
    process.exit(1)
  })
