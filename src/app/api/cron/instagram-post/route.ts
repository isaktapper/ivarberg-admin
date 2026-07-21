/**
 * Vercel cron-endpoint för den dagliga Instagram-posten.
 *
 * Schemaläggs i vercel.json (06:00 + 07:00 UTC - timvakten i pipelinen
 * hanterar sommar-/vintertid och idempotenskollen stoppar dubbletter).
 * Vercel skickar automatiskt "Authorization: Bearer ${CRON_SECRET}" om
 * env-variabeln CRON_SECRET är satt i projektet.
 *
 * Manuell körning:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<domän>/api/cron/instagram-post?force=true&dry_run=true"
 */
import { NextRequest, NextResponse } from 'next/server'
import { runDailyInstagramPost } from '@/lib/services/instagram-post-runner'
import { shutdownAITelemetry } from '@/lib/services/openai-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // AI-stegen + bildhantering tar normalt < 30s

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET är inte konfigurerad i Vercel-projektet' },
      { status: 500 }
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const force = request.nextUrl.searchParams.get('force') === 'true'
  const dryRun = request.nextUrl.searchParams.get('dry_run') === 'true'

  try {
    const result = await runDailyInstagramPost({ force, dryRun })
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  } finally {
    // Serverless: flusha PostHog-events innan funktionen fryser
    await shutdownAITelemetry()
  }
}
