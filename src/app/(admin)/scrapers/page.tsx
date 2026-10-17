'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Play, Square } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { ScraperLog, ScraperSchedule } from '@/types/database'
import { useAuth } from '@/contexts/AuthContext'
import ScraperProgressModal from '@/components/ScraperProgressModal'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { DataTable, type Column } from '@/components/ui/data-table'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/input'
import { FilterBar, SelectFilter } from '@/components/ui/filter-chip'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState, LoadingState, Skeleton } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useUrlState } from '@/hooks/use-url-state'
import { SCRAPER_SOURCES } from '@/lib/constants'
import { formatDuration, formatNumber, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

interface ScraperInfo {
  name: string
  url: string
  enabled: boolean
  organizerId: number
}

interface RunningProcess {
  id: number
  scraper_name: string
  started_at: string
}

const PAGE_SIZE = 25
const URL_DEFAULTS = { source: '', status: '', period: '30', page: '1' }

export default function ScrapersPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ScrapersContent />
    </Suspense>
  )
}

function ScrapersContent() {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { state, set } = useUrlState(URL_DEFAULTS)

  const [scrapers, setScrapers] = useState<ScraperInfo[]>([])
  const [schedules, setSchedules] = useState<ScraperSchedule[]>([])
  const [recentLogs, setRecentLogs] = useState<ScraperLog[]>([])
  const [loadingCards, setLoadingCards] = useState(true)

  const [runs, setRuns] = useState<ScraperLog[]>([])
  const [runsTotal, setRunsTotal] = useState(0)
  const [loadingRuns, setLoadingRuns] = useState(true)

  const [running, setRunning] = useState(false)
  const [processes, setProcesses] = useState<RunningProcess[]>([])
  const [cancelling, setCancelling] = useState(false)
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [selectedForRun, setSelectedForRun] = useState<Set<string>>(new Set())
  const [errorDialog, setErrorDialog] = useState<{ name: string; errors: string[] } | null>(null)
  const [progress, setProgress] = useState<{ id: number; name: string } | null>(null)

  const page = Math.max(1, parseInt(state.page) || 1)

  const checkRunningProcesses = useCallback(async () => {
    try {
      const res = await fetch('/api/scrape/cancel')
      const data = await res.json()
      setRunning((data.runningCount ?? 0) > 0)
      setProcesses(data.processes ?? [])
    } catch (error) {
      console.error('Error checking running processes:', error)
    }
  }, [])

  const fetchScrapers = useCallback(async () => {
    try {
      const res = await fetch('/api/scrape')
      const data = await res.json()
      setScrapers(data.scrapers || [])
    } catch (error) {
      console.error('Error fetching scrapers:', error)
    }
  }, [])

  const fetchSchedules = useCallback(async () => {
    const { data } = await supabase.from('scraper_schedules').select('*').order('scraper_name')
    setSchedules(data || [])
  }, [])

  /** Senaste 30 dagarnas loggar: driver korten och sammanfattningen */
  const fetchRecent = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    try {
      const rows = await fetchAllRows<ScraperLog>((from, to) =>
        supabase.from('scraper_logs').select('*').gte('started_at', since).order('started_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
      )
      setRecentLogs(rows)
    } catch (error) {
      console.error('Error fetching recent logs:', error)
    } finally {
      setLoadingCards(false)
    }
  }, [])

  const fetchRuns = useCallback(async () => {
    setLoadingRuns(true)
    try {
      const days = parseInt(state.period) || 30
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
      let q = supabase
        .from('scraper_logs')
        .select('*', { count: 'exact' })
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .order('id', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
      if (state.source) q = q.eq('scraper_name', state.source)
      if (state.status === 'problem') q = q.in('status', ['failed', 'partial'])
      else if (state.status === 'running') q = q.eq('status', 'running')
      else if (state.status) q = q.eq('status', state.status)
      const { data, count, error } = await q
      if (error) throw error
      setRuns(data || [])
      setRunsTotal(count ?? 0)
    } catch (error) {
      console.error('Error fetching runs:', error)
      toast.error('Kunde inte hämta körningar')
    } finally {
      setLoadingRuns(false)
    }
  }, [state.period, state.source, state.status, page, toast])

  useEffect(() => {
    fetchScrapers()
    fetchSchedules()
    fetchRecent()
    checkRunningProcesses()
  }, [fetchScrapers, fetchSchedules, fetchRecent, checkRunningProcesses])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  useEffect(() => {
    const channel = supabase
      .channel('scraper-logs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scraper_logs' }, () => {
        fetchRuns()
        fetchRecent()
        checkRunningProcesses()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchRuns, fetchRecent, checkRunningProcesses])

  const sourceNames = useMemo(() => (scrapers.length ? scrapers.map((s) => s.name) : [...SCRAPER_SOURCES]), [scrapers])

  const summary = useMemo(() => {
    const finished = recentLogs.filter((l) => l.status !== 'running')
    const ok = finished.filter((l) => l.status === 'success' || l.status === 'partial').length
    return {
      runs: finished.length,
      rate: finished.length ? Math.round((ok / finished.length) * 100) : 0,
      imported: recentLogs.reduce((s, l) => s + (l.events_imported || 0), 0),
    }
  }, [recentLogs])

  const runScrapers = async (names: string[]) => {
    setRunDialogOpen(false)
    setRunning(true)
    toast.info(`Startar ${names.length === 1 ? names[0] : `${names.length} scrapers`}`, 'Kör i bakgrunden. Tabellen uppdateras när det är klart.')
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail: user?.email, scraperNames: names }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Okänt fel')
      toast.success('Scraping klar', `${result.totalFound} hittade · ${result.totalImported} nya · ${result.totalDuplicates} dubletter`)
    } catch (error) {
      toast.error('Fel vid scraping', error instanceof Error ? error.message : 'Okänt fel')
    } finally {
      setRunning(false)
      await Promise.all([fetchRecent(), fetchRuns(), checkRunningProcesses()])
    }
  }

  const cancelRunning = async () => {
    const ok = await confirm({ title: 'Avbryt pågående körning?', description: 'Alla körningar som är igång markeras som avbrutna.', confirmLabel: 'Avbryt körningen', destructive: true })
    if (!ok) return
    setCancelling(true)
    try {
      const res = await fetch('/api/scrape/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      const result = await res.json()
      if (!res.ok) throw new Error([result.error, result.details, result.hint].filter(Boolean).join(' · '))
      toast.success(`Avbröt ${result.cancelledCount} körning${result.cancelledCount === 1 ? '' : 'ar'}`)
      await Promise.all([fetchRecent(), fetchRuns(), checkRunningProcesses()])
    } catch (error) {
      toast.error('Kunde inte avbryta', error instanceof Error ? error.message : 'Okänt fel')
      await checkRunningProcesses()
    } finally {
      setCancelling(false)
    }
  }

  const openRunDialog = () => {
    setSelectedForRun(new Set(sourceNames))
    setRunDialogOpen(true)
  }

  const nextSchedule = schedules.filter((s) => s.enabled && s.next_run_at).sort((a, b) => (a.next_run_at! < b.next_run_at! ? -1 : 1))[0]

  const columns: Column<ScraperLog>[] = [
    { key: 'name', header: 'Källa', width: '150px', cell: (r) => <span className="font-medium">{r.scraper_name}</span> },
    { key: 'start', header: 'Start', width: '130px', cell: (r) => <span className="font-mono text-xs text-ink-soft">{formatRelative(r.started_at)}</span> },
    { key: 'dur', header: 'Tid', width: '90px', cell: (r) => <span className="font-mono text-xs text-ink-soft">{formatDuration(r.duration_ms)}</span> },
    {
      key: 'result',
      header: 'Resultat',
      width: 'minmax(0,1fr)',
      cell: (r) => (
        <span className="block truncate" title={r.errors?.join('\n')}>
          {r.status === 'failed' && r.errors?.length ? <span className="text-poppy">{r.errors[0]}</span> : `${r.events_found} hittade · ${r.events_imported} nya · ${r.duplicates_skipped} dubl.`}
          {r.status === 'partial' && r.errors?.length ? <span className="text-amber"> · {r.errors.length} fel</span> : null}
        </span>
      ),
    },
    {
      key: 'by',
      header: 'Utlöst av',
      width: '120px',
      cell: (r) => <span className="truncate text-xs text-ink-muted">{r.triggered_by?.includes('github') || r.triggered_by === 'cron' ? 'Schema' : r.trigger_user_email?.split('@')[0] || 'Manuell'}</span>,
    },
    { key: 'status', header: 'Status', width: '110px', cell: (r) => <StatusBadge domain="scraper" value={r.status} /> },
    {
      key: 'open',
      header: '',
      width: '40px',
      cell: (r) => (
        <button type="button" aria-label="Visa logg" onClick={() => setProgress({ id: r.id, name: r.scraper_name })} className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-stone hover:text-ink">
          <ChevronRight className="size-4" />
        </button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Scrapers"
        meta={
          loadingCards ? null : (
            <>
              Senaste 30 dagar: {formatNumber(summary.runs)} körningar · {summary.rate} % lyckade · {formatNumber(summary.imported)} nya event
            </>
          )
        }
        actions={
          <>
            {nextSchedule ? (
              <span className="hidden text-[13px] text-ink-soft sm:inline">
                Nästa schemalagda: <span className="font-mono text-ink">{formatRelative(nextSchedule.next_run_at)}</span>
              </span>
            ) : null}
            {running ? (
              <Button variant="destructive" onClick={cancelRunning} loading={cancelling}>
                <Square className="size-3.5" />
                Avbryt körning
              </Button>
            ) : null}
            <Button onClick={openRunDialog} disabled={running}>
              <Play className="size-4" />
              Kör alla
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {loadingCards
          ? sourceNames.map((n) => <Skeleton key={n} className="h-[220px] rounded-[12px]" />)
          : sourceNames.map((name) => (
              <SourceCard
                key={name}
                name={name}
                logs={recentLogs.filter((l) => l.scraper_name === name)}
                schedule={schedules.find((s) => s.scraper_name === name)}
                runningProcess={processes.find((p) => p.scraper_name === name)}
                disabled={running}
                onRun={() => runScrapers([name])}
                onShowErrors={(errors) => setErrorDialog({ name, errors })}
                onShowProgress={(id) => setProgress({ id, name })}
              />
            ))}
      </div>

      <Card>
        <CardHeader
          title="Körningar"
          actions={
            <FilterBar>
              <SelectFilter label="Källa" value={state.source} options={sourceNames.map((n) => ({ value: n, label: n }))} onChange={(v) => set({ source: v })} allLabel="Alla källor" />
              <SelectFilter
                label="Status"
                value={state.status}
                options={[
                  { value: 'problem', label: 'Misslyckade och delvis' },
                  { value: 'running', label: 'Körs' },
                  { value: 'success', label: 'Klara' },
                  { value: 'cancelled', label: 'Avbrutna' },
                ]}
                onChange={(v) => set({ status: v })}
                allLabel="Alla statusar"
              />
              <SelectFilter
                label="Period"
                value={state.period === '30' ? '' : state.period}
                options={[
                  { value: '7', label: 'Senaste 7 dagarna' },
                  { value: '90', label: 'Senaste 90 dagarna' },
                ]}
                onChange={(v) => set({ period: v || '30' })}
                allLabel="Senaste 30 dagarna"
              />
            </FilterBar>
          }
        />
        <DataTable
          className="rounded-none border-0"
          columns={columns}
          rows={runs}
          rowKey={(r) => r.id}
          loading={loadingRuns}
          emptyState={<EmptyState title="Inga körningar" description="Inga körningar matchar filtret i vald period." />}
          footer={<Pagination page={page} pageSize={PAGE_SIZE} total={runsTotal} onPageChange={(p) => set({ page: String(p) }, { resetPage: false })} itemLabel="körningar" />}
        />
      </Card>

      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent
          size="sm"
          title="Kör scrapers"
          description="Hämtar nya event från valda källor. Tar upp till några minuter per källa."
          footer={
            <>
              <Button variant="ghost" onClick={() => setRunDialogOpen(false)}>
                Avbryt
              </Button>
              <Button disabled={selectedForRun.size === 0} onClick={() => runScrapers([...selectedForRun])}>
                <Play className="size-4" />
                Kör {selectedForRun.size === sourceNames.length ? 'alla' : selectedForRun.size}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2.5">
            {sourceNames.map((n) => (
              <Checkbox
                key={n}
                label={n}
                checked={selectedForRun.has(n)}
                onChange={(e) =>
                  setSelectedForRun((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(n)
                    else next.delete(n)
                    return next
                  })
                }
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!errorDialog} onOpenChange={(o) => !o && setErrorDialog(null)}>
        {errorDialog ? (
          <DialogContent title={`Fel · ${errorDialog.name}`} description="Från senaste körningen">
            <ul className="flex flex-col gap-2">
              {errorDialog.errors.map((e, i) => (
                <li key={i} className="flex items-start gap-2 rounded-[10px] border border-poppy-line bg-poppy-light/40 px-3 py-2 font-mono text-xs text-ink">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-poppy" />
                  <span className="break-words">{e}</span>
                </li>
              ))}
            </ul>
          </DialogContent>
        ) : null}
      </Dialog>

      {progress ? <ScraperProgressModal logId={progress.id} scraperName={progress.name} onClose={() => setProgress(null)} /> : null}
    </>
  )
}

function SourceCard({
  name,
  logs,
  schedule,
  runningProcess,
  disabled,
  onRun,
  onShowErrors,
  onShowProgress,
}: {
  name: string
  logs: ScraperLog[]
  schedule?: ScraperSchedule
  runningProcess?: RunningProcess
  disabled: boolean
  onRun: () => void
  onShowErrors: (errors: string[]) => void
  onShowProgress: (logId: number) => void
}) {
  const latest = logs[0]
  const isRunning = !!runningProcess || latest?.status === 'running'
  const failed = latest?.status === 'failed'
  const partial = latest?.status === 'partial'
  const trend = logs
    .filter((l) => l.status !== 'running')
    .slice(0, 14)
    .reverse()
  const max = Math.max(1, ...trend.map((l) => l.events_imported || 0))
  const note = failed || partial ? latest?.errors?.[0]?.split('\n')[0] || (partial ? 'Delvis lyckad' : 'Misslyckad') : latest ? 'Stabil' : 'Aldrig körd'

  return (
    <article className={cn('flex flex-col gap-3 rounded-[12px] border bg-white p-4', isRunning ? 'border-sea' : failed ? 'border-poppy-line' : 'border-line')}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-ink">{name}</span>
        {isRunning ? <StatusBadge domain="scraper" value="running" /> : latest ? <StatusBadge domain="scraper" value={latest.status} /> : <span className="text-xs text-ink-muted">Aldrig körd</span>}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">{latest ? `${formatRelative(latest.started_at)} · ${formatDuration(latest.duration_ms)}` : '–'}</span>
        <span className="font-mono text-[13px] text-ink">{latest ? `${latest.events_found} hittade · ${latest.events_imported} nya · ${latest.duplicates_skipped} dubl.` : '–'}</span>
      </div>
      <div className="flex h-7 items-end gap-[3px]" aria-label="Nya event per körning, senaste 14 körningarna">
        {trend.length === 0 ? <span className="text-[11px] text-ink-faint">Ingen historik</span> : null}
        {trend.map((l) => {
          const v = l.events_imported || 0
          const h = v === 0 ? 2 : 4 + Math.round((v / max) * 22)
          return <div key={l.id} title={`${formatRelative(l.started_at)}: ${v} nya`} className={cn('flex-1 rounded-[2px]', l.status === 'failed' ? 'bg-poppy' : l.status === 'partial' ? 'bg-amber' : v === 0 ? 'bg-line' : 'bg-sea')} style={{ height: h }} />
        })}
      </div>
      <span className={cn('line-clamp-2 text-xs', failed ? 'text-poppy' : partial ? 'text-amber' : 'text-ink-muted')} title={note}>
        {note}
      </span>
      <div className="mt-auto flex items-center justify-between pt-1">
        <label className="inline-flex items-center gap-2 text-xs text-ink-soft" title={schedule?.next_run_at ? `Nästa: ${formatRelative(schedule.next_run_at)}` : 'Körs av GitHub Actions 06:00'}>
          <input type="checkbox" readOnly disabled checked={schedule ? schedule.enabled : true} className="size-3.5 accent-sea" />
          {schedule?.enabled && schedule.next_run_at ? `Nästa ${formatRelative(schedule.next_run_at)}` : 'Schema 06:00'}
        </label>
        {isRunning && runningProcess ? (
          <Button size="sm" variant="secondary" onClick={() => onShowProgress(runningProcess.id)}>
            Visa förlopp
          </Button>
        ) : failed || partial ? (
          <Button size="sm" variant="secondary" onClick={() => onShowErrors(latest?.errors ?? [])}>
            Visa fel
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={onRun} disabled={disabled}>
            Kör nu
          </Button>
        )}
      </div>
    </article>
  )
}
