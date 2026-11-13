/**
 * Adminsidan "Nyhetsbrev" (kräver inloggning).
 *
 * GET  -> utskicken, antal prenumeranter per status och vad som saknas i
 *         konfigurationen. Prenumeranterna är inte läsbara med admin-
 *         användarens egen nyckel (RLS), därför går allt via service role här.
 * POST { action: 'create', regenerate? }
 *      -> skapa veckans förslag manuellt (regenerate = gör om ett förslag som
 *         inte är godkänt). Ingen ntfy-notis - länken visas på sidan.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { missingSendConfig, missingTestConfig, newsletterEnabled } from '@/lib/newsletter/config'
import { sendTimeFor, upcomingIssueDate, weekendFor } from '@/lib/newsletter/dates'
import { NewsletterAdminData, NewsletterIssueSummary } from '@/lib/newsletter/admin-types'
import { countSubscribers, loadIssueByDate, newsletterServiceClient, refreshIssueStatus } from '@/lib/newsletter/issues'
import { createProposal } from '@/lib/newsletter/runner'
import { shutdownAITelemetry } from '@/lib/services/openai-client'
import { NewsletterIssueStatus } from '@/types/database'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // AI-anropet + mejlbilder

async function verifyAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
    },
  })
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  return !!session && !error
}

// Bara det listan behöver ur jsonb-kolumnerna (förslaget kan vara stort)
const SUMMARY_COLUMNS =
  'id, issue_date, status, subject:content->>subject, picks:content->picks, source:proposal->suggestion->>source, approval_token, approved_at, scheduled_for, sent_at, recipient_count, error, created_at'

interface SummaryRow {
  id: number
  issue_date: string
  status: NewsletterIssueStatus
  subject: string | null
  picks: { name?: string }[] | null
  source: string | null
  approval_token: string | null
  approved_at: string | null
  scheduled_for: string | null
  sent_at: string | null
  recipient_count: number | null
  error: string | null
  created_at: string
}

function toSummary(row: SummaryRow): NewsletterIssueSummary {
  return {
    id: row.id,
    issueDate: row.issue_date,
    status: row.status,
    subject: row.subject ?? null,
    picks: (row.picks ?? []).map((p) => p?.name ?? '').filter(Boolean),
    source: row.source ?? null,
    approvalToken: row.approval_token ?? null,
    approvedAt: row.approved_at ?? null,
    scheduledFor: row.scheduled_for ?? null,
    sentAt: row.sent_at ?? null,
    recipientCount: row.recipient_count ?? null,
    error: row.error ?? null,
    createdAt: row.created_at,
  }
}

async function loadSummaries(): Promise<SummaryRow[]> {
  const supabase = newsletterServiceClient()
  const { data, error } = await supabase
    .from('newsletter_issues')
    .select(SUMMARY_COLUMNS)
    .order('issue_date', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as SummaryRow[]
}

export async function GET() {
  if (!(await verifyAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = newsletterServiceClient()
  const issueDate = upcomingIssueDate()
  const weekend = weekendFor(issueDate)
  const result: NewsletterAdminData = {
    issues: [],
    subscribers: null,
    upcomingIssueDate: issueDate,
    weekendStart: weekend.start,
    weekendEnd: weekend.end,
    sendAt: sendTimeFor(issueDate).toISOString(),
    enabled: newsletterEnabled(),
    missingConfig: missingSendConfig(),
    canSendTest: missingTestConfig().length === 0,
    setupError: null,
  }

  try {
    let rows = await loadSummaries()

    // Schemalagda utskick vars tid har passerat: läs av i Resend om de gått ut
    const due = rows.filter((r) => r.status === 'scheduled' && r.scheduled_for && new Date(r.scheduled_for).getTime() + 60_000 < Date.now())
    if (due.length > 0) {
      for (const row of due) {
        const full = await loadIssueByDate(supabase, row.issue_date)
        if (full) await refreshIssueStatus(supabase, full)
      }
      rows = await loadSummaries()
    }

    result.issues = rows.map(toSummary)
    result.subscribers = await countSubscribers(supabase)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    result.setupError = `${message}. Är migrationen database/migrations/ADD_NEWSLETTER_FLOW.sql körd?`
  }

  return NextResponse.json(result)
}

const bodySchema = z.object({
  action: z.literal('create'),
  regenerate: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  if (!(await verifyAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json())
  } catch (error) {
    return NextResponse.json(
      { error: `Ogiltig förfrågan: ${error instanceof Error ? error.message : String(error)}` },
      { status: 400 }
    )
  }

  try {
    const supabase = newsletterServiceClient()
    const issueDate = upcomingIssueDate()
    const { issue, created } = await createProposal(supabase, issueDate, { notify: false, regenerate: body.regenerate })

    if (!created) {
      const reason: Partial<Record<NewsletterIssueStatus, string>> = {
        proposed: 'Veckans förslag finns redan',
        failed: 'Veckans förslag finns redan',
        skipped: 'Veckans brev är överhoppat',
        approved: 'Veckans brev håller på att godkännas och kan inte göras om',
        scheduled: 'Veckans brev är redan schemalagt. Ångra godkännandet först om förslaget ska göras om',
        sent: 'Veckans brev är redan skickat',
      }
      return NextResponse.json(
        { error: reason[issue.status] ?? 'Förslaget kunde inte skapas', status: issue.status, approvalToken: issue.approval_token ?? null },
        { status: 409 }
      )
    }

    return NextResponse.json({
      ok: true,
      issueDate,
      status: issue.status,
      approvalToken: issue.approval_token ?? null,
      message: issue.status === 'skipped' ? issue.error : null,
    })
  } catch (error) {
    console.error('Torsdagsbrevet: förslaget kunde inte skapas:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  } finally {
    await shutdownAITelemetry()
  }
}
