'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { Download, RefreshCw, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart as RechartsPieChart, Pie, Cell, Legend } from 'recharts'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Tabs } from '@/components/ui/tabs'
import { DataTable, type Column } from '@/components/ui/data-table'
import { Banner, ErrorState, LoadingState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { useUrlState } from '@/hooks/use-url-state'
import { formatDuration, formatNumber, formatRelative } from '@/lib/format'
import { qualityTone, toneClasses } from '@/lib/status'
import { cn } from '@/lib/utils'

interface ScraperStat {
  name: string
  total: number
  success: number
  failed: number
  partial: number
  cancelled: number
  successRate: number
  totalEventsFound: number
  totalEventsImported: number
  totalDuplicates: number
  avgDuration: number
  lastRun: string | null
  lastStatus: string | null
}

interface DashboardData {
  scrapers: {
    stats: ScraperStat[]
    trend: { date: string; imported: number; found: number; duplicates: number }[]
    topErrors: { error: string; count: number }[]
    summary: { totalRuns: number; totalFound: number; totalImported: number; totalDuplicates: number; overallSuccessRate: number }
  }
  events: {
    stats: { total: number; published: number; pending: number; draft: number; cancelled: number; active: number; passed: number; addedLast24h: number; addedLast7d: number }
    categories: { name: string; count: number }[]
    sources: { name: string; count: number }[]
    weeklyForecast: { week: string; count: number }[]
    trend: { date: string; added: number }[]
  }
  quality: { noCategory: number; noImage: number; noDescription: number; lowQuality: number; avgQualityScore: number }
  generatedAt: string
}

const C = {
  sea: '#0F5AA6',
  seaLight: '#DEE9F7',
  kelp: '#1B6F49',
  amber: '#8A5A00',
  poppy: '#B84A14',
  ink: '#10214B',
  inkMuted: '#6B7385',
  line: '#E3DBCA',
  grid: '#F0EBE3',
}
const SERIES = [C.sea, C.kelp, C.amber, C.poppy, '#4F7FC2', '#5FA187', '#C08A2B', '#080860']

const tooltipStyle = { borderRadius: 10, border: `1px solid ${C.line}`, boxShadow: '0 8px 24px rgba(16,33,75,0.12)', fontSize: 12, fontFamily: 'inherit' }
const axisTick = { fontSize: 11, fill: C.inkMuted }
const fmtDate = (v: string) => new Date(v).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '')

const TABS = [
  { value: 'overview', label: 'Översikt' },
  { value: 'scrapers', label: 'Scrapers' },
  { value: 'events', label: 'Events' },
  { value: 'quality', label: 'Datakvalitet' },
]

export default function StatisticsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <StatisticsContent />
    </Suspense>
  )
}

