/**
 * Ny AI-rubrik till vykortet på godkännandesidan.
 * POST { primaryEventId, avoid?: string[] } -> { headline }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { approvalServiceClient, loadPostByToken } from '@/lib/services/instagram-approval'
import { getEventsByIds } from '@/lib/services/instagram-post-runner'
import { generateHeadline } from '@/lib/services/instagram-post-service'
import { normalizeProposal } from '@/lib/services/instagram-proposal'
import { shutdownAITelemetry } from '@/lib/services/openai-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const bodySchema = z.object({
  primaryEventId: z.number().int(),
  avoid: z.array(z.string().max(200)).max(10).default([]),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = approvalServiceClient()
  try {
    const body = bodySchema.parse(await request.json())
    const row = await loadPostByToken(supabase, token)
    if (!row) return NextResponse.json({ error: 'Förslaget hittades inte' }, { status: 404 })
    const proposal = normalizeProposal(row.proposal)
    if (!proposal?.events.some((e) => e.eventId === body.primaryEventId)) {
      return NextResponse.json({ error: 'Huvudeventet finns inte bland dagens event' }, { status: 400 })
    }
    const primary = (await getEventsByIds(supabase, [body.primaryEventId])).get(body.primaryEventId)
    if (!primary) return NextResponse.json({ error: 'Huvudeventet finns inte längre' }, { status: 400 })
    const headline = await generateHeadline(primary, body.avoid)
    return NextResponse.json({ headline })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  } finally {
    await shutdownAITelemetry()
  }
}
