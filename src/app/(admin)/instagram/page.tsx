'use client'

/**
 * Översikt över Instagram-posterna: dagens förslag/status och historik.
 * Godkännandet sker på /instagram/approve/<token> (länk härifrån eller i
 * ntfy-notisen).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Image as ImageIcon, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { InstagramPost } from '@/types/database'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { formatDayYear, formatTime } from '@/lib/format'

type Row = InstagramPost & { event?: { name: string } | null }

const SOURCE: Record<string, string> = {
  manual: 'godkänd på sidan',
  ntfy: 'godkänd via ntfy',
  auto: 'auto-publicerad',
  direct: 'direktpublicerad',
}

export default function InstagramPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.from('instagram_posts').select('*, event:events(name)').order('post_date', { ascending: false }).limit(30)
    if (error) setError(error.message)
    setRows((data as Row[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const todayKey = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
  const latest = rows[0]
  const isToday = latest?.post_date === todayKey
  const thumb = latest ? latest.slide_image_urls?.[0] || latest.proxied_image_url || latest.image_url : null

  const columns: Column<Row>[] = [
    { key: 'date', header: 'Datum', width: '140px', cell: (r) => <span className="font-mono text-xs">{formatDayYear(r.post_date)}</span> },
    { key: 'status', header: 'Status', width: '120px', cell: (r) => <StatusBadge domain="instagram" value={r.status} /> },
    {
      key: 'event',
      header: 'Huvudevent',
      width: 'minmax(0,1fr)',
      cell: (r) => <span className="block truncate">{r.event?.name ?? <span className="text-ink-muted">{r.error ?? '–'}</span>}</span>,
    },
    { key: 'slides', header: 'Slides', width: '70px', cell: (r) => <span className="font-mono text-xs text-ink-soft">{r.slide_image_urls?.length ?? (r.status === 'pending' ? '–' : 0)}</span> },
    {
      key: 'posted',
      header: 'Publicerad',
      width: '200px',
      cell: (r) => (
        <span className="truncate text-xs text-ink-soft">
          {r.posted_at ? formatTime(r.posted_at) : '–'}
          {r.approval_source ? ` · ${SOURCE[r.approval_source] ?? r.approval_source}` : ''}
        </span>
      ),
    },
    {
      key: 'open',
      header: '',
      width: '90px',
      align: 'right',
      cell: (r) =>
        r.approval_token ? (
          <Link href={`/instagram/approve/${r.approval_token}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-sea hover:text-sea-dark">
            Öppna <ExternalLink className="size-3.5" />
          </Link>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="Instagram"
        description="Dagliga posten ”Det här händer i Varberg idag”. Förslaget skapas på morgonen och skickas som ntfy-notis: godkänn, ändra eller hoppa över."
        actions={
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            Uppdatera
          </Button>
        }
      />

      {error ? <ErrorState title="Kunde inte hämta Instagram-poster" description={error} onRetry={load} /> : null}

      {loading && !latest ? (
        <Skeleton className="h-44 rounded-[12px]" />
      ) : latest ? (
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="aspect-square w-full shrink-0 rounded-[10px] bg-sea-light object-cover sm:size-40" />
            ) : (
              <div className="flex aspect-square w-full shrink-0 items-center justify-center rounded-[10px] bg-sea-light text-sea sm:size-40">
                <ImageIcon className="size-8" strokeWidth={1.5} />
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{isToday ? 'I dag' : 'Senaste'} · {formatDayYear(latest.post_date)}</span>
                <StatusBadge domain="instagram" value={latest.status} />
                {latest.approval_source ? <span className="text-xs text-ink-muted">{SOURCE[latest.approval_source] ?? latest.approval_source}</span> : null}
              </div>
              <span className="font-display text-base font-semibold text-ink">{latest.event?.name ?? (latest.status === 'skipped' ? latest.error : 'Inget huvudevent')}</span>
              {latest.caption ? <p className="line-clamp-4 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">{latest.caption}</p> : null}
              {latest.status === 'failed' && latest.error ? <p className="text-[13px] text-poppy">{latest.error}</p> : null}
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-1 text-[13px]">
                <span className="font-mono text-xs text-ink-muted">
                  {latest.slide_image_urls?.length ?? 0} slides{latest.posted_at ? ` · publicerad ${formatTime(latest.posted_at)}` : ''}
                </span>
                {latest.approval_token ? (
                  <Link href={`/instagram/approve/${latest.approval_token}`} className="inline-flex items-center gap-1 font-medium text-sea hover:text-sea-dark">
                    {latest.status === 'pending' ? 'Granska och godkänn' : 'Öppna godkännandesidan'} <ExternalLink className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} emptyState={<EmptyState title="Inga poster ännu" description="Första förslaget skapas av morgonjobbet." />} />
    </>
  )
}