function StatisticsContent() {
  const toast = useToast()
  const { state, set } = useUrlState({ tab: 'overview' })
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/dashboard-stats')
      const result = await response.json()
      if (result.error) throw new Error(result.error)
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Okänt fel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await fetch('/api/admin/statistics/export')
      if (!response.ok) throw new Error('Exporten misslyckades')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `event-statistik-${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Excel-filen laddas ner')
    } catch (e) {
      toast.error('Export misslyckades', e instanceof Error ? e.message : undefined)
    } finally {
      setExporting(false)
    }
  }

  const tab = TABS.some((t) => t.value === state.tab) ? state.tab : 'overview'

  return (
    <>
      <PageHeader
        title="Statistik"
        description={data ? `Senaste 30 dagarna · uppdaterad ${formatRelative(data.generatedAt)}` : 'Senaste 30 dagarna'}
        actions={
          <>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              Uppdatera
            </Button>
            <Button onClick={handleExport} loading={exporting}>
              <Download />
              Exportera Excel
            </Button>
          </>
        }
      />
      <Tabs items={TABS} value={tab} onChange={(v) => set({ tab: v })} />

      {loading ? (
        <LoadingState label="Räknar…" />
      ) : error || !data ? (
        <ErrorState title="Kunde inte ladda statistik" description={error} onRetry={load} />
      ) : tab === 'overview' ? (
        <OverviewTab data={data} />
      ) : tab === 'scrapers' ? (
        <ScrapersTab data={data} />
      ) : tab === 'events' ? (
        <EventsTab data={data} />
      ) : (
        <QualityTab data={data} />
      )}
    </>
  )
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title={title} className="py-3" />
      <CardBody>{children}</CardBody>
    </Card>
  )
}

function OverviewTab({ data }: { data: DashboardData }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Totalt event" value={data.events.stats.total} />
        <StatCard label="Publicerade" value={data.events.stats.published} tone="ok" />
        <StatCard label="Kommande" value={data.events.stats.active} />
        <StatCard label="Nya senaste 24 h" value={data.events.stats.addedLast24h} />
        <StatCard label="Körningar" value={data.scrapers.summary.totalRuns} />
        <StatCard label="Lyckade körningar" value={`${data.scrapers.summary.overallSuccessRate} %`} tone={data.scrapers.summary.overallSuccessRate >= 90 ? 'ok' : data.scrapers.summary.overallSuccessRate >= 70 ? 'wait' : 'bad'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Kommande event per vecka">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.events.weeklyForecast}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="week" tick={axisTick} axisLine={{ stroke: C.line }} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: C.grid }} formatter={(v) => [`${v} event`, 'Antal']} />
              <Bar dataKey="count" fill={C.sea} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Event per kategori">
          <ResponsiveContainer width="100%" height={220}>
            <RechartsPieChart>
              <Pie data={data.events.categories.slice(0, 8)} cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2} dataKey="count" nameKey="name" stroke="#fff">
                {data.events.categories.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={SERIES[i % SERIES.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [`${value} event`, name]} />
              <Legend layout="vertical" verticalAlign="middle" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: C.ink }} />
            </RechartsPieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Importerade event per dag">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.scrapers.trend}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickFormatter={fmtDate} axisLine={{ stroke: C.line }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => new Date(v).toLocaleDateString('sv-SE')} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="imported" stroke={C.kelp} strokeWidth={1.5} dot={false} name="Importerade" />
            <Line type="monotone" dataKey="duplicates" stroke={C.amber} strokeWidth={1.5} dot={false} name="Dubletter" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

function ScrapersTab({ data }: { data: DashboardData }) {
  const columns: Column<ScraperStat>[] = [
    { key: 'name', header: 'Källa', width: 'minmax(0,1fr)', cell: (s) => <span className="font-medium">{s.name}</span> },
    {
      key: 'runs',
      header: 'Körningar',
      width: '130px',
      cell: (s) => (
        <span className="font-mono text-xs">
          {s.total} <span className="text-ink-muted">({s.success} ok{s.failed > 0 ? `, ${s.failed} fel` : ''})</span>
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Lyckade',
      width: '140px',
      cell: (s) => (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-stone">
            <span className={cn('block h-full rounded-full', s.successRate >= 90 ? 'bg-kelp' : s.successRate >= 70 ? 'bg-amber' : 'bg-poppy')} style={{ width: `${s.successRate}%` }} />
          </span>
          <span className="font-mono text-xs">{s.successRate} %</span>
        </span>
      ),
    },
    { key: 'imported', header: 'Nya', width: '80px', cell: (s) => <span className="font-mono text-xs text-kelp">+{s.totalEventsImported}</span> },
    { key: 'dupl', header: 'Dubletter', width: '90px', cell: (s) => <span className="font-mono text-xs text-ink-soft">{s.totalDuplicates}</span> },
    { key: 'dur', header: 'Snittid', width: '90px', cell: (s) => <span className="font-mono text-xs text-ink-soft">{formatDuration(s.avgDuration)}</span> },
    {
      key: 'last',
      header: 'Senaste',
      width: '200px',
      cell: (s) => (
        <span className="flex items-center gap-2">
          {s.lastStatus ? <StatusBadge domain="scraper" value={s.lastStatus} /> : null}
          <span className="font-mono text-xs text-ink-muted">{s.lastRun ? formatRelative(s.lastRun) : '–'}</span>
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Körningar" value={data.scrapers.summary.totalRuns} />
        <StatCard label="Importerade" value={data.scrapers.summary.totalImported} tone="ok" />
        <StatCard label="Dubletter" value={data.scrapers.summary.totalDuplicates} />
        <StatCard label="Lyckade" value={`${data.scrapers.summary.overallSuccessRate} %`} note="klara + delvis" />
      </div>

      <DataTable columns={columns} rows={data.scrapers.stats} rowKey={(s) => s.name} />

      <ChartCard title="Hämtade, importerade och dubletter per dag">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data.scrapers.trend}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickFormatter={fmtDate} axisLine={{ stroke: C.line }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => new Date(v).toLocaleDateString('sv-SE')} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="found" stroke={C.sea} strokeWidth={1.5} dot={false} name="Hittade" />
            <Line type="monotone" dataKey="imported" stroke={C.kelp} strokeWidth={1.5} dot={false} name="Importerade" />
            <Line type="monotone" dataKey="duplicates" stroke={C.amber} strokeWidth={1.5} dot={false} name="Dubletter" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {data.scrapers.topErrors.length > 0 ? (
        <Card>
          <CardHeader title="Vanligaste felen" className="py-3" />
          <ul className="flex flex-col">
            {data.scrapers.topErrors.map((err, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line-soft px-5 py-2.5 last:border-b-0">
                <AlertTriangle className="size-3.5 shrink-0 text-poppy" />
                <span className="flex-1 truncate font-mono text-xs text-ink" title={err.error}>
                  {err.error}
                </span>
                <span className="font-mono text-xs text-ink-muted">{err.count} ×</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

function EventsTab({ data }: { data: DashboardData }) {
  const s = data.events.stats
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Totalt" value={s.total} />
        <StatCard label="Publicerade" value={s.published} tone="ok" />
        <StatCard label="Väntar" value={s.pending} tone={s.pending > 0 ? 'wait' : undefined} />
        <StatCard label="Utkast" value={s.draft} />
        <StatCard label="Inställda" value={s.cancelled} tone={s.cancelled > 0 ? 'bad' : undefined} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Kommande" value={s.active} note="publicerade" />
        <StatCard label="Passerade" value={s.passed} />
        <StatCard label="Nya senaste 24 h" value={s.addedLast24h} />
        <StatCard label="Nya senaste 7 dagarna" value={s.addedLast7d} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Event per kategori">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.events.categories} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke={C.grid} horizontal={false} />
              <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={axisTick} width={110} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: C.grid }} formatter={(v) => [`${v} event`, 'Antal']} />
              <Bar dataKey="count" fill={C.sea} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Event per arrangör">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.events.sources} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke={C.grid} horizontal={false} />
              <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={axisTick} width={130} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: C.grid }} formatter={(v) => [`${v} event`, 'Antal']} />
              <Bar dataKey="count" fill={C.kelp} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Kommande event per vecka">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.events.weeklyForecast}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="week" tick={axisTick} axisLine={{ stroke: C.line }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: C.grid }} formatter={(v) => [`${v} event`, 'Antal']} />
            <Bar dataKey="count" fill={C.sea} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Tillagda event per dag">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.events.trend}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickFormatter={fmtDate} axisLine={{ stroke: C.line }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => new Date(v).toLocaleDateString('sv-SE')} />
            <Line type="monotone" dataKey="added" stroke={C.sea} strokeWidth={1.5} dot={false} name="Tillagda" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

function QualityTab({ data }: { data: DashboardData }) {
  const totalPublished = data.events.stats.published
  const score = data.quality.avgQualityScore
  const tone = qualityTone(score)
  const issues = [
    { label: 'Saknar kategori', count: data.quality.noCategory, href: '/events?view=okategoriserade' },
    { label: 'Saknar bild', count: data.quality.noImage, href: '/events?view=utanbild' },
    { label: 'Kort eller ingen beskrivning', count: data.quality.noDescription, href: '/events?view=atgard' },
    { label: 'Kvalitetspoäng under 50', count: data.quality.lowQuality, href: '/events?view=atgard' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="font-display text-base font-semibold text-ink">Genomsnittlig kvalitetspoäng</h2>
              <p className="text-[13px] text-ink-soft">Baserat på {formatNumber(totalPublished)} publicerade event</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn('font-display text-[40px] font-semibold leading-none', toneClasses[tone].text)}>{score}</span>
              <span className="text-[13px] text-ink-muted">/ 100</span>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone">
            <div className={cn('h-full rounded-full', toneClasses[tone].dot)} style={{ width: `${score}%` }} />
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {issues.map((issue) => (
          <StatCard
            key={issue.label}
            label={issue.label}
            value={issue.count}
            href={issue.href}
            tone={issue.count === 0 ? 'ok' : issue.count > 50 ? 'bad' : 'wait'}
            note={totalPublished > 0 ? `${Math.round((issue.count / totalPublished) * 100)} % av publicerade` : undefined}
          />
        ))}
      </div>

      <ChartCard title="Kvalitetsproblem">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={issues}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: C.line }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: C.grid }} formatter={(v) => [`${v} event`, 'Antal']} />
            <Bar dataKey="count" fill={C.poppy} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Banner tone="info" title="Så höjer du kvaliteten">
        <ul className="list-disc pl-4 text-[13px] leading-relaxed">
          <li>Okategoriserade event hittar du i vyn ”Okategoriserade” på Alla events.</li>
          <li>Event utan bild får sämre synlighet på ivarberg.nu och utesluts från Instagram-posten.</li>
          <li>Korta beskrivningar ger sämre sök och läsupplevelse.</li>
          <li>Låg kvalitetspoäng betyder att flera fält saknas eller är ofullständiga.</li>
        </ul>
      </Banner>
    </div>
  )
}
