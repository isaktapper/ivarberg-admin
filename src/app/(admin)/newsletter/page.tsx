'use client'

/**
 * Översikt över Torsdagsbrevet: prenumeranter, veckans brev och tidigare
 * utskick. Godkännandet sker på /newsletter/approve/<token> (länk härifrån
 * eller i ntfy-notisen).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Mail, RefreshCw, Sparkles } from 'lucide-react'
import type { NewsletterAdminData, NewsletterIssueSummary } from '@/lib/newsletter/admin-types'
import { formatDateLong, formatStockholm, formatWeekendRange } from '@/lib/newsletter/dates'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { DataTable, type Column } from '@/components/ui/data-table'
import { Banner, EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { formatDayYear } from '@/lib/format'

/** När brevet gick eller går ut, i klartext */
function whenLabel(issue: NewsletterIssueSummary): string {
  if (issue.status === 'sent') return issue.sentAt ? `Skickat ${formatStockholm(issue.sentAt)}` : 'Skickat'
  if (issue.status === 'scheduled') return issue.scheduledFor ? `Går ut ${formatStockholm(issue.scheduledFor)}` : 'Schemalagt'
  if (issue.status === 'skipped' || issue.status === 'failed') return issue.error ?? '–'
  return 'Väntar på godkännande'
}

