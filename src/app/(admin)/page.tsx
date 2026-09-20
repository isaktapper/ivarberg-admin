'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Image as ImageIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SCRAPER_SOURCES } from '@/lib/constants'
import { formatNumber, formatRelative, formatTime, toLocalDateInput } from '@/lib/format'
import { Card, CardBody, CardHeader, SectionLabel } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import type { StatusTone } from '@/lib/status'

interface SourceRow {
  name: string
  started_at: string | null
  status: string | null
  events_found: number
  events_imported: number
}

interface InstagramToday {
  status: string
  posted_at: string | null
  proxied_image_url: string | null
  image_url: string | null
  slide_image_urls: string[] | null
  approval_source: string | null
  approval_token: string | null
  caption: string | null
  eventName: string | null
}

interface DayTile {
  date: string
  label: string
  count: number
  noImage: number
  isToday: boolean
}

interface DashboardData {
  totals: { events: number; organizers: number; upcoming: number }
  review: { count: number; newSinceYesterday: number }
  tips: { count: number; latest: string | null }
  duplicates: { count: number; perScraper: string }
  alerts: { count: number; latest: string | null }
  sources: SourceRow[]
  instagram: InstagramToday | null
  hero: { main: string | null; secondary: number }
  days: DayTile[]
  quality: { noImage: number; uncategorized: number; noOrganizer: number; lowScore: number }
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'godkänd på sidan',
  ntfy: 'godkänd via ntfy',
  auto: 'auto-publicerad',
  direct: 'direktpublicerad',
}

function stockholmToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

