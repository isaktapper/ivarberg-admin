'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Copy } from 'lucide-react'
import * as stringSimilarity from 'string-similarity'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import type { Event } from '@/types/database'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, Segmented } from '@/components/ui/tabs'
import { FilterBar, SelectFilter } from '@/components/ui/filter-chip'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { CategoryChip, QualityDot, StatusBadge, ToneBadge } from '@/components/ui/status-badge'
import { Thumb } from '@/components/ui/data-table'
import type { StatusTone } from '@/lib/status'

interface DuplicateLog {
  id: number
  scraper_name: string
  scraped_event_name: string
  scraped_event_url: string | null
  existing_event_id: number
  existing_event_name: string
  existing_event_url: string | null
  similarity_score: number
  match_type: 'url' | 'fuzzy_name' | string
  scraped_at: string
}

type DupEvent = Event & { organizer?: { name: string; scraper_source?: string | null } | null }

interface Pair {
  key: string
  a: DupEvent
  b: DupEvent
  similarity: number
}

const PAGE = 25

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^\wåäöÅÄÖ\s]/g, '')
    .replace(/\b(med|och|i|på|till|från|live|konsert|show|presenterar)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const venueKeyword = (venue: string) => {
  const cleaned = venue.trim().split(/[,\-]/)[0].trim()
  return (cleaned.split(/\s+/)[0] || cleaned).toLowerCase()
}

const venueSimilarity = (v1?: string | null, v2?: string | null) => {
  if (!v1 || !v2) return 0
  const k1 = venueKeyword(v1)
  const k2 = venueKeyword(v2)
  if (!k1 || !k2) return 0
  return stringSimilarity.compareTwoStrings(k1, k2)
}

const simTone = (s: number): StatusTone => (s >= 0.95 ? 'bad' : s >= 0.85 ? 'wait' : 'info')

export default function DuplicatesPage() {
  const toast = useToast()
  const confirm = useConfirm()

  const [tab, setTab] = useState<'auto' | 'potential'>('auto')
  const [logs, setLogs] = useState<DuplicateLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [scraper, setScraper] = useState('')
  const [matchType, setMatchType] = useState('')
  const [autoPage, setAutoPage] = useState(1)

  const [events, setEvents] = useState<DupEvent[] | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [threshold, setThreshold] = useState('80')
  const [potPage, setPotPage] = useState(1)
  const [dismissed, setDismissed] = useLocalStorage<string[]>('duplicates.dismissed', [])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    setLogsError(null)
    const { data, error } = await supabase.from('duplicate_event_logs').select('*').order('scraped_at', { ascending: false }).limit(500)
    if (error) setLogsError(error.message)
    else setLogs(data ?? [])
    setLogsLoading(false)
  }, [])

  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    setEventsError(null)
    try {
      const data = await fetchAllRows<DupEvent>((from, to) =>
        supabase
          .from('events')
          .select('*, organizer:organizers(name,scraper_source)')
          .eq('status', 'published')
          .gte('date_time', new Date().toISOString())
          .order('date_time', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      )
      setEvents(data)
    } catch (e) {
      setEventsError(e instanceof Error ? e.message : 'Okänt fel')
    } finally {
      setEventsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useEffect(() => {
    if (tab === 'potential' && events === null && !eventsLoading) loadEvents()
  }, [tab, events, eventsLoading, loadEvents])

  // ---- Auto-detekterade ----
  const scrapers = useMemo(() => Array.from(new Set(logs.map((l) => l.scraper_name))).sort().map((s) => ({ value: s, label: s, count: logs.filter((l) => l.scraper_name === s).length })), [logs])
  const filteredLogs = useMemo(() => logs.filter((l) => (!scraper || l.scraper_name === scraper) && (!matchType || l.match_type === matchType)), [logs, scraper, matchType])
  const pagedLogs = filteredLogs.slice((autoPage - 1) * PAGE, autoPage * PAGE)

  // ---- Potentiella (endast kommande publicerade) ----
  const allPairs = useMemo<Pair[]>(() => {
    if (!events) return []
    const out: Pair[] = []
    const byDay = new Map<string, DupEvent[]>()
    for (const e of events) {
      const day = e.date_time.split('T')[0]
      const arr = byDay.get(day)
      if (arr) arr.push(e)
      else byDay.set(day, [e])
    }
    for (const group of byDay.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i]
          const b = group[j]
          if (venueSimilarity(a.venue_name || a.location, b.venue_name || b.location) < 0.5) continue
          const sim = stringSimilarity.compareTwoStrings(normalizeName(a.name), normalizeName(b.name))
          if (sim >= 0.7) out.push({ key: [a.id, b.id].sort((x, y) => x - y).join('-'), a, b, similarity: sim })
        }
      }
    }
    return out.sort((x, y) => y.similarity - x.similarity)
  }, [events])

  const pairs = useMemo(() => allPairs.filter((p) => p.similarity >= Number(threshold) / 100 && !dismissed.includes(p.key)), [allPairs, threshold, dismissed])
  const pagedPairs = pairs.slice((potPage - 1) * PAGE, potPage * PAGE)

  useEffect(() => setPotPage(1), [threshold])
  useEffect(() => setAutoPage(1), [scraper, matchType])

  const keep = async (pair: Pair, keepId: number) => {
    const remove = pair.a.id === keepId ? pair.b : pair.a
    const keepEv = pair.a.id === keepId ? pair.a : pair.b
    const ok = await confirm({
      title: 'Ta bort dubletten?',
      description: `”${remove.name}” tas bort permanent. ”${keepEv.name}” behålls.`,
      confirmLabel: 'Ta bort',
      destructive: true,
    })
    if (!ok) return
    const { error } = await supabase.from('events').delete().eq('id', remove.id)
    if (error) return toast.error('Kunde inte ta bort', error.message)
    setEvents((prev) => (prev ? prev.filter((e) => e.id !== remove.id) : prev))
    toast.success('Dubletten borttagen', remove.name)
  }

  const dismiss = (pair: Pair) => {
    setDismissed((prev) => (prev.includes(pair.key) ? prev : [...prev, pair.key]))
    toast.info('Markerad som inte dublett', 'Paret döljs på den här enheten.')
  }

  const matchTypeLabel = (t: string) => (t === 'url' ? 'Samma URL' : t === 'fuzzy_name' ? 'Liknande namn' : t)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Dubletter" description="Event som scrapers har stoppat som dubletter, och publicerade event som liknar varandra." />

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as 'auto' | 'potential')}
        items={[
          { value: 'auto', label: 'Stoppade av scrapers', count: logs.length },
          { value: 'potential', label: 'Potentiella', count: events ? pairs.length : null },
        ]}
      />

      {tab === 'auto' ? (
        <>
          <FilterBar hasActive={!!scraper || !!matchType} onReset={() => { setScraper(''); setMatchType('') }}>
            <SelectFilter label="Scraper" value={scraper} options={scrapers} onChange={setScraper} allLabel="Alla scrapers" />
            <SelectFilter
              label="Typ"
              value={matchType}
              options={[
                { value: 'fuzzy_name', label: 'Liknande namn' },
                { value: 'url', label: 'Samma URL' },
              ]}
              onChange={setMatchType}
              allLabel="Alla typer"
            />
          </FilterBar>

          {logsLoading ? (
            <LoadingState />
          ) : logsError ? (
            <ErrorState description={logsError} onRetry={loadLogs} />
          ) : filteredLogs.length === 0 ? (
            <Card>
              <EmptyState icon={<Copy />} title="Inga stoppade dubletter" description="När en scraper hittar ett event som redan finns loggas det här." />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="hidden h-10 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px_130px_130px] items-center gap-3 border-b border-line bg-sand-soft px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted md:grid">
                <span>Scrapat event</span>
                <span>Befintligt event</span>
                <span>Likhet</span>
                <span>Typ · scraper</span>
                <span>När</span>
              </div>
              {pagedLogs.map((l) => (
                <div key={l.id} className="grid gap-2 border-b border-line-soft px-4 py-3 last:border-b-0 md:min-h-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px_130px_130px] md:items-center md:gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-medium text-ink">{l.scraped_event_name}</span>
                    {l.scraped_event_url ? (
                      <a href={l.scraped_event_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 truncate text-[11px] text-ink-muted hover:text-sea">
                        <ExternalLink className="size-3" /> källa
                      </a>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <Link href={`/events/${l.existing_event_id}/edit`} className="truncate text-[13px] font-medium text-ink hover:text-sea">
                      {l.existing_event_name}
                    </Link>
                    <Link href={`/events/${l.existing_event_id}`} className="text-[11px] text-sea">
                      Visa befintligt event
                    </Link>
                  </div>
                  <ToneBadge tone={simTone(l.similarity_score)} dot={false}>
                    {Math.round(l.similarity_score * 100)} %
                  </ToneBadge>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] text-ink">{matchTypeLabel(l.match_type)}</span>
                    <span className="truncate text-[11px] text-ink-muted">{l.scraper_name}</span>
                  </div>
                  <span className="font-mono text-xs text-ink-soft">{formatRelative(l.scraped_at)}</span>
                </div>
              ))}
              {filteredLogs.length > PAGE ? (
                <div className="border-t border-line px-4 py-3">
                  <Pagination page={autoPage} pageSize={PAGE} total={filteredLogs.length} onPageChange={setAutoPage} itemLabel="rader" />
                </div>
              ) : null}
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-ink-soft">Minsta likhet</span>
              <Segmented
                value={threshold}
                onChange={setThreshold}
                items={[
                  { value: '70', label: '70 %' },
                  { value: '80', label: '80 %' },
                  { value: '90', label: '90 %' },
                ]}
              />
            </div>
            <span className="text-xs text-ink-muted">Jämför bara publicerade, kommande event samma dag med liknande plats. Passerade event ignoreras.</span>
          </div>

          {eventsLoading || (events === null && !eventsError) ? (
            <LoadingState label="Jämför kommande event…" />
          ) : eventsError ? (
            <ErrorState description={eventsError} onRetry={loadEvents} />
          ) : pairs.length === 0 ? (
            <Card>
              <EmptyState icon={<Copy />} title="Inga potentiella dubletter" description={dismissed.length ? `${dismissed.length} par är markerade som inte dubletter på den här enheten.` : 'Inga kommande publicerade event liknar varandra över tröskeln.'} action={dismissed.length ? <Button variant="ghost" size="sm" onClick={() => setDismissed([])}>Visa dolda par igen</Button> : undefined} />
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {pagedPairs.map((p) => (
                <Card key={p.key}>
                  <CardBody className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ToneBadge tone={simTone(p.similarity)}>{Math.round(p.similarity * 100)} % likhet</ToneBadge>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => dismiss(p)}>
                          Inte dublett
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {[p.a, p.b].map((e, i) => (
                        <div key={e.id} className={cn('flex flex-col gap-2.5 rounded-[10px] border border-line bg-sand-soft p-3')}>
                          <div className="flex items-start gap-3">
                            <Thumb src={e.image_url} size={48} className="rounded-lg" />
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="truncate text-[13px] font-semibold text-ink">{e.name}</span>
                              <span className="truncate font-mono text-xs text-ink-soft">{formatDateTime(e.date_time)}</span>
                              <span className="truncate text-xs text-ink-muted">{e.venue_name || e.location}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge domain="event" value={e.status} />
                            <CategoryChip muted>{e.organizer?.name ?? 'Ingen arrangör'}</CategoryChip>
                            <CategoryChip muted>{e.organizer?.scraper_source ?? 'Manuell'}</CategoryChip>
                            <QualityDot score={e.quality_score} />
                          </div>
                          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                            <Link href={`/events/${e.id}/edit`} className="text-[13px] font-medium text-sea hover:text-sea-dark">
                              Öppna
                            </Link>
                            <Button size="sm" variant="secondary" onClick={() => keep(p, e.id)}>
                              Behåll {i === 0 ? 'vänster' : 'höger'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              ))}
              {pairs.length > PAGE ? <Pagination page={potPage} pageSize={PAGE} total={pairs.length} onPageChange={setPotPage} itemLabel="par" /> : null}
            </div>
          )}
        </>
      )}
    </div>
  )
}