export default function NewsletterPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [data, setData] = useState<NewsletterAdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/newsletter', { cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) throw new Error(body?.error || `Fel ${res.status}`)
      setData(body as NewsletterAdminData)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const current = data?.issues.find((i) => i.issueDate === data.upcomingIssueDate) ?? null
  const canRegenerate = !!current && (current.status === 'proposed' || current.status === 'failed' || current.status === 'skipped')
  const weekend = data ? formatWeekendRange(data.weekendStart, data.weekendEnd) : ''

  async function create() {
    if (!data) return
    if (current) {
      const ok = await confirm({
        title: 'Göra om veckans förslag?',
        description: 'Urvalet och texterna tas fram på nytt. Ändringar som gjorts på godkännandesidan försvinner.',
        confirmLabel: 'Gör om förslaget',
      })
      if (!ok) return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', regenerate: !!current }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Fel ${res.status}`)
      if (body.status === 'skipped') toast.info('Inget förslag skapades', body.message ?? undefined)
      else toast.success('Veckans förslag är klart', 'Öppna godkännandesidan för att granska det.')
      await load()
    } catch (e) {
      toast.error('Förslaget kunde inte skapas', e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const columns: Column<NewsletterIssueSummary>[] = [
    { key: 'date', header: 'Torsdag', width: '140px', cell: (r) => <span className="font-mono text-xs">{formatDayYear(r.issueDate)}</span> },
    { key: 'status', header: 'Status', width: '120px', cell: (r) => <StatusBadge domain="newsletter" value={r.status} /> },
    {
      key: 'subject',
      header: 'Ämnesrad',
      width: 'minmax(220px,1fr)',
      cell: (r) => <span className="block truncate">{r.subject ?? <span className="text-ink-muted">{r.error ?? '–'}</span>}</span>,
    },
    {
      key: 'recipients',
      header: 'Mottagare',
      width: '100px',
      align: 'right',
      cell: (r) => <span className="font-mono text-xs text-ink-soft">{r.recipientCount ?? '–'}</span>,
    },
    { key: 'when', header: 'Utskick', width: '260px', cell: (r) => <span className="block truncate text-xs text-ink-soft">{whenLabel(r)}</span> },
    {
      key: 'open',
      header: '',
      width: '90px',
      align: 'right',
      cell: (r) =>
        r.approvalToken ? (
          <Link href={`/newsletter/approve/${r.approvalToken}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-sea hover:text-sea-dark">
            Öppna <ExternalLink className="size-3.5" />
          </Link>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="Nyhetsbrev"
        description="Torsdagsbrevet går ut torsdagar 07:00 med tre utvalda helgevenemang. Förslaget skapas på onsdagen och skickas som ntfy-notis. Inget går ut utan att du har godkänt det."
        actions={
          <>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              Uppdatera
            </Button>
            {data && !data.setupError && (!current || canRegenerate) ? (
              <Button onClick={create} loading={creating}>
                {creating ? null : <Sparkles />}
                {current ? 'Gör om förslaget' : 'Skapa veckans förslag'}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <ErrorState title="Kunde inte hämta nyhetsbrevet" description={error} onRetry={load} /> : null}

      {data?.setupError ? (
        <Banner tone="bad" title="Nyhetsbrevet är inte färdiginstallerat">
          {data.setupError}
        </Banner>
      ) : null}

      {data && !data.setupError && data.missingConfig.length > 0 ? (
        <Banner tone="wait" title="Utskick är inte påslaget">
          Saknas: <span className="font-mono text-xs">{data.missingConfig.join(', ')}</span>. Förslag, förhandsvisning och testmejl fungerar ändå, men
          cronen gör ingenting och ett brev går inte att godkänna. Se docs/TORSDAGSBREVET.md.
        </Banner>
      ) : null}

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-[12px]" />
          <Skeleton className="h-28 rounded-[12px]" />
          <Skeleton className="h-28 rounded-[12px]" />
        </div>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Aktiva prenumeranter"
            value={data.subscribers?.active ?? null}
            note={data.subscribers ? `${data.subscribers.unsubscribed} avregistrerade · ${data.subscribers.bounced} studsar` : 'Kunde inte räknas'}
            tone="ok"
          />
          {/* Samma form som StatCard, men med datum i stället för en siffra */}
          <div className="flex flex-col gap-2.5 rounded-[12px] border border-line bg-white px-5 py-4">
            <span className="text-[13px] font-medium text-ink-soft">Nästa brev</span>
            <span className="font-display text-xl font-semibold leading-tight text-ink first-letter:uppercase">
              {formatDateLong(data.upcomingIssueDate)}
            </span>
            <span className="text-xs text-ink-muted">Helgen {weekend} · går ut kl 07:00</span>
          </div>
          <StatCard
            label="Skickade brev"
            value={data.issues.filter((i) => i.status === 'sent').length}
            note={data.enabled ? 'Automatiken är påslagen' : 'Automatiken är avstängd'}
            tone={data.enabled ? 'ok' : 'neutral'}
          />
        </div>
      ) : null}

      {data && !data.setupError ? (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                Veckans brev · {formatDateLong(data.upcomingIssueDate)}
              </span>
              {current ? <StatusBadge domain="newsletter" value={current.status} /> : null}
              {current?.source === 'fallback' ? <span className="text-xs text-ink-muted">utan AI-text</span> : null}
            </div>
            {current ? (
              <>
                <span className="font-display text-base font-semibold text-ink">{current.subject ?? current.error ?? 'Inget innehåll'}</span>
                {current.picks.length > 0 ? (
                  <ol className="list-decimal pl-5 text-[13px] leading-relaxed text-ink-soft">
                    {current.picks.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ol>
                ) : null}
                {current.status === 'failed' && current.error ? <p className="text-[13px] text-poppy">{current.error}</p> : null}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[13px]">
                  <span className="font-mono text-xs text-ink-muted">
                    {whenLabel(current)}
                    {current.recipientCount != null ? ` · ${current.recipientCount} mottagare` : ''}
                  </span>
                  {current.approvalToken ? (
                    <Link href={`/newsletter/approve/${current.approvalToken}`} className="inline-flex items-center gap-1 font-medium text-sea hover:text-sea-dark">
                      {current.status === 'proposed' || current.status === 'failed' ? 'Granska och godkänn' : 'Öppna godkännandesidan'}{' '}
                      <ExternalLink className="size-3.5" />
                    </Link>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-[13px] text-ink-soft">
                Inget förslag än för helgen {weekend}. Det skapas automatiskt på onsdag eftermiddag när automatiken är påslagen, eller nu med knappen
                uppe till höger.
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        rows={data?.issues ?? []}
        rowKey={(r) => r.id}
        loading={loading && !data}
        emptyState={<EmptyState icon={<Mail />} title="Inga utskick ännu" description="Första förslaget skapas på onsdagen, eller med knappen ovan." />}
      />
    </>
  )
}
