'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Phone, Globe, MapPin, Pencil, Plus, ExternalLink, Sparkles, Trash2, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { Organizer, Event, OrganizerPage } from '@/types/database'
import { formatDay, formatDateTime, formatRelative } from '@/lib/format'
import { getFrontendUrl } from '@/lib/utils'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge, CategoryChip, QualityDot } from '@/components/ui/status-badge'
import { DataTable, Thumb, type Column } from '@/components/ui/data-table'
import { Segmented } from '@/components/ui/tabs'
import { Pagination } from '@/components/ui/pagination'
import { LoadingState, EmptyState, Banner } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { OrganizerAvatar } from '@/components/organizers/OrganizerAvatar'

const PAGE_SIZE = 25

export default function OrganizerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const id = parseInt(params.id as string)

  const [organizer, setOrganizer] = useState<Organizer | null>(null)
  const [page, setPage] = useState<OrganizerPage | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingPage, setCreatingPage] = useState(false)
  const [scope, setScope] = useState<'upcoming' | 'all'>('upcoming')
  const [pageNo, setPageNo] = useState(1)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [orgRes, pageRes, evs] = await Promise.all([
      supabase.from('organizers').select('*').eq('id', id).single(),
      supabase.from('organizer_pages').select('*').eq('organizer_id', id).maybeSingle(),
      fetchAllRows<Event>((from, to) => supabase.from('events').select('*').eq('organizer_id', id).order('date_time', { ascending: false }).order('id', { ascending: false }).range(from, to)).catch(() => [] as Event[]),
    ])
    setOrganizer(orgRes.data ?? null)
    setPage(pageRes.data ?? null)
    setEvents(evs)
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const createOrganizerPage = async () => {
    if (!organizer) return
    if (!organizer.website) {
      toast.error('Webbsida saknas', 'Lägg till arrangörens webbsida först, den används för att hämta innehåll.')
      router.push(`/organizers/${organizer.id}/edit`)
      return
    }
    const ok = await confirm({
      title: `Skapa arrangörssida för ${organizer.name}?`,
      description: `Webbplatsen ${organizer.website} hämtas, innehåll skrivs med AI och bilder klassificeras. Tar 10–30 sekunder. Sidan sparas som utkast.`,
      confirmLabel: 'Skapa sida',
    })
    if (!ok) return

    setCreatingPage(true)
    try {
      const response = await fetch(`/api/organizers/${organizer.id}/create-page`, { method: 'POST' })
      const result = await response.json()
      if (!response.ok) {
        if (response.status === 409 && result.pageId) {
          router.push(`/organizer-pages/${result.pageId}/edit`)
          return
        }
        const titles: Record<string, string> = { rate_limit: 'Rate limit nådd', auth_error: 'Autentiseringsfel', scrape_error: 'Hämtningen misslyckades' }
        toast.error(titles[result.type] ?? result.error ?? 'Kunde inte skapa sidan', result.details || undefined)
        return
      }
      if (result.page) {
        toast.success('Arrangörssida skapad som utkast', `${result.metadata?.imagesFound ?? 0} bilder hittades, ${result.metadata?.galleryImagesCount ?? 0} i galleriet`)
        router.push(`/organizer-pages/${result.page.id}/edit`)
      }
    } catch (error) {
      toast.error('Oväntat fel vid skapande av arrangörssida', error instanceof Error ? error.message : 'Okänt fel')
    } finally {
      setCreatingPage(false)
    }
  }

  const deleteOrganizer = async () => {
    if (!organizer) return
    if (events.length > 0) {
      toast.error('Kan inte ta bort arrangör med event', 'Flytta eller ta bort eventen först, eller slå ihop arrangören med en annan.')
      return
    }
    const ok = await confirm({ title: `Ta bort ”${organizer.name}”?`, description: 'Går inte att ångra.', confirmLabel: 'Ta bort', destructive: true })
    if (!ok) return
    const { error } = await supabase.from('organizers').delete().eq('id', organizer.id)
    if (error) return toast.error('Kunde inte ta bort', error.message)
    toast.success('Arrangören togs bort')
    router.push('/organizers')
  }

  const now = Date.now()
  const visible = useMemo(() => {
    const list = scope === 'upcoming' ? events.filter((e) => new Date(e.date_time).getTime() >= now).sort((a, b) => a.date_time.localeCompare(b.date_time)) : events
    return list
  }, [events, scope, now])
  const upcomingCount = events.filter((e) => new Date(e.date_time).getTime() >= now).length
  const paged = visible.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE)

  if (loading) return <LoadingState />
  if (!organizer) {
    return (
      <EmptyState
        title="Arrangören hittades inte"
        description="Den har tagits bort eller så är länken fel."
        action={
          <Button asChild variant="secondary">
            <Link href="/organizers">Till arrangörer</Link>
          </Button>
        }
      />
    )
  }

  const columns: Column<Event>[] = [
    {
      key: 'name',
      header: 'Event',
      width: 'minmax(220px,1fr)',
      cell: (e) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Thumb src={e.image_url} />
          <div className="flex min-w-0 flex-col">
            <Link href={`/events/${e.id}/edit`} className="truncate text-[13px] font-medium text-ink hover:text-sea">
              {e.name}
            </Link>
            <span className="truncate text-[11px] text-ink-muted">{e.venue_name || e.location}</span>
          </div>
        </div>
      ),
    },
    { key: 'date', header: 'Datum', width: '150px', cell: (e) => <span className="font-mono text-xs text-ink">{formatDateTime(e.date_time)}</span> },
    {
      key: 'cat',
      header: 'Kategori',
      width: '150px',
      cell: (e) => {
        const cats = e.categories?.length ? e.categories : e.category ? [e.category] : []
        return cats.length ? (
          <span className="flex items-center gap-1.5">
            <CategoryChip>{cats[0]}</CategoryChip>
            {cats.length > 1 ? <span className="text-[11px] text-ink-muted">+{cats.length - 1}</span> : null}
          </span>
        ) : (
          <CategoryChip muted>Okategoriserad</CategoryChip>
        )
      },
    },
    { key: 'status', header: 'Status', width: '110px', cell: (e) => <StatusBadge domain="event" value={e.status} /> },
    { key: 'q', header: 'Kvalitet', width: '80px', cell: (e) => <QualityDot score={e.quality_score} /> },
  ]

  const contact = [
    { icon: Mail, value: organizer.email, href: organizer.email ? `mailto:${organizer.email}` : undefined },
    { icon: Phone, value: organizer.phone, href: organizer.phone ? `tel:${organizer.phone}` : undefined },
    { icon: Globe, value: organizer.website, href: organizer.website, external: true },
    { icon: MapPin, value: [organizer.venue_name, organizer.location].filter(Boolean).join(' · ') },
  ].filter((c) => c.value)

  return (
    <>
      <Card>
        <CardBody className="flex flex-col gap-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <OrganizerAvatar name={organizer.name} warn={organizer.status === 'pending'} size={56} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">{organizer.name}</h1>
                  <StatusBadge domain="organizer" value={organizer.status} />
                </div>
                <span className="text-[13px] text-ink-muted">
                  {organizer.created_from_scraper ? `Auto-skapad av ${organizer.scraper_source ?? 'scraper'} ${formatDay(organizer.created_at)}` : `Skapad ${formatDay(organizer.created_at)}`}
                  {' · '}
                  {organizer.enriched_at ? `berikad ${formatRelative(organizer.enriched_at)}` : 'aldrig berikad'}
                </span>
                {organizer.alternative_names?.length ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Alias</span>
                    {organizer.alternative_names.map((a) => (
                      <span key={a} className="rounded-full bg-stone px-2 py-0.5 text-xs text-ink">
                        {a}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary">
                <Link href={`/events/new?organizer_id=${organizer.id}`}>
                  <Plus strokeWidth={2.5} /> Nytt event
                </Link>
              </Button>
              {page ? (
                <Button asChild variant="secondary">
                  <Link href={`/organizer-pages/${page.id}/edit`}>
                    <FileText /> Arrangörssida
                  </Link>
                </Button>
              ) : (
                <Button variant="secondary" onClick={createOrganizerPage} loading={creatingPage}>
                  <Sparkles className="text-sea" /> Skapa arrangörssida
                </Button>
              )}
              <Button asChild>
                <Link href={`/organizers/${organizer.id}/edit`}>
                  <Pencil /> Redigera
                </Link>
              </Button>
            </div>
          </div>

          {organizer.enrichment_note ? <Banner tone="info" title="AI-notering från berikningen">{organizer.enrichment_note}</Banner> : null}

          <div className="grid gap-x-8 gap-y-2 border-t border-line pt-4 sm:grid-cols-2">
            {contact.length === 0 ? <span className="text-[13px] text-ink-muted">Inga kontaktuppgifter.</span> : null}
            {contact.map((c, i) => {
              const Icon = c.icon
              return (
                <span key={i} className="flex min-w-0 items-center gap-2.5 text-[13px] text-ink">
                  <Icon className="size-4 shrink-0 text-ink-muted" />
                  {c.href ? (
                    <a href={c.href} target={c.external ? '_blank' : undefined} rel={c.external ? 'noopener noreferrer' : undefined} className="truncate text-sea hover:text-sea-dark">
                      {c.value}
                    </a>
                  ) : (
                    <span className="truncate">{c.value}</span>
                  )}
                </span>
              )
            })}
          </div>

          {page ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-sand-soft px-4 py-3">
              <div className="flex items-center gap-3">
                <StatusBadge domain="page" value={page.is_published} />
                <span className="text-[13px] text-ink">{page.title || page.name}</span>
                <span className="font-mono text-xs text-ink-muted">/arrangor/{page.slug}</span>
              </div>
              <div className="flex items-center gap-3 text-[13px] font-medium">
                <Link href={`/organizer-pages/${page.id}/edit`} className="text-sea">
                  Redigera sida
                </Link>
                {page.is_published ? (
                  <a href={`${getFrontendUrl()}/arrangor/${page.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sea">
                    Visa på ivarberg.nu <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Event"
          actions={
            <Segmented
              size="sm"
              value={scope}
              onChange={(v) => {
                setScope(v as 'upcoming' | 'all')
                setPageNo(1)
              }}
              items={[
                { value: 'upcoming', label: 'Kommande', count: upcomingCount },
                { value: 'all', label: 'Alla', count: events.length },
              ]}
            />
          }
        />
        <DataTable
          className="rounded-none border-0"
          columns={columns}
          rows={paged}
          rowKey={(e) => e.id}
          emptyState={<EmptyState title={scope === 'upcoming' ? 'Inga kommande event' : 'Inga event'} description="Event kopplas hit via scrapers eller när du väljer arrangören i eventformuläret." />}
          footer={visible.length > PAGE_SIZE ? <Pagination page={pageNo} pageSize={PAGE_SIZE} total={visible.length} onPageChange={setPageNo} itemLabel="event" /> : undefined}
        />
      </Card>

      <div className="flex justify-end">
        <Button variant="ghost" className="text-poppy hover:bg-poppy-light hover:text-poppy" onClick={deleteOrganizer}>
          <Trash2 /> Ta bort arrangör
        </Button>
      </div>
    </>
  )
}
