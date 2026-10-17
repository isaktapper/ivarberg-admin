'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { Bell, ChevronDown, Mail, Smartphone, RefreshCw, Check, CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUrlState } from '@/hooks/use-url-state'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { Segmented } from '@/components/ui/tabs'
import { Pagination } from '@/components/ui/pagination'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { BulkBar, BulkButton } from '@/components/ui/bulk-bar'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'

interface SystemAlert {
  id: number
  severity: 'info' | 'warning' | 'error' | 'critical'
  category: string
  title: string
  message: string
  details: Record<string, unknown> | null
  source: string | null
  acknowledged: boolean
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved: boolean
  resolved_at: string | null
  sms_sent: boolean
  email_sent: boolean
  created_at: string
}

const FILTERS = [
  { value: 'open', label: 'Olösta' },
  { value: 'critical', label: 'Kritiska olösta' },
  { value: 'all', label: 'Alla' },
]
const DEFAULTS = { filter: 'open', page: '1' }
const PAGE_SIZE = 50

export default function AlertsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={4} />}>
      <AlertsList />
    </Suspense>
  )
}

function AlertsList() {
  const toast = useToast()
  const { user } = useAuth()
  const { state, set } = useUrlState(DEFAULTS)
  const page = Math.max(1, parseInt(state.page) || 1)

  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  const applyFilter = useCallback(
    <T,>(q: T, filter: string): T => {
      // PostgREST-builder är kedjad; typen bevaras via cast
      const b = q as unknown as { eq: (c: string, v: unknown) => unknown }
      if (filter === 'open') return b.eq('resolved', false) as T
      if (filter === 'critical') return (b.eq('resolved', false) as unknown as { eq: (c: string, v: unknown) => unknown }).eq('severity', 'critical') as T
      return q
    },
    []
  )

  const loadCounts = useCallback(async () => {
    const results = await Promise.all(
      FILTERS.map((f) => applyFilter(supabase.from('system_alerts').select('*', { count: 'exact', head: true }), f.value))
    )
    const next: Record<string, number> = {}
    FILTERS.forEach((f, i) => (next[f.value] = results[i].count ?? 0))
    setCounts(next)
  }, [applyFilter])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const from = (page - 1) * PAGE_SIZE
      const q = applyFilter(supabase.from('system_alerts').select('*', { count: 'exact' }), state.filter)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      const { data, error, count } = await q
      if (error) throw error
      setAlerts((data as SystemAlert[]) || [])
      setTotal(count ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Okänt fel')
    } finally {
      setLoading(false)
    }
  }, [applyFilter, page, state.filter])

  useEffect(() => {
    load()
    loadCounts()
  }, [load, loadCounts])

  useEffect(() => setSelected(new Set()), [state.filter, page])

  useEffect(() => {
    const channel = supabase
      .channel('alerts-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_alerts' }, () => {
        load()
        loadCounts()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load, loadCounts])

  const patch = (ids: number[], p: Partial<SystemAlert>) => setAlerts((prev) => prev.map((a) => (ids.includes(a.id) ? { ...a, ...p } : a)))

  const acknowledge = async (ids: number[]) => {
    const p = { acknowledged: true, acknowledged_by: user?.email ?? null, acknowledged_at: new Date().toISOString() }
    const snapshot = alerts
    patch(ids, p)
    setBusy(true)
    const { error } = await supabase.from('system_alerts').update(p).in('id', ids)
    setBusy(false)
    if (error) {
      setAlerts(snapshot)
      toast.error('Kunde inte notera larmet', error.message)
    } else {
      toast.success(ids.length === 1 ? 'Larmet noterat' : `${ids.length} larm noterade`)
    }
  }

  const resolve = async (ids: number[]) => {
    const p = { resolved: true, resolved_at: new Date().toISOString() }
    const snapshot = alerts
    patch(ids, p)
    setBusy(true)
    const { error } = await supabase.from('system_alerts').update(p).in('id', ids)
    setBusy(false)
    if (error) {
      setAlerts(snapshot)
      toast.error('Kunde inte markera som löst', error.message)
    } else {
      toast.success(ids.length === 1 ? 'Larmet löst' : `${ids.length} larm lösta`)
      setSelected(new Set())
      loadCounts()
      if (state.filter !== 'all') setTimeout(load, 600)
    }
  }

  const toggle = (id: number) =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <>
      <PageHeader
        title="Larm"
        description="Systemlarm från scrapers, Instagram-flödet och cron-jobb."
        actions={
          <Button variant="secondary" onClick={() => { load(); loadCounts() }}>
            <RefreshCw /> Uppdatera
          </Button>
        }
      />

      <Segmented items={FILTERS.map((f) => ({ value: f.value, label: f.label, count: counts[f.value] ?? null }))} value={state.filter} onChange={(v) => set({ filter: v })} />

      {error ? (
        <ErrorState title="Kunde inte hämta larm" description={error} onRetry={load} />
      ) : loading ? (
        <TableSkeleton rows={4} />
      ) : alerts.length === 0 ? (
        <EmptyState icon={<Bell />} title={state.filter === 'all' ? 'Inga larm' : 'Inga olösta larm'} description="Allt ser lugnt ut." />
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} selected={selected.has(a.id)} onToggle={() => toggle(a.id)} onAck={() => acknowledge([a.id])} onResolve={() => resolve([a.id])} busy={busy} />
          ))}
        </div>
      )}

      {total > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={(p) => set({ page: String(p) }, { resetPage: false })} itemLabel="larm" /> : null}

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkButton primary disabled={busy} onClick={() => resolve(Array.from(selected))}>
          Markera lösta
        </BulkButton>
        <BulkButton disabled={busy} onClick={() => acknowledge(Array.from(selected))}>
          Notera
        </BulkButton>
      </BulkBar>
    </>
  )
}

