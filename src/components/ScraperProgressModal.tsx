'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScraperProgressLog, ProgressStep } from '@/types/database'
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { LoadingState, ErrorState } from '@/components/ui/states'
import { formatDuration, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'

interface ScraperProgressModalProps {
  logId: number
  scraperName: string
  onClose: () => void
}

interface ProgressData {
  scraperLog: {
    id: number
    scraper_name: string
    status: string
    started_at: string
    completed_at?: string
    duration_ms?: number
  }
  progressLogs: ScraperProgressLog[]
  totalProgress: { current: number; total: number; percentage: number } | null
  isRunning: boolean
  estimatedTimeRemaining: number | null
}

const stepLabels: Record<ProgressStep, string> = {
  starting: 'Startar',
  scraping: 'Hämtar',
  deduplicating: 'Rensar dubletter',
  categorizing: 'Kategoriserar',
  matching_organizers: 'Matchar arrangörer',
  importing: 'Sparar',
  completed: 'Klar',
  failed: 'Misslyckades',
}

function StepIcon({ step, active }: { step: ProgressStep; active: boolean }) {
  if (step === 'completed') return <CheckCircle2 className="size-4 text-kelp" />
  if (step === 'failed') return <XCircle className="size-4 text-poppy" />
  if (active) return <Loader2 className="size-4 animate-spin text-sea" />
  return <CheckCircle2 className="size-4 text-ink-faint" />
}

/** Förloppet för en scraper-körning. Pollar varje sekund så länge den kör. */
export default function ScraperProgressModal({ logId, scraperName, onClose }: ScraperProgressModalProps) {
  const [data, setData] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(true)

  const fetchProgress = useCallback(async () => {
    try {
      const response = await fetch(`/api/scrape/${logId}/progress`)
      if (!response.ok) throw new Error('Kunde inte hämta förloppet')
      const progressData: ProgressData = await response.json()
      setData(progressData)
      setRunning(progressData.isRunning)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte hämta förloppet')
      setRunning(false)
    } finally {
      setLoading(false)
    }
  }, [logId])

  useEffect(() => {
    fetchProgress()
  }, [fetchProgress])

  useEffect(() => {
    if (!running) return
    const interval = setInterval(fetchProgress, 1000)
    return () => clearInterval(interval)
  }, [running, fetchProgress])

  const currentLog = data?.progressLogs[data.progressLogs.length - 1]
  const isCompleted = data ? data.scraperLog.status !== 'running' : false

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="lg"
        title={scraperName}
        description={data ? `Startad ${formatTime(data.scraperLog.started_at)}` : undefined}
        footer={
          <>
            {isCompleted && data?.scraperLog.duration_ms ? (
              <span className="mr-auto text-[13px] text-ink-soft">
                Total tid: <span className="font-mono text-ink">{formatDuration(data.scraperLog.duration_ms)}</span>
              </span>
            ) : null}
            <Button variant="secondary" onClick={onClose}>
              Stäng
            </Button>
          </>
        }
      >
        {loading ? (
          <LoadingState label="Hämtar förlopp…" />
        ) : error ? (
          <ErrorState title="Kunde inte hämta förloppet" description={error} onRetry={fetchProgress} />
        ) : data ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <StatusBadge domain="scraper" value={data.scraperLog.status} />
              {data.totalProgress ? (
                <span className="font-mono text-xs text-ink-muted">
                  {data.totalProgress.current} / {data.totalProgress.total}
                </span>
              ) : null}
              {data.estimatedTimeRemaining && data.isRunning ? (
                <span className="inline-flex items-center gap-1 font-mono text-xs text-ink-muted">
                  <Clock className="size-3" />~{formatDuration(data.estimatedTimeRemaining)} kvar
                </span>
              ) : null}
            </div>

            {data.totalProgress ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-ink">{currentLog?.message || 'Bearbetar…'}</span>
                  <span className="font-mono text-ink-muted">{data.totalProgress.percentage}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone">
                  <div className="h-full rounded-full bg-sea transition-all duration-500" style={{ width: `${data.totalProgress.percentage}%` }} />
                </div>
              </div>
            ) : null}

            <ol className="flex flex-col gap-2">
              {data.progressLogs.map((log, index) => {
                const active = index === data.progressLogs.length - 1 && data.isRunning
                const pct = log.progress_total ? Math.round(((log.progress_current || 0) / log.progress_total) * 100) : null
                return (
                  <li key={log.id} className={cn('flex items-start gap-3 rounded-[10px] border px-3 py-2.5', active ? 'border-sea-light bg-sea-lightest' : 'border-line-soft bg-sand-soft')}>
                    <span className="mt-0.5">
                      <StepIcon step={log.step} active={active} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13px] font-medium text-ink">{stepLabels[log.step] ?? log.step}</span>
                        <span className="font-mono text-[11px] text-ink-muted">{formatTime(log.created_at)}</span>
                      </div>
                      <span className="text-[13px] text-ink-soft">{log.message}</span>
                      {pct != null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone">
                            <div className="h-full rounded-full bg-sea" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-mono text-[11px] text-ink-muted">
                            {log.progress_current} / {log.progress_total}
                          </span>
                        </div>
                      ) : null}
                      {log.metadata && Object.keys(log.metadata).length > 0 ? (
                        <dl className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-ink-muted">
                          {Object.entries(log.metadata).map(([k, v]) => (
                            <span key={k}>
                              {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </span>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                  </li>
                )
              })}
              {data.progressLogs.length === 0 ? <li className="text-[13px] text-ink-muted">Inga förloppsrader ännu.</li> : null}
            </ol>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
