/**
 * Förhandsvisning på godkännandesidan: ritar slidesen för ett val i halv
 * storlek och returnerar dem som data-URI:er (inget sparas).
 * POST { primaryEventId, headline, listEventIds, extraSlideEventIds } -> { slides: string[] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { approvalServiceClient, loadPostByToken } from '@/lib/services/instagram-approval'
import { renderSelectionSlides } from '@/lib/services/instagram-post-runner'
import { normalizeProposal } from '@/lib/services/instagram-proposal'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  primaryEventId: z.number().int(),
  headline: z.string().max(200),
  listEventIds: z.array(z.number().int()).max(20).default([]),
  extraSlideEventIds: z.array(z.number().int()).max(10).default([]),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const body = bodySchema.parse(await request.json())
    const row = await loadPostByToken(approvalServiceClient(), token)
    if (!row) return NextResponse.json({ error: 'Förslaget hittades inte' }, { status: 404 })
    const proposal = normalizeProposal(row.proposal)
    if (!proposal) return NextResponse.json({ error: 'Raden saknar förslag' }, { status: 400 })

    const slides = await renderSelectionSlides(
      proposal,
      { ...body, caption: '' },
      { width: 540, quality: 80, requireCaption: false }
    )
    return NextResponse.json({ slides: slides.map((b) => `data:image/jpeg;base64,${b.toString('base64')}`) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
