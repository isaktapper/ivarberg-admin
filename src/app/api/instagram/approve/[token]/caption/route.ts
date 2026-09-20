/**
 * Generera en ny caption för ett eget val av huvudevent/slides på
 * godkännandesidan. POST { primaryEventId, slideEventIds } -> { caption }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { approvalServiceClient, loadPostByToken } from '@/lib/services/instagram-approval'
import { buildAlsoEvents, getEventsByIds } from '@/lib/services/instagram-post-runner'
import { generateCaption, getRecentCaptionOpenings } from '@/lib/services/instagram-post-service'
import { InstagramProposal } from '@/lib/services/instagram-proposal'
import { shutdownAITelemetry } from '@/lib/services/openai-client'
import { Event } from '@/types/database'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  primaryEventId: z.number().int(),
  slideEventIds: z.array(z.number().int()).max(4).default([]),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = approvalServiceClient()
  try {
    const body = bodySchema.parse(await request.json())
    const row = await loadPostByToken(supabase, token)
    if (!row) return NextResponse.json({ error: 'Förslaget hittades inte' }, { status: 404 })
    const proposal = row.proposal as InstagramProposal | null
    if (!proposal) return NextResponse.json({ error: 'Raden saknar förslag' }, { status: 400 })

    const candidateIds = new Set(proposal.candidates.map((c) => c.eventId))
    if (!candidateIds.has(body.primaryEventId)) {
      return NextResponse.json({ error: 'Huvudeventet finns inte bland dagens kandidater' }, { status: 400 })
    }

    const ids = [...new Set([body.primaryEventId, ...body.slideEventIds, ...proposal.alsoTodayIds])]
    const events = await getEventsByIds(supabase, ids)
    const primary = events.get(body.primaryEventId)
    if (!primary) return NextResponse.json({ error: 'Huvudeventet finns inte längre' }, { status: 400 })

    const alsoEvents = buildAlsoEvents(
      primary,
      body.slideEventIds.map((id) => events.get(id)).filter((e): e is Event => !!e),
      proposal.alsoTodayIds.map((id) => events.get(id)).filter((e): e is Event => !!e)
    )
    const recentOpenings = await getRecentCaptionOpenings(supabase)
    const caption = await generateCaption(primary, alsoEvents, recentOpenings)
    return NextResponse.json({ caption })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  } finally {
    await shutdownAITelemetry()
  }
}
