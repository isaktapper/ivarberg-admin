/**
 * Godkännande av Torsdagsbrevet. Nås utan inloggning - token i URL:en (från
 * ntfy-notisen eller adminsidan) är behörigheten.
 *
 * GET                                  -> aktuell vy (status, förslag, innehåll)
 * POST { action: 'save', draft }       -> spara ändringar
 * POST { action: 'preview', draft? }   -> spara och returnera mejlets html
 * POST { action: 'test', to, draft? }  -> spara och skicka testmejl till en adress
 * POST { action: 'approve', draft? }   -> godkänn: synka prenumeranter och
 *                                         schemalägg Broadcast till torsdag 07:00
 *                                         (direkt om klockan passerat 07:00)
 * POST { action: 'undo' }              -> ångra: avboka schemalagt utskick, eller
 *                                         ta tillbaka en överhoppad vecka
 * POST { action: 'skip' }              -> hoppa över veckan
 *
 * draft = { pickEventIds, comments, subject, preheader, intro, signoff, ps }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  NewsletterError,
  approveIssue,
  loadIssueByToken,
  newsletterServiceClient,
  previewIssue,
  refreshIssueStatus,
  saveDraft,
  sendIssueTest,
  skipIssue,
  toApprovalView,
  undoIssue,
} from '@/lib/newsletter/issues'
import { MAX_PICKS, NewsletterDraft } from '@/lib/newsletter/proposal'
import { shutdownAITelemetry } from '@/lib/services/openai-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // bildkonvertering + synk av kontakter (två Resend-anrop per sekund)

const draftSchema = z.object({
  pickEventIds: z.array(z.number().int()).max(MAX_PICKS),
  comments: z.record(z.string(), z.string().max(2000)),
  subject: z.string().max(500),
  preheader: z.string().max(500),
  intro: z.string().max(3000),
  signoff: z.string().max(1000),
  ps: z.string().max(2000).nullable().optional(),
})

const bodySchema = z.object({
  action: z.enum(['save', 'preview', 'test', 'approve', 'undo', 'skip']),
  draft: draftSchema.optional(),
  to: z.email().optional(),
})

type Params = { params: Promise<{ token: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params
  const supabase = newsletterServiceClient()
  const row = await loadIssueByToken(supabase, token)
  if (!row) return NextResponse.json({ error: 'Utskicket hittades inte' }, { status: 404 })
  return NextResponse.json(await toApprovalView(supabase, await refreshIssueStatus(supabase, row)))
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params
  const supabase = newsletterServiceClient()

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
  const draft: NewsletterDraft | undefined = body.draft ? { ...body.draft, ps: body.draft.ps ?? null } : undefined

  try {
    const row = await loadIssueByToken(supabase, token)
    if (!row) return NextResponse.json({ error: 'Utskicket hittades inte' }, { status: 404 })

    switch (body.action) {
      case 'save': {
        if (!draft) return NextResponse.json({ error: 'Utkast saknas' }, { status: 400 })
        const updated = await saveDraft(supabase, row, draft)
        return NextResponse.json({ ok: true, view: await toApprovalView(supabase, updated) })
      }
      case 'preview': {
        const { row: updated, html } = await previewIssue(supabase, row, draft)
        return NextResponse.json({ ok: true, html, view: await toApprovalView(supabase, updated) })
      }
      case 'test': {
        if (!body.to) return NextResponse.json({ error: 'Ange en e-postadress att skicka testet till' }, { status: 400 })
        const updated = await sendIssueTest(supabase, row, body.to, draft)
        return NextResponse.json({ ok: true, sentTo: body.to, view: await toApprovalView(supabase, updated) })
      }
      case 'approve': {
        const result = await approveIssue(supabase, row, draft)
        return NextResponse.json({
          ok: true,
          outcome: result.outcome,
          warnings: result.warnings,
          view: await toApprovalView(supabase, result.row),
        })
      }
      case 'undo': {
        const updated = await undoIssue(supabase, row)
        return NextResponse.json({ ok: true, view: await toApprovalView(supabase, updated) })
      }
      case 'skip': {
        const updated = await skipIssue(supabase, row)
        return NextResponse.json({ ok: true, view: await toApprovalView(supabase, updated) })
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = error instanceof NewsletterError ? error.status : 500
    if (status >= 500) console.error('Torsdagsbrevet: åtgärden misslyckades:', error)
    const current = await loadIssueByToken(supabase, token).catch(() => null)
    return NextResponse.json(
      { error: message, view: current ? await toApprovalView(supabase, current).catch(() => null) : null },
      { status }
    )
  } finally {
    await shutdownAITelemetry()
  }
}
