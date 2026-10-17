'use client'

import * as React from 'react'
import Link from 'next/link'
import { Suspense } from 'react'
import { ChevronDown, Columns3, Download, Plus, Star, Calendar, MoreHorizontal, Search, X, ExternalLink, Pencil, Link2, Trash2, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getFrontendUrl, cn } from '@/lib/utils'
import { formatDay, formatTime, toLocalDateInput } from '@/lib/format'
import { getStatus, statusOptions, toneClasses } from '@/lib/status'
import { CATEGORIES, AREAS, SCRAPER_SOURCES } from '@/lib/constants'
import { useUrlState } from '@/hooks/use-url-state'
import { useLocalStorage } from '@/hooks/use-local-storage'
import type { Event, EventCategory, EventStatus } from '@/types/database'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/tabs'
import { FilterBar, FilterChip, SelectFilter, MultiFilter } from '@/components/ui/filter-chip'
import { SearchInput } from '@/components/ui/search-input'
import { DataTable, TitleCell, Thumb, type Column, type SortState } from '@/components/ui/data-table'
import { CategoryChip, QualityDot } from '@/components/ui/status-badge'
import { Pagination } from '@/components/ui/pagination'
import { BulkBar, BulkButton } from '@/components/ui/bulk-bar'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { CategoryPicker } from '@/components/ui/category-picker'
import { Input, Field } from '@/components/ui/input'
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

// ---------------------------------------------------------------------------
// Typer och konstanter
// ---------------------------------------------------------------------------

type View = 'kommande' | 'alla' | 'atgard' | 'utanbild' | 'okategoriserade' | 'passerade'

const VIEWS: { value: View; label: string }[] = [
  { value: 'kommande', label: 'Kommande' },
  { value: 'alla', label: 'Alla' },
  { value: 'atgard', label: 'Behöver åtgärd' },
  { value: 'utanbild', label: 'Utan bild' },
  { value: 'okategoriserade', label: 'Okategoriserade' },
  { value: 'passerade', label: 'Passerade' },
]

const URL_DEFAULTS = {
  view: 'kommande',
  q: '',
  status: '',
  cats: '',
  org: '',
  area: '',
  dateFrom: '',
  dateTo: '',
  addedFrom: '',
  addedTo: '',
  featured: '',
  source: '',
  sort: '',
  dir: '',
  page: '',
  pageSize: '',
}

type ColumnKey = 'event' | 'date' | 'category' | 'status' | 'organizer' | 'quality' | 'source' | 'created' | 'actions'

const COLUMN_LABELS: Record<ColumnKey, string> = {
  event: 'Event',
  date: 'Datum',
  category: 'Kategori',
  status: 'Status',
  organizer: 'Arrangör',
  quality: 'Kvalitet',
  source: 'Källa',
  created: 'Tillagt',
  actions: 'Åtgärder',
}

const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  event: true,
  date: true,
  category: true,
  status: true,
  organizer: true,
  quality: true,
  source: true,
  created: false,
  actions: true,
}

const SORTABLE: Record<string, string> = {
  date: 'date_time',
  quality: 'quality_score',
  created: 'created_at',
  event: 'name',
}

interface OrganizerLite {
  id: number
  name: string
  status: string
  scraper_source: string | null
}

type EventRow = Event & { organizer?: { id: number; name: string; scraper_source: string | null } | null }

