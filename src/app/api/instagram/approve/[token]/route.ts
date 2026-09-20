/**
 * Godkännande av dagens Instagram-förslag. Nås utan inloggning - token i
 * URL:en (från ntfy-notisen) är behörigheten.
 *
 * GET  -> aktuell vy (status, förslag, ev. publicerat resultat)
 * POST { action: 'skip' }                       -> markera dagen som överhoppad
 * POST { action: 'publish' }                    -> publicera AI-förslaget som det är
 * POST { action: 'publish', primaryEventId, slideEventIds, format, caption }
 *                                               -> publicera eget val
 * Valfritt fält source: 'ntfy' | 'manual' (default 'manual').
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { approvalServiceClient, loadPostByToken, toApprovalView } from '@/lib/services/instagram-approval'
import { publishSelection } from '@/lib/services/instagram-post-runner'
import { selectionFromSuggestion, InstagramProposal } from '@/lib/services/instagram-proposal'
import { shutdownAITelemetry } from '@/lib/services/openai-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // bildcroppning + uppladdning + Make

const bodySchema = z.object({
  action: z.enum(['publish', 'skip']),
  source: z.enum(['ntfy', 'manual']).optional(),
  primaryEventId: z.number().int().optional(),
  slideEventIds: z.array(z.number().int()).max(4).optional(),
  format: z.enum(['square', 'portrait', 'landscape']).optional(),
  caption: z.string().max(5000).optional(),
})

type Params = { params: Promise<{ token: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params
  const supabase = approvalServiceClient()
  const row = await loadPostByToken(supabase, token)
  if (!row) return NextResponse.json({ error: 'Förslaget hittades inte' }, { status: 404 })
  return NextResponse.json(toApprovalView(row))
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params
  const supabase = approvalServiceClient()

  let body: z.infer<typeof bodySchema>
  try {
    const raw = await request.text()
    body = bodySchema.parse(raw ? JSON.parse(raw) : {})
  } catch (error) {
    return NextResponse.json(
      { error: `Ogiltig förfrågan: ${error instanceof Error ? error.message : String(error)}` },
      { status: 400 }
    )
  }

  try {
    const row = await loadPostByToken(supabase, token)
    if (!row) return NextResponse.json({ error: 'Förslaget hittades inte' }, { status: 404 })

    if (body.action === 'skip') {
      if (row.status !== 'pending' && row.status !== 'failed') {
        return NextResponse.json(
          { error: `Dagens post är redan ${row.status === 'published' ? 'publicerad' : 'överhoppad'}`, view: toApprovalView(row) },
          { status: 409 }
        )
      }
      const { error } = await supabase
        .from('instagram_posts')
        .update({
          status: 'skipped',
          error: 'Hoppade över manuellt via godkännandesidan',
          approved_at: new Date().toISOString(),
          approval_source: body.source ?? 'manual',
        })
        .eq('id', row.id)
      if (error) throw new Error(error.message)
      const updated = await loadPostByToken(supabase, token)
      return NextResponse.json({ ok: true, status: 'skipped', view: updated ? toApprovalView(updated) : null })
    }

    // publish
    if (row.status === 'published') {
      return NextResponse.json({ error: 'Dagens post är redan publicerad', view: toApprovalView(row) }, { status: 409 })
    }
    if (row.status === 'skipped') {
      // Tillåt att ångra en överhoppning genom att publicera ändå
      console.log(`ℹ️  ${row.post_date} var överhoppad - publicerar ändå på begäran.`)
    }
    const proposal = row.proposal as InstagramProposal | null
    if (!proposal) return NextResponse.json({ error: 'Raden saknar förslag' }, { status: 400 })

    const usingSuggestion = body.primaryEventId == null
    const selection = usingSuggestion
      ? selectionFromSuggestion(proposal)
      : {
          primaryEventId: body.primaryEventId!,
          slideEventIds: body.slideEventIds ?? [],
          format: body.format ?? 'square',
          caption: body.caption ?? proposal.suggestion?.caption ?? '',
        }
    if (!selection) return NextResponse.json({ error: 'Förslaget saknar rekommendation att publicera' }, { status: 400 })

    // Markera att godkännandet är på väg så att en samtidig auto-publicering
    // ser att raden inte längre är 'pending' - enkel låsning via status.
    const { data: locked } = await supabase
      .from('instagram_posts')
      .update({ approval_source: body.source ?? 'manual', approved_at: new Date().toISOString() })
      .eq('id', row.id)
      .in('status', ['pending', 'failed', 'skipped'])
      .select('id')
    if (!locked || locked.length === 0) {
      const current = await loadPostByToken(supabase, token)
      return NextResponse.json(
        { error: 'Posten hann publiceras av någon annan', view: current ? toApprovalView(current) : null },
        { status: 409 }
      )
    }

    const result = await publishSelection(supabase, row.post_date, proposal, selection, {
      source: body.source ?? 'manual',
      candidatesCount: row.candidates_count ?? undefined,
    })
    const updated = await loadPostByToken(supabase, token)
    return NextResponse.json({ ok: true, status: result.status, result, view: updated ? toApprovalView(updated) : null })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Instagram-godkännande misslyckades:', error)
    const current = await loadPostByToken(supabase, token).catch(() => null)
    return NextResponse.json({ error: message, view: current ? toApprovalView(current) : null }, { status: 500 })
  } finally {
    await shutdownAITelemetry()
  }
}
