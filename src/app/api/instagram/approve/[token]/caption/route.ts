/**
 * Generera en ny caption för ett eget val av huvudevent/lista på
 * godkännandesidan. POST { primaryEventId, listEventIds } -> { caption }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { approvalServiceClient, loadPostByToken } from '@/lib/services/instagram-approval'
import { getEventsByIds } from '@/lib/services/instagram-post-runner'
import { generateCaption, getRecentCaptionOpenings } from '@/lib/services/instagram-post-service'
import { normalizeProposal } from '@/lib/services/instagram-proposal'
import { shutdownAITelemetry } from '@/lib/services/openai-client'
import { Event } from '@/types/database'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  primaryEventId: z.number().int(),
  listEventIds: z.array(z.number().int()).max(20).default([]),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = approvalServiceClient()
  try {
    const body = bodySchema.parse(await request.json())
    const row = await loadPostByToken(supabase, token)
    if (!row) return NextResponse.json({ error: 'Förslaget hittades inte' }, { status: 404 })
    const proposal = normalizeProposal(row.proposal)
    if (!proposal) return NextResponse.json({ error: 'Raden saknar förslag' }, { status: 400 })

    const todayIds = new Set(proposal.events.map((e) => e.eventId))
    if (!todayIds.has(body.primaryEventId)) {
      return NextResponse.json({ error: 'Huvudeventet finns inte bland dagens event' }, { status: 400 })
    }
    const listIds = body.listEventIds.filter((id) => todayIds.has(id) && id !== body.primaryEventId)

    const events = await getEventsByIds(supabase, [body.primaryEventId, ...listIds])
    const primary = events.get(body.primaryEventId)
    if (!primary) return NextResponse.json({ error: 'Huvudeventet finns inte längre' }, { status: 400 })

    const listEvents = listIds.map((id) => events.get(id)).filter((e): e is Event => !!e)
    const recentOpenings = await getRecentCaptionOpenings(supabase)
    const caption = await generateCaption(primary, listEvents, recentOpenings)
    return NextResponse.json({ caption })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  } finally {
    await shutdownAITelemetry()
  }
}