// ---------------------------------------------------------------------------
// Hjälpare
// ---------------------------------------------------------------------------

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number) {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function endOfDayIso(dateStr: string) {
  const d = new Date(dateStr)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

function startOfDayIso(dateStr: string) {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function sourceOf(row: EventRow): string {
  return row.organizer?.scraper_source ?? 'Manuell'
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ---------------------------------------------------------------------------
// Arrangörsväljare (lokal, sökbar)
// ---------------------------------------------------------------------------

function OrganizerPicker({
  organizers,
  value,
  onChange,
  placeholder = 'Välj arrangör…',
  autoFocus,
}: {
  organizers: OrganizerLite[]
  value: number | null
  onChange: (id: number | null) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [q, setQ] = React.useState('')
  const list = React.useMemo(() => {
    const term = q.trim().toLowerCase()
    return organizers.filter((o) => !term || o.name.toLowerCase().includes(term)).slice(0, 80)
  }, [organizers, q])
  const selected = organizers.find((o) => o.id === value)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-9 items-center gap-2 rounded-[8px] border border-line bg-white px-3 focus-within:border-sea focus-within:ring-2 focus-within:ring-sea/20">
        <Search className="size-[15px] text-ink-muted" />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={selected ? selected.name : placeholder}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
        />
        {selected ? (
          <button type="button" aria-label="Rensa arrangör" onClick={() => onChange(null)} className="text-ink-faint hover:text-ink">
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="thin-scroll max-h-56 overflow-y-auto rounded-[8px] border border-line">
        {list.length === 0 ? (
          <div className="px-3 py-3 text-center text-[13px] text-ink-muted">Ingen arrangör matchar</div>
        ) : (
          list.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-sand-soft',
                o.id === value ? 'bg-sea-lightest font-medium text-ink' : 'text-ink'
              )}
            >
              <span className="flex-1 truncate">{o.name}</span>
              {o.status === 'pending' ? <span className="text-[11px] text-amber">väntar</span> : null}
              {o.id === value ? <Check className="size-3.5 text-sea" /> : null}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidan
// ---------------------------------------------------------------------------

function EventsPageInner() {
  const toast = useToast()
  const confirm = useConfirm()
  const { state, set, reset } = useUrlState(URL_DEFAULTS)

  const [storedPageSize, setStoredPageSize] = useLocalStorage<number>('events.pageSize', 50)
  const [columns, setColumns] = useLocalStorage<Record<ColumnKey, boolean>>('events.columns', DEFAULT_COLUMNS)

  const view = (VIEWS.some((v) => v.value === state.view) ? state.view : 'kommande') as View
  const page = Math.max(1, parseInt(state.page || '1', 10) || 1)
  const pageSize = parseInt(state.pageSize || '', 10) || storedPageSize
  const cats = state.cats ? state.cats.split(',').filter(Boolean) : []
  const sortKey = state.sort || 'date'
  const sortDir: 'asc' | 'desc' = state.dir === 'asc' || state.dir === 'desc' ? state.dir : view === 'kommande' ? 'asc' : 'desc'

  const [rows, setRows] = React.useState<EventRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [counts, setCounts] = React.useState<Partial<Record<View, number>>>({})
  const [organizers, setOrganizers] = React.useState<OrganizerLite[]>([])
  const [selected, setSelected] = React.useState<Set<string | number>>(new Set())
  const [refreshKey, setRefreshKey] = React.useState(0)

  // Dialoger
  const [rangeOpen, setRangeOpen] = React.useState(false)
  const [rangeDraft, setRangeDraft] = React.useState({ from: '', to: '' })
  const [addedOpen, setAddedOpen] = React.useState(false)
  const [addedDraft, setAddedDraft] = React.useState({ from: '', to: '' })
  const [bulkCatsOpen, setBulkCatsOpen] = React.useState(false)
  const [bulkCats, setBulkCats] = React.useState<EventCategory[]>([])
  const [bulkOrgOpen, setBulkOrgOpen] = React.useState(false)
  const [bulkOrg, setBulkOrg] = React.useState<number | null>(null)
  const [orgFilterOpen, setOrgFilterOpen] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)

  const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), [])

  // Arrangörer (för filter, källa och bulk)
  React.useEffect(() => {
    let alive = true
    supabase
      .from('organizers')
      .select('id, name, status, scraper_source')
      .order('name')
      .then(({ data }) => {
        if (alive && data) setOrganizers(data as OrganizerLite[])
      })
    return () => {
      alive = false
    }
  }, [])

  // Organizer-id:n per källa
  const sourceOrganizerIds = React.useCallback(
    (source: string): number[] => {
      if (source === 'Manuell') return organizers.filter((o) => !o.scraper_source).map((o) => o.id)
      return organizers.filter((o) => o.scraper_source === source).map((o) => o.id)
    },
    [organizers]
  )

  // Vy-filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyView = React.useCallback((q: any, v: View) => {
    const nowIso = new Date().toISOString()
    switch (v) {
      case 'kommande':
        return q.eq('status', 'published').gte('date_time', nowIso)
      case 'alla':
        return q
      case 'atgard':
        return q.or('status.in.(draft,pending_approval),quality_score.lt.50')
      case 'utanbild':
        return q.is('image_url', null).gte('date_time', nowIso)
      case 'okategoriserade':
        return q.or('categories.cs.{Okategoriserad},categories.is.null').gte('date_time', nowIso)
      case 'passerade':
        return q.lt('date_time', nowIso)
    }
  }, [])

  // Flik-räknare
  React.useEffect(() => {
    let alive = true
    const load = async () => {
      const results = await Promise.all(
        VIEWS.map((v) => applyView(supabase.from('events').select('id', { count: 'exact', head: true }), v.value))
      )
      if (!alive) return
      const next: Partial<Record<View, number>> = {}
      results.forEach((r, i) => {
        next[VIEWS[i].value] = r.count ?? 0
      })
      setCounts(next)
    }
    load()
    return () => {
      alive = false
    }
  }, [applyView, refreshKey])

  // Huvudfråga
  React.useEffect(() => {
    // Vänta på arrangörer om källfilter är satt
    if (state.source && organizers.length === 0) return
    let alive = true
    setLoading(true)
    setError(null)

    const run = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase.from('events').select('*, organizer:organizers(id,name,scraper_source)', { count: 'exact' })
      q = applyView(q, view)

      if (state.q.trim()) {
        const like = `%${state.q.trim().replace(/[%_,()]/g, ' ')}%`
        q = q.or(`name.ilike.${like},venue_name.ilike.${like},location.ilike.${like}`)
      }
      if (state.status) q = q.eq('status', state.status)
      if (cats.length) q = q.overlaps('categories', cats)
      if (state.org === 'none') q = q.is('organizer_id', null)
      else if (state.org) q = q.eq('organizer_id', Number(state.org))
      if (state.area) q = q.eq('area', state.area)
      if (state.dateFrom) q = q.gte('date_time', startOfDayIso(state.dateFrom))
      if (state.dateTo) q = q.lte('date_time', endOfDayIso(state.dateTo))
      if (state.addedFrom) q = q.gte('created_at', startOfDayIso(state.addedFrom))
      if (state.addedTo) q = q.lte('created_at', endOfDayIso(state.addedTo))
      if (state.featured === 'yes') q = q.eq('featured', true)
      if (state.featured === 'no') q = q.eq('featured', false)
      if (state.source) {
        const ids = sourceOrganizerIds(state.source)
        if (state.source === 'Manuell') {
          q = q.or(`organizer_id.is.null${ids.length ? `,organizer_id.in.(${ids.join(',')})` : ''}`)
        } else if (ids.length) {
          q = q.in('organizer_id', ids)
        } else {
          q = q.eq('organizer_id', -1)
        }
      }

      const orderCol = SORTABLE[sortKey] ?? 'date_time'
      q = q.order(orderCol, { ascending: sortDir === 'asc', nullsFirst: false }).order('id', { ascending: sortDir === 'asc' })

      const from = (page - 1) * pageSize
      q = q.range(from, from + pageSize - 1)

      const { data, count, error } = await q
      if (!alive) return
      if (error) {
        setError(error.message)
        setRows([])
      } else {
        setRows((data ?? []) as EventRow[])
        setTotal(count ?? 0)
      }
      setLoading(false)
    }
    run()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    view,
    state.q,
    state.status,
    state.cats,
    state.org,
    state.area,
    state.dateFrom,
    state.dateTo,
    state.addedFrom,
    state.addedTo,
    state.featured,
    state.source,
    sortKey,
    sortDir,
    page,
    pageSize,
    organizers.length,
    refreshKey,
  ])

  // Rensa markering när sidan/filter byts
  React.useEffect(() => setSelected(new Set()), [view, page, state.q, state.status, state.cats, state.org, state.source])

  // ---- Mutationer ---------------------------------------------------------

  const patchLocal = (ids: (string | number)[], patch: Partial<EventRow>) => {
    const set = new Set(ids)
    setRows((prev) => prev.map((r) => (set.has(r.id) ? { ...r, ...patch } : r)))
  }

  const updateStatus = async (id: number, status: EventStatus) => {
    const { error } = await supabase.from('events').update({ status }).eq('id', id)
    if (error) return toast.error('Kunde inte ändra status', error.message)
    patchLocal([id], { status })
    toast.success(`Status ändrad till ${getStatus('event', status).label}`)
    refresh()
  }

  const toggleFeatured = async (row: EventRow) => {
    const { error } = await supabase.from('events').update({ featured: !row.featured }).eq('id', row.id)
    if (error) return toast.error('Kunde inte uppdatera featured', error.message)
    patchLocal([row.id], { featured: !row.featured })
    toast.success(row.featured ? 'Borttagen från featured' : 'Markerad som featured')
  }

  const deleteOne = async (row: EventRow) => {
    const ok = await confirm({ title: 'Ta bort event?', description: `”${row.name}” tas bort permanent.`, confirmLabel: 'Ta bort', destructive: true })
    if (!ok) return
    const { error } = await supabase.from('events').delete().eq('id', row.id)
    if (error) return toast.error('Kunde inte ta bort', error.message)
    toast.success('Event borttaget')
    refresh()
  }

  const copyLink = async (row: EventRow) => {
    try {
      await navigator.clipboard.writeText(`${getFrontendUrl()}/event/${row.event_id}`)
      toast.success('Länk kopierad')
    } catch {
      toast.error('Kunde inte kopiera länken')
    }
  }

  const selectedIds = Array.from(selected) as number[]

  const bulkUpdate = async (patch: Record<string, unknown>, doneMsg: string) => {
    if (!selectedIds.length) return
    setBulkBusy(true)
    const { error } = await supabase.from('events').update(patch).in('id', selectedIds)
    setBulkBusy(false)
    if (error) return toast.error('Uppdateringen misslyckades', error.message)
    toast.success(doneMsg)
    setSelected(new Set())
    refresh()
  }

  const bulkDelete = async () => {
    const n = selectedIds.length
    if (!n) return
    const ok = await confirm({
      title: `Ta bort ${n} event?`,
      description: 'Detta går inte att ångra.',
      confirmLabel: 'Ta bort',
      destructive: true,
      typeToConfirm: n > 10 ? 'ta bort' : undefined,
    })
    if (!ok) return
    setBulkBusy(true)
    const { error } = await supabase.from('events').delete().in('id', selectedIds)
    setBulkBusy(false)
    if (error) return toast.error('Kunde inte ta bort', error.message)
    toast.success(`${n} event borttagna`)
    setSelected(new Set())
    refresh()
  }

  const exportCsv = () => {
    const header = ['Namn', 'Datum', 'Tid', 'Plats', 'Adress', 'Kategorier', 'Status', 'Arrangör', 'Kvalitet', 'Källa', 'Pris', 'Publik länk']
    const lines = rows.map((r) =>
      [
        r.name,
        toLocalDateInput(r.date_time),
        formatTime(r.date_time),
        r.venue_name ?? '',
        r.location,
        (r.categories ?? []).join(', '),
        getStatus('event', r.status).label,
        r.organizer?.name ?? '',
        r.quality_score ?? '',
        sourceOf(r),
        r.price ?? '',
        `${getFrontendUrl()}/event/${r.event_id}`,
      ]
        .map(csvEscape)
        .join(';')
    )
    const blob = new Blob(['﻿' + [header.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `events-${view}-sida-${page}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${rows.length} rader exporterade`)
  }

  // ---- Filter-hjälpare ----------------------------------------------------

  const setRange = (from: Date | null, to: Date | null) => {
    set({ dateFrom: from ? toLocalDateInput(from) : '', dateTo: to ? toLocalDateInput(to) : '' })
  }

  const today = startOfDay(new Date())
  const dateLabel = state.dateFrom || state.dateTo ? `Datum: ${state.dateFrom ? formatDay(state.dateFrom) : '…'} – ${state.dateTo ? formatDay(state.dateTo) : '…'}` : 'Datum'
  const addedLabel = state.addedFrom || state.addedTo ? `Tillagt: ${state.addedFrom ? formatDay(state.addedFrom) : '…'} – ${state.addedTo ? formatDay(state.addedTo) : '…'}` : null
  const featuredLabel = state.featured === 'yes' ? 'Endast featured' : state.featured === 'no' ? 'Ej featured' : null
  const moreActive = !!(featuredLabel || addedLabel)

  const hasActiveFilters = !!(
    state.q ||
    state.status ||
    cats.length ||
    state.org ||
    state.area ||
    state.dateFrom ||
    state.dateTo ||
    state.addedFrom ||
    state.addedTo ||
    state.featured ||
    state.source
  )

  const selectedOrgName = state.org === 'none' ? 'Utan arrangör' : state.org ? organizers.find((o) => o.id === Number(state.org))?.name : undefined

  // ---- Kolumner -----------------------------------------------------------

  const sort: SortState = { key: sortKey, dir: sortDir }

  const allColumns: Column<EventRow>[] = [
    {
      key: 'event',
      header: 'Event',
      width: 'minmax(220px, 1fr)',
      sortable: true,
      cell: (r) => (
        <TitleCell
          thumb={<Thumb src={r.image_url} alt="" />}
          title={
            <span className="inline-flex items-center gap-1.5">
              {r.featured ? <Star className="size-3 shrink-0 fill-amber text-amber" aria-label="Featured" /> : null}
              <Link href={`/events/${r.id}/edit`} className="truncate hover:text-sea">
                {r.name}
              </Link>
            </span>
          }
          subtitle={r.venue_name || r.location}
        />
      ),
    },
    {
      key: 'date',
      header: 'Datum',
      width: '120px',
      sortable: true,
      cell: (r) => (
        <div className="flex flex-col font-mono text-xs leading-tight">
          <span className="text-ink">{formatDay(r.date_time)}</span>
          <span className="text-ink-muted">{formatTime(r.date_time)}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Kategori',
      width: '150px',
      cell: (r) => {
        const list = r.categories?.length ? r.categories : r.category ? [r.category] : []
        if (!list.length) return <CategoryChip muted>Okategoriserad</CategoryChip>
        return (
          <span className="inline-flex items-center gap-1.5">
            <CategoryChip muted={list[0] === 'Okategoriserad'}>{list[0]}</CategoryChip>
            {list.length > 1 ? <span className="text-[11px] text-ink-muted">+{list.length - 1}</span> : null}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: '130px',
      cell: (r) => {
        const meta = getStatus('event', r.status)
        const t = toneClasses[meta.tone]
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Status: ${meta.label}. Ändra`}
                className={cn('inline-flex items-center gap-1.5 rounded-full py-[3px] pl-2.5 pr-2 text-xs font-medium', t.chip)}
              >
                <span className={cn('size-1.5 rounded-full', t.dot)} />
                {meta.label}
                <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Ändra status</DropdownMenuLabel>
              {statusOptions('event').map((o) => (
                <DropdownMenuItem key={o.value} disabled={o.value === r.status} onSelect={() => updateStatus(r.id, o.value as EventStatus)}>
                  <span className={cn('size-1.5 rounded-full', toneClasses[getStatus('event', o.value).tone].dot)} />
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
    {
      key: 'organizer',
      header: 'Arrangör',
      width: '150px',
      cell: (r) =>
        r.organizer ? (
          <Link href={`/organizers/${r.organizer.id}`} className="block truncate text-ink-soft hover:text-sea">
            {r.organizer.name}
          </Link>
        ) : (
          <span className="text-ink-faint">–</span>
        ),
    },
    {
      key: 'quality',
      header: 'Kvalitet',
      width: '80px',
      sortable: true,
      cell: (r) => <QualityDot score={r.quality_score} />,
    },
    {
      key: 'source',
      header: 'Källa',
      width: '110px',
      cell: (r) => <span className="block truncate text-xs text-ink-muted">{sourceOf(r)}</span>,
    },
    {
      key: 'created',
      header: 'Tillagt',
      width: '110px',
      sortable: true,
      cell: (r) => <span className="font-mono text-xs text-ink-muted">{formatDay(r.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '44px',
      align: 'right',
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Fler åtgärder"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-stone hover:text-ink"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/events/${r.id}/edit`}>
                <Pencil /> Redigera
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`${getFrontendUrl()}/event/${r.event_id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Visa på ivarberg.nu
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toggleFeatured(r)}>
              <Star /> {r.featured ? 'Ta bort featured' : 'Markera som featured'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyLink(r)}>
              <Link2 /> Kopiera länk
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => deleteOne(r)}>
              <Trash2 /> Ta bort
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const visibleColumns = allColumns.filter((c) => columns[c.key as ColumnKey] !== false)

  // ---- Render -------------------------------------------------------------

  return (
    <>
      <PageHeader
        title="Events"
        meta="Filter och sortering sparas i URL:en"
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  <Columns3 /> Kolumner
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Synliga kolumner</DropdownMenuLabel>
                {(Object.keys(COLUMN_LABELS) as ColumnKey[])
                  .filter((k) => k !== 'event' && k !== 'actions')
                  .map((k) => (
                    <DropdownMenuCheckboxItem
                      key={k}
                      checked={columns[k] !== false}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(c) => setColumns((prev) => ({ ...prev, [k]: !!c }))}
                    >
                      {COLUMN_LABELS[k]}
                    </DropdownMenuCheckboxItem>
                  ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setColumns(DEFAULT_COLUMNS)}>Återställ</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
              <Download /> Exportera
            </Button>
            <Button asChild>
              <Link href="/events/new">
                <Plus strokeWidth={2.5} /> Nytt event
              </Link>
            </Button>
          </>
        }
      />

      <Tabs
        items={VIEWS.map((v) => ({ value: v.value, label: v.label, count: counts[v.value] ?? null }))}
        value={view}
        onChange={(v) => set({ view: v, dir: '' })}
      />

      <FilterBar onReset={reset} hasActive={hasActiveFilters}>
        <SearchInput value={state.q} onChange={(q) => set({ q })} placeholder="Sök namn, plats, adress…" className="w-[300px]" />

        {/* Datum */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <FilterChip label={dateLabel} active={!!(state.dateFrom || state.dateTo)} onClear={state.dateFrom || state.dateTo ? () => setRange(null, null) : undefined} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setRange(today, today)}>I dag</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const dow = (today.getDay() + 6) % 7 // måndag = 0
                setRange(addDays(today, -dow), addDays(today, 6 - dow))
              }}
            >
              Denna vecka
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRange(today, addDays(today, 7))}>Nästa 7 dagar</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRange(today, addDays(today, 30))}>Nästa 30 dagar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setRangeDraft({ from: state.dateFrom, to: state.dateTo })
                setRangeOpen(true)
              }}
            >
              Eget intervall…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <SelectFilter label="Status" value={state.status} options={statusOptions('event')} onChange={(status) => set({ status })} allLabel="Alla statusar" />

        <MultiFilter label="Kategori" value={cats} options={CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={(v) => set({ cats: v.join(',') })} />

        <FilterChip
          label={selectedOrgName ? `Arrangör: ${selectedOrgName}` : 'Arrangör'}
          active={!!state.org}
          onClear={state.org ? () => set({ org: '' }) : undefined}
          onClick={() => setOrgFilterOpen(true)}
        />

        <SelectFilter label="Område" value={state.area} options={AREAS.map((a) => ({ value: a, label: a }))} onChange={(area) => set({ area })} allLabel="Alla områden" />

        <SelectFilter
          label="Källa"
          value={state.source}
          options={[...SCRAPER_SOURCES.map((s) => ({ value: s, label: s })), { value: 'Manuell', label: 'Manuell' }]}
          onChange={(source) => set({ source })}
          allLabel="Alla källor"
        />

        {/* Fler */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <FilterChip
              label={moreActive ? [featuredLabel, addedLabel].filter(Boolean).join(' · ') : 'Fler'}
              active={moreActive}
              onClear={moreActive ? () => set({ featured: '', addedFrom: '', addedTo: '' }) : undefined}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Featured</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={state.featured === 'yes'} onCheckedChange={(c) => set({ featured: c ? 'yes' : '' })}>
              Endast featured
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={state.featured === 'no'} onCheckedChange={(c) => set({ featured: c ? 'no' : '' })}>
              Ej featured
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Tillagt</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => set({ addedFrom: toLocalDateInput(today), addedTo: toLocalDateInput(today) })}>Tillagt i dag</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => set({ addedFrom: toLocalDateInput(addDays(today, -7)), addedTo: '' })}>Senaste 7 dagarna</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setAddedDraft({ from: state.addedFrom, to: state.addedTo })
                setAddedOpen(true)
              }}
            >
              Eget intervall…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </FilterBar>

      {error ? (
        <ErrorState title="Kunde inte hämta events" description={error} onRetry={refresh} />
      ) : (
        <DataTable<EventRow>
          columns={visibleColumns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          sort={sort}
          onSortChange={(s) => set({ sort: s.key, dir: s.dir }, { resetPage: true })}
          emptyState={
            <EmptyState
              icon={<Calendar />}
              title={hasActiveFilters ? 'Inga event matchar filtren' : 'Inga event här'}
              description={hasActiveFilters ? 'Prova att rensa ett eller flera filter.' : 'Skapa ett nytt event eller kör scrapers.'}
              action={
                hasActiveFilters ? (
                  <Button variant="secondary" onClick={reset}>
                    Rensa filter
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/events/new">
                      <Plus strokeWidth={2.5} /> Nytt event
                    </Link>
                  </Button>
                )
              }
            />
          }
          footer={
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              itemLabel="event"
              onPageChange={(p) => set({ page: p > 1 ? String(p) : '' }, { resetPage: false })}
              onPageSizeChange={(s) => {
                setStoredPageSize(s)
                set({ pageSize: s === 50 ? '' : String(s) })
              }}
            />
          }
        />
      )}

      {/* Bulk-rad */}
      <BulkBar count={selected.size} onClear={() => setSelected(new Set())} itemLabel={selected.size === 1 ? 'valt' : 'valda'}>
        <BulkButton primary disabled={bulkBusy} onClick={() => bulkUpdate({ status: 'published' }, `${selected.size} event publicerade`)}>
          Publicera
        </BulkButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <BulkButton disabled={bulkBusy}>Ändra status</BulkButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            {statusOptions('event').map((o) => (
              <DropdownMenuItem key={o.value} onSelect={() => bulkUpdate({ status: o.value }, `${selected.size} event: ${o.label}`)}>
                <span className={cn('size-1.5 rounded-full', toneClasses[getStatus('event', o.value).tone].dot)} />
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <BulkButton
          disabled={bulkBusy}
          onClick={() => {
            setBulkCats([])
            setBulkCatsOpen(true)
          }}
        >
          Kategorier
        </BulkButton>
        <BulkButton
          disabled={bulkBusy}
          onClick={() => {
            setBulkOrg(null)
            setBulkOrgOpen(true)
          }}
        >
          Arrangör
        </BulkButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <BulkButton disabled={bulkBusy}>Featured</BulkButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuItem onSelect={() => bulkUpdate({ featured: true }, `${selected.size} event markerade som featured`)}>Featured på</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => bulkUpdate({ featured: false }, `${selected.size} event borttagna från featured`)}>Featured av</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <BulkButton danger disabled={bulkBusy} onClick={bulkDelete}>
          Ta bort
        </BulkButton>
      </BulkBar>

      {/* Dialog: eget datumintervall */}
      <Dialog open={rangeOpen} onOpenChange={setRangeOpen}>
        <DialogContent
          size="sm"
          title="Eventdatum"
          description="Visa event som äger rum i intervallet."
          footer={
            <>
              <Button variant="ghost" onClick={() => setRangeOpen(false)}>
                Avbryt
              </Button>
              <Button
                onClick={() => {
                  set({ dateFrom: rangeDraft.from, dateTo: rangeDraft.to })
                  setRangeOpen(false)
                }}
              >
                Använd
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Från" htmlFor="range-from">
              <Input id="range-from" type="date" value={rangeDraft.from} onChange={(e) => setRangeDraft((d) => ({ ...d, from: e.target.value }))} />
            </Field>
            <Field label="Till" htmlFor="range-to">
              <Input id="range-to" type="date" value={rangeDraft.to} onChange={(e) => setRangeDraft((d) => ({ ...d, to: e.target.value }))} />
            </Field>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: tillagt-intervall */}
      <Dialog open={addedOpen} onOpenChange={setAddedOpen}>
        <DialogContent
          size="sm"
          title="Tillagt"
          description="Visa event som lades till i adminen under intervallet."
          footer={
            <>
              <Button variant="ghost" onClick={() => setAddedOpen(false)}>
                Avbryt
              </Button>
              <Button
                onClick={() => {
                  set({ addedFrom: addedDraft.from, addedTo: addedDraft.to })
                  setAddedOpen(false)
                }}
              >
                Använd
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Från" htmlFor="added-from">
              <Input id="added-from" type="date" value={addedDraft.from} onChange={(e) => setAddedDraft((d) => ({ ...d, from: e.target.value }))} />
            </Field>
            <Field label="Till" htmlFor="added-to">
              <Input id="added-to" type="date" value={addedDraft.to} onChange={(e) => setAddedDraft((d) => ({ ...d, to: e.target.value }))} />
            </Field>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: arrangörsfilter */}
      <Dialog open={orgFilterOpen} onOpenChange={setOrgFilterOpen}>
        <DialogContent size="sm" title="Filtrera på arrangör">
          <OrganizerPicker
            autoFocus
            organizers={organizers}
            value={state.org ? Number(state.org) : null}
            onChange={(id) => {
              set({ org: id ? String(id) : '' })
              setOrgFilterOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog: bulk-kategorier */}
      <Dialog open={bulkCatsOpen} onOpenChange={setBulkCatsOpen}>
        <DialogContent
          title={`Sätt kategorier för ${selected.size} event`}
          description="Första valda blir huvudkategori. Ersätter befintliga kategorier."
          footer={
            <>
              <Button variant="ghost" onClick={() => setBulkCatsOpen(false)}>
                Avbryt
              </Button>
              <Button
                disabled={bulkCats.length === 0 || bulkBusy}
                onClick={async () => {
                  await bulkUpdate({ categories: bulkCats, category: bulkCats[0] }, `Kategorier satta på ${selected.size} event`)
                  setBulkCatsOpen(false)
                }}
              >
                Spara
              </Button>
            </>
          }
        >
          <CategoryPicker value={bulkCats} onChange={setBulkCats} />
        </DialogContent>
      </Dialog>

      {/* Dialog: bulk-arrangör */}
      <Dialog open={bulkOrgOpen} onOpenChange={setBulkOrgOpen}>
        <DialogContent
          size="sm"
          title={`Sätt arrangör för ${selected.size} event`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setBulkOrgOpen(false)}>
                Avbryt
              </Button>
              <Button
                disabled={bulkOrg == null || bulkBusy}
                onClick={async () => {
                  await bulkUpdate({ organizer_id: bulkOrg }, `Arrangör satt på ${selected.size} event`)
                  setBulkOrgOpen(false)
                }}
              >
                Spara
              </Button>
            </>
          }
        >
          <OrganizerPicker organizers={organizers.filter((o) => o.status !== 'archived')} value={bulkOrg} onChange={setBulkOrg} autoFocus />
        </DialogContent>
      </Dialog>

    </>
  )
}

export default function EventsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <EventsPageInner />
    </Suspense>
  )
}