function AlertCard({ alert, selected, onToggle, onAck, onResolve, busy }: { alert: SystemAlert; selected: boolean; onToggle: () => void; onAck: () => void; onResolve: () => void; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const stateValue = alert.resolved ? 'resolved' : alert.acknowledged ? 'acknowledged' : 'open'
  const hasDetails = alert.details && Object.keys(alert.details).length > 0
  const critical = alert.severity === 'critical' && !alert.resolved

  return (
    <article className={cn('flex gap-4 rounded-[12px] border bg-white px-5 py-4', selected ? 'border-sea bg-sea-lightest' : critical ? 'border-poppy-line' : 'border-line', alert.resolved && 'opacity-70')}>
      <input type="checkbox" aria-label="Markera larm" checked={selected} onChange={onToggle} className="mt-1 size-4 shrink-0 cursor-pointer accent-sea" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="alertSeverity" value={alert.severity} />
          <span className="rounded-full bg-stone px-2 py-0.5 text-xs font-medium text-ink-soft">{alert.category}</span>
          <StatusBadge domain="alert" value={stateValue} />
          <span className="ml-auto font-mono text-xs text-ink-muted" title={formatDateTime(alert.created_at)}>{formatRelative(alert.created_at)}</span>
        </div>
        <h3 className="text-sm font-semibold text-ink">{alert.title}</h3>
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">{alert.message}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          {alert.source ? <span>Källa: <span className="font-mono text-ink-soft">{alert.source}</span></span> : null}
          {alert.sms_sent ? (
            <Tooltip><TooltipTrigger asChild><span className="inline-flex items-center gap-1"><Smartphone className="size-3.5" /> SMS</span></TooltipTrigger><TooltipContent>SMS skickat</TooltipContent></Tooltip>
          ) : null}
          {alert.email_sent ? (
            <Tooltip><TooltipTrigger asChild><span className="inline-flex items-center gap-1"><Mail className="size-3.5" /> E-post</span></TooltipTrigger><TooltipContent>E-post skickad</TooltipContent></Tooltip>
          ) : null}
          {alert.acknowledged_by ? <span>Noterad av {alert.acknowledged_by} {alert.acknowledged_at ? formatRelative(alert.acknowledged_at) : ''}</span> : null}
          {alert.resolved_at ? <span>Löst {formatRelative(alert.resolved_at)}</span> : null}
          {hasDetails ? (
            <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 font-medium text-sea hover:text-sea-dark">
              Detaljer <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
            </button>
          ) : null}
        </div>
        {open && hasDetails ? (
          <pre className="thin-scroll max-h-64 overflow-auto rounded-[8px] border border-line bg-sand-soft p-3 font-mono text-[11px] leading-relaxed text-ink">{JSON.stringify(alert.details, null, 2)}</pre>
        ) : null}
      </div>
      {!alert.resolved ? (
        <div className="flex shrink-0 flex-col gap-2">
          {!alert.acknowledged ? (
            <Button variant="secondary" size="sm" disabled={busy} onClick={onAck}>
              <Check /> Noterad
            </Button>
          ) : null}
          <Button variant="success" size="sm" disabled={busy} onClick={onResolve}>
            <CheckCheck /> Markera löst
          </Button>
        </div>
      ) : null}
    </article>
  )
}