async function loadDashboard(): Promise<DashboardData> {
  const now = new Date()
  const nowIso = now.toISOString()
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 3600 * 1000)
  const today = stockholmToday()

  const head = { count: 'exact' as const, head: true }
  const upcoming = () => supabase.from('events').select('*', head).eq('status', 'published').gte('date_time', nowIso)

  const [
    totalEvents,
    totalOrganizers,
    upcomingCount,
    review,
    reviewNew,
    tipsCount,
    latestTip,
    dupCount,
    dupRows,
    alertCount,
    latestAlert,
    latestLogs,
    instagram,
    hero,
    weekEvents,
    noImage,
    uncategorized,
    noOrganizer,
    lowScore,
  ] = await Promise.all([
    supabase.from('events').select('*', head),
    supabase.from('organizers').select('*', head),
    upcoming(),
    supabase.from('events').select('*', head).in('status', ['draft', 'pending_approval']),
    supabase.from('events').select('*', head).in('status', ['draft', 'pending_approval']).gte('created_at', yesterday),
    supabase.from('event_tips').select('*', head).eq('status', 'pending'),
    supabase.from('event_tips').select('event_name').eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('duplicate_event_logs').select('*', head).gte('created_at', weekAgo),
    supabase.from('duplicate_event_logs').select('scraper_name').gte('created_at', weekAgo).limit(200),
    supabase.from('system_alerts').select('*', head).eq('resolved', false),
    supabase.from('system_alerts').select('title').eq('resolved', false).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('scraper_logs').select('scraper_name, started_at, status, events_found, events_imported').order('started_at', { ascending: false }).limit(60),
    supabase
      .from('instagram_posts')
      .select('status, posted_at, proxied_image_url, image_url, slide_image_urls, approval_source, approval_token, caption, event:events(name)')
      .eq('post_date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('hero_featured_events').select('position, event:events(name)'),
    supabase.from('events').select('date_time, image_url').eq('status', 'published').gte('date_time', startOfToday.toISOString()).lt('date_time', endOfWeek.toISOString()).limit(2000),
    upcoming().or('image_url.is.null,image_url.eq.'),
    upcoming().or('categories.is.null,categories.cs.{"Okategoriserad"}'),
    upcoming().is('organizer_id', null),
    upcoming().lt('quality_score', 50),
  ])

  const failed = [totalEvents, totalOrganizers, upcomingCount, review, latestLogs, weekEvents].find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)

  // Senaste körning per källa
  const sources: SourceRow[] = SCRAPER_SOURCES.map((name) => {
    const log = latestLogs.data?.find((l) => l.scraper_name === name)
    return {
      name,
      started_at: log?.started_at ?? null,
      status: log?.status ?? null,
      events_found: log?.events_found ?? 0,
      events_imported: log?.events_imported ?? 0,
    }
  })

  // Dubletter per scraper
  const perScraper = new Map<string, number>()
  dupRows.data?.forEach((r) => perScraper.set(r.scraper_name, (perScraper.get(r.scraper_name) ?? 0) + 1))
  const perScraperText = [...perScraper.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n, c]) => `${c} från ${n}`)
    .join(', ')

  // 7 dagar
  const days: DayTile[] = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startOfToday.getTime() + i * 24 * 3600 * 1000)
    const key = toLocalDateInput(d)
    const rows = (weekEvents.data ?? []).filter((e) => toLocalDateInput(e.date_time) === key)
    return {
      date: key,
      label: capitalize(d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric' }).replace('.', '')),
      count: rows.length,
      noImage: rows.filter((e) => !e.image_url).length,
      isToday: i === 0,
    }
  })

  type HeroRow = { position: string; event: { name: string } | { name: string }[] | null }
  const heroRows = (hero.data ?? []) as HeroRow[]
  const heroName = (r: HeroRow | undefined) => (!r?.event ? null : Array.isArray(r.event) ? r.event[0]?.name ?? null : r.event.name)
  const mainHero = heroRows.find((r) => r.position === 'main')

  type IgRow = Omit<InstagramToday, 'eventName'> & { event: { name: string } | { name: string }[] | null }
  const ig = instagram.data as IgRow | null
  const igEvent = ig?.event ? (Array.isArray(ig.event) ? ig.event[0]?.name : ig.event.name) : null

  return {
    totals: { events: totalEvents.count ?? 0, organizers: totalOrganizers.count ?? 0, upcoming: upcomingCount.count ?? 0 },
    review: { count: review.count ?? 0, newSinceYesterday: reviewNew.count ?? 0 },
    tips: { count: tipsCount.count ?? 0, latest: latestTip.data?.event_name ?? null },
    duplicates: { count: dupCount.count ?? 0, perScraper: perScraperText },
    alerts: { count: alertCount.count ?? 0, latest: latestAlert.data?.title ?? null },
    sources,
    instagram: ig ? { ...ig, eventName: igEvent ?? null } : null,
    hero: { main: heroName(mainHero), secondary: heroRows.filter((r) => r.position === 'secondary').length },
    days,
    quality: {
      noImage: noImage.count ?? 0,
      uncategorized: uncategorized.count ?? 0,
      noOrganizer: noOrganizer.count ?? 0,
      lowScore: lowScore.count ?? 0,
    },
  }
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loadDashboard())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Okänt fel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const title = useMemo(() => capitalize(new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })), [])

  const subtitle = useMemo(() => {
    if (!data) return ''
    const parts: string[] = []
    const latestRun = data.sources.map((s) => s.started_at).filter(Boolean).sort().reverse()[0]
    if (latestRun) {
      const ranToday = toLocalDateInput(latestRun) === toLocalDateInput(new Date())
      parts.push(ranToday ? `Scrapers kördes ${formatTime(latestRun)}.` : `Scrapers kördes senast ${formatRelative(latestRun)}.`)
    }
    parts.push(data.review.count > 0 ? `${formatNumber(data.review.count)} event väntar på dig.` : 'Inga event väntar på granskning.')
    if (data.instagram?.status === 'published' && data.instagram.posted_at) parts.push(`Instagram-posten gick ut ${formatTime(data.instagram.posted_at)}.`)
    else if (data.instagram?.status === 'pending') parts.push('Instagram-posten väntar på godkännande.')
    else if (!data.instagram) parts.push('Ingen Instagram-post skapad ännu i dag.')
    return parts.join(' ')
  }, [data])

  if (error) {
    return (
      <>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        <ErrorState title="Kunde inte ladda översikten" description={error} onRetry={load} />
      </>
    )
  }

  const igThumb = data?.instagram?.proxied_image_url || data?.instagram?.slide_image_urls?.[0] || data?.instagram?.image_url || null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">{title}</h1>
          {loading ? <Skeleton className="h-4 w-96" /> : <p className="text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {data ? (
          <span className="font-mono text-xs text-ink-muted">
            {formatNumber(data.totals.events)} event · {formatNumber(data.totals.organizers)} arrangörer · {formatNumber(data.totals.upcoming)} kommande
          </span>
        ) : null}
      </div>

      <section aria-label="Att göra" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-[12px]" />)
        ) : (
          <>
            <StatCard
              label="Granska nya event"
              value={data.review.count}
              tone={data.review.count > 0 ? 'bad' : 'ok'}
              href="/events/review"
              note={data.review.newSinceYesterday > 0 ? `${data.review.newSinceYesterday} nya sedan igår` : 'Inga nya sedan igår'}
            />
            <StatCard label="Tips från besökare" value={data.tips.count} tone={data.tips.count > 0 ? 'info' : 'ok'} href="/admin/tips" note={data.tips.latest ? `Senaste: ${data.tips.latest}` : 'Inga väntande tips'} />
            <StatCard
              label="Misstänkta dubletter"
              value={data.duplicates.count}
              tone={data.duplicates.count > 0 ? 'wait' : 'ok'}
              href="/events/duplicates"
              note={data.duplicates.perScraper || 'Inga senaste 7 dagarna'}
            />
            <StatCard label="Olösta larm" value={data.alerts.count} tone={data.alerts.count > 0 ? 'bad' : 'ok'} href="/admin/alerts" note={data.alerts.latest ?? 'Allt lugnt'} />
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader
            title="Källor senaste dygnet"
            actions={
              <Link href="/scrapers" className="text-[13px] font-medium text-sea hover:text-sea-dark">
                Alla körningar
              </Link>
            }
          />
          <div className="grid h-9 grid-cols-[minmax(0,1fr)_120px_120px_100px] items-center gap-3 bg-sand-soft px-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            <span>Källa</span>
            <span>Kördes</span>
            <span>Hittade / nya</span>
            <span>Status</span>
          </div>
          {loading || !data
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex h-11 items-center gap-3 border-t border-line-soft px-5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3.5 w-1/5" />
                </div>
              ))
            : data.sources.map((s) => (
                <div key={s.name} className="grid h-11 grid-cols-[minmax(0,1fr)_120px_120px_100px] items-center gap-3 border-t border-line-soft px-5">
                  <span className="truncate text-[13px] font-medium text-ink">{s.name}</span>
                  <span className="font-mono text-xs text-ink-soft">{s.started_at ? formatRelative(s.started_at) : '–'}</span>
                  <span className="font-mono text-xs text-ink">
                    {s.status ? `${s.events_found} / ${s.events_imported}` : '–'}
                  </span>
                  {s.status ? <StatusBadge domain="scraper" value={s.status} /> : <span className="text-xs text-ink-muted">Aldrig körd</span>}
                </div>
              ))}
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Instagram idag" actions={data?.instagram ? <StatusBadge domain="instagram" value={data.instagram.status} /> : null} />
          <CardBody className="flex gap-4">
            {loading ? (
              <Skeleton className="size-28 shrink-0 rounded-[10px]" />
            ) : igThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={igThumb} alt="" className="size-28 shrink-0 rounded-[10px] bg-sea-light object-cover" />
            ) : (
              <div className="flex size-28 shrink-0 items-center justify-center rounded-[10px] bg-sea-light text-sea">
                <ImageIcon className="size-7" strokeWidth={1.5} />
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-1.5">
              {loading || !data ? (
                <>
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3.5 w-64" />
                </>
              ) : data.instagram ? (
                <>
                  <span className="text-sm font-semibold text-ink">Det här händer i Varberg idag</span>
                  <span className="text-[13px] leading-relaxed text-ink-soft">
                    {data.instagram.eventName ? `Huvudevent: ${data.instagram.eventName}` : 'Inget huvudevent'}
                    {data.instagram.slide_image_urls?.length ? ` · ${data.instagram.slide_image_urls.length} slides` : ''}
                    {data.instagram.posted_at ? ` · ${formatTime(data.instagram.posted_at)}` : ''}
                    {data.instagram.approval_source ? ` · ${SOURCE_LABEL[data.instagram.approval_source] ?? data.instagram.approval_source}` : ''}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-2 text-[13px] font-medium">
                    <Link href={data.instagram.approval_token ? `/instagram/approve/${data.instagram.approval_token}` : '/instagram'} className="text-sea hover:text-sea-dark">
                      Öppna posten
                    </Link>
                    <span className="text-line">·</span>
                    <Link href="/instagram" className="text-sea hover:text-sea-dark">
                      Alla poster
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-ink">Ingen post i dag ännu</span>
                  <span className="text-[13px] text-ink-soft">Förslaget skapas på morgonen och skickas som ntfy-notis.</span>
                  <Link href="/instagram" className="mt-1 text-[13px] font-medium text-sea hover:text-sea-dark">
                    Öppna Instagram
                  </Link>
                </>
              )}
            </div>
          </CardBody>
          <div className="flex flex-col gap-2 border-t border-line px-5 py-3.5">
            <SectionLabel>Hero på startsidan</SectionLabel>
            <div className="flex items-center justify-between gap-3">
              {loading || !data ? (
                <Skeleton className="h-3.5 w-56" />
              ) : (
                <span className="truncate text-[13px] text-ink">
                  {data.hero.main ? `Huvud: ${data.hero.main}` : 'Inget huvudevent valt'} · {data.hero.secondary} sekundära
                </span>
              )}
              <Link href="/admin/hero-featured" className="shrink-0 text-[13px] font-medium text-sea hover:text-sea-dark">
                Ändra
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader
            title="Publicerat de kommande 7 dagarna"
            actions={
              <Link href="/events?view=kommande" className="text-[13px] font-medium text-sea hover:text-sea-dark">
                Öppna i listan
              </Link>
            }
          />
          <CardBody className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {loading || !data
              ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-[10px]" />)
              : data.days.map((d) => (
                  <Link
                    key={d.date}
                    href={`/events?view=kommande&dateFrom=${d.date}&dateTo=${d.date}`}
                    className={cn('flex flex-col gap-1.5 rounded-[10px] border border-line p-3 transition-colors hover:border-sea/40', d.isToday ? 'bg-sea-lightest' : 'bg-white')}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{d.label}</span>
                    <span className="font-display text-[22px] font-semibold leading-none text-ink">{d.count}</span>
                    <span className={cn('text-[11px]', d.noImage > 0 ? 'text-poppy' : 'text-ink-muted')}>{d.isToday ? 'i dag' : d.noImage > 0 ? `${d.noImage} utan bild` : ''}</span>
                  </Link>
                ))}
          </CardBody>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Datakvalitet · kommande event" />
          {loading || !data ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex h-11 items-center border-b border-line-soft px-5 last:border-b-0">
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            ))
          ) : (
            <QualityRows quality={data.quality} />
          )}
        </Card>
      </div>
    </div>
  )
}

function QualityRows({ quality }: { quality: DashboardData['quality'] }) {
  const rows: { label: string; value: number; href: string; tone: StatusTone }[] = [
    { label: 'Saknar bild', value: quality.noImage, href: '/events?view=utanbild', tone: 'bad' },
    { label: 'Okategoriserade', value: quality.uncategorized, href: '/events?view=okategoriserade', tone: 'wait' },
    { label: 'Utan arrangör', value: quality.noOrganizer, href: '/events?view=kommande&org=none', tone: 'wait' },
    { label: 'Kvalitetspoäng under 50', value: quality.lowScore, href: '/events?view=atgard', tone: 'bad' },
  ]
  return (
    <div className="flex flex-col">
      {rows.map((r) => (
        <Link key={r.label} href={r.href} className="flex items-center justify-between border-b border-line-soft px-5 py-3 text-[13px] text-ink transition-colors last:border-b-0 hover:bg-sand-soft">
          <span>{r.label}</span>
          <span className={cn('font-mono font-medium', r.value === 0 ? 'text-kelp' : r.tone === 'bad' ? 'text-poppy' : 'text-amber')}>{formatNumber(r.value)}</span>
        </Link>
      ))}
    </div>
  )
}
