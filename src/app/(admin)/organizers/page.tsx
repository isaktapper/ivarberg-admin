'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as stringSimilarity from 'string-similarity'
import { Plus, MoreHorizontal, Eye, Pencil, Check, Archive, GitMerge, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { Organizer, OrganizerStatus } from '@/types/database'
import { useUrlState } from '@/hooks/use-url-state'
import { formatDay, formatNumber } from '@/lib/format'
import { statusOptions } from '@/lib/status'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/tabs'
import { SearchInput } from '@/components/ui/search-input'
import { FilterBar, SelectFilter } from '@/components/ui/filter-chip'
import { DataTable, type Column, type SortState } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { Pagination } from '@/components/ui/pagination'
import { BulkBar, BulkButton } from '@/components/ui/bulk-bar'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { OrganizerAvatar } from '@/components/organizers/OrganizerAvatar'
import { MergeDialog } from '@/components/organizers/MergeDialog'

type PageInfo = { id: number; is_published: boolean }

interface Row extends Organizer {
  page: PageInfo | null
  upcoming: number
  total: number
  similar: { name: string; pct: number } | null
}

const DEFAULTS = { status: '', q: '', source: '', hasPage: '', page: '1', sort: '' }
const PAGE_SIZE = 50

export default function OrganizersPage() {
  return (
    <Suspense>
      <OrganizersInner />
    </Suspense>
  )
}

function OrganizersInner() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const { state, set, reset } = useUrlState(DEFAULTS)

  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [pages, setPages] = useState<Map<number, PageInfo>>(new Map())
  const [eventCounts, setEventCounts] = useState<Map<number, { upcoming: number; total: number }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string | number>>(new Set())
  const [mergeSource, setMergeSource] = useState<Organizer | null>(null)
  const [mergeTarget, setMergeTarget] = useState<number | null>(null)
  const [publishDialog, setPublishDialog] = useState<{ organizer: Organizer; count: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [orgRes, pageRes, events] = await Promise.all([
        supabase.from('organizers').select('*').order('needs_review', { ascending: false }).order('name'),
        supabase.from('organizer_pages').select('id, organizer_id, is_published'),
        fetchAllRows<{ organizer_id: number | null; date_time: string; status: string }>((from, to) =>
          supabase.from('events').select('organizer_id, date_time, status').order('id').range(from, to)
        ),
      ])
      if (orgRes.error) throw orgRes.error
      setOrganizers(orgRes.data ?? [])

      const pm = new Map<number, PageInfo>()
      pageRes.data?.forEach((p) => p.organizer_id && pm.set(p.organizer_id, { id: p.id, is_published: !!p.is_published }))
      setPages(pm)

      const now = Date.now()
      const cm = new Map<number, { upcoming: number; total: number }>()
      events.forEach((e) => {
        if (!e.organizer_id) return
        const c = cm.get(e.organizer_id) ?? { upcoming: 0, total: 0 }
        c.total++
        if (e.status === 'published' && new Date(e.date_time).getTime() >= now) c.upcoming++
        cm.set(e.organizer_id, c)
      })
      setEventCounts(cm)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Okänt fel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rows: Row[] = useMemo(() => {
    const activeNames = organizers.filter((o) => o.status === 'active').map((o) => o.name)
    return organizers.map((o) => {
      let similar: Row['similar'] = null
      if (o.status === 'pending' && activeNames.length) {
        const best = stringSimilarity.findBestMatch(o.name.toLowerCase(), activeNames.map((n) => n.toLowerCase())).bestMatch
        if (best.rating >= 0.85) similar = { name: activeNames[activeNames.map((n) => n.toLowerCase()).indexOf(best.target)], pct: Math.round(best.rating * 100) }
      }
      const counts = eventCounts.get(o.id) ?? { upcoming: 0, total: 0 }
      return { ...o, page: pages.get(o.id) ?? null, similar, ...counts }
    })
  }, [organizers, pages, eventCounts])

  const sources = useMemo(() => {
    const s = new Set<string>()
    organizers.forEach((o) => s.add(o.scraper_source || 'Manuell'))
    return Array.from(s).sort().map((v) => ({ value: v, label: v }))
  }, [organizers])

  const counts = useMemo(
    () => ({
      all: organizers.length,
      pending: organizers.filter((o) => o.status === 'pending').length,
      active: organizers.filter((o) => o.status === 'active').length,
      archived: organizers.filter((o) => o.status === 'archived').length,
    }),
    [organizers]
  )

  const filtered = useMemo(() => {
    const q = state.q.trim().toLowerCase()
    let out = rows.filter((r) => {
      if (state.status && r.status !== state.status) return false
      if (state.source && (r.scraper_source || 'Manuell') !== state.source) return false
      if (state.hasPage === 'yes' && !r.page) return false
      if (state.hasPage === 'no' && r.page) return false
      if (q) {
        const hay = [r.name, r.email, r.location, ...(r.alternative_names ?? [])].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    if (state.sort) {
      const [key, dir] = state.sort.split(':')
      const m = dir === 'asc' ? 1 : -1
      out = [...out].sort((a, b) => {
        if (key === 'events') return (a.upcoming - b.upcoming || a.total - b.total) * m
        if (key === 'enriched') return ((a.enriched_at ?? '') > (b.enriched_at ?? '') ? 1 : -1) * m
        return a.name.localeCompare(b.name) * m
      })
    }
    return out
  }, [rows, state])

  const page = Math.max(1, parseInt(state.page) || 1)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const sort: SortState | undefined = state.sort ? { key: state.sort.split(':')[0], dir: state.sort.split(':')[1] as 'asc' | 'desc' } : undefined
  const hasActiveFilters = !!(state.q || state.source || state.hasPage)

  // ---- åtgärder --------------------------------------------------------

  const patchLocal = (ids: number[], patch: Partial<Organizer>) => setOrganizers((prev) => prev.map((o) => (ids.includes(o.id) ? { ...o, ...patch } : o)))

  const setStatus = async (ids: number[], status: OrganizerStatus) => {
    const { error } = await supabase.from('organizers').update({ status, needs_review: status === 'pending', updated_at: new Date().toISOString() }).in('id', ids)
    if (error) {
      toast.error('Kunde inte ändra status', error.message)
      return false
    }
    patchLocal(ids, { status, needs_review: status === 'pending' })
    return true
  }

  /** Pending → active. Frågar om utkast-event ska publiceras om sådana finns. */
  const approve = async (org: Organizer) => {
    const { count } = await supabase.from('events').select('id', { count: 'exact', head: true }).eq('organizer_id', org.id).eq('status', 'draft')
    if ((count ?? 0) > 0) {
      setPublishDialog({ organizer: org, count: count ?? 0 })
      return
    }
    if (await setStatus([org.id], 'active')) toast.success(`${org.name} godkänd`)
  }

  const finishApprove = async (publish: boolean) => {
    if (!publishDialog) return
    setBusy(true)
    const { organizer, count } = publishDialog
    const ok = await setStatus([organizer.id], 'active')
    if (ok && publish) {
      const { error } = await supabase.from('events').update({ status: 'published' }).eq('organizer_id', organizer.id).eq('status', 'draft')
      if (error) toast.error('Arrangören godkänd, men utkasten kunde inte publiceras', error.message)
      else toast.success(`${organizer.name} godkänd`, `${count} event publicerades`)
      load()
    } else if (ok) toast.success(`${organizer.name} godkänd`)
    setBusy(false)
    setPublishDialog(null)
  }

  const remove = async (orgs: Organizer[]) => {
    const withEvents = orgs.filter((o) => (eventCounts.get(o.id)?.total ?? 0) > 0)
    if (withEvents.length) {
      toast.error('Kan inte ta bort arrangör med event', `${withEvents.map((o) => o.name).join(', ')} har kopplade event. Flytta eller ta bort dem först, eller slå ihop arrangören.`)
      return
    }
    const ok = await confirm({
      title: orgs.length === 1 ? `Ta bort ”${orgs[0].name}”?` : `Ta bort ${orgs.length} arrangörer?`,
      description: 'Går inte att ångra.',
      confirmLabel: 'Ta bort',
      destructive: true,
    })
    if (!ok) return
    const ids = orgs.map((o) => o.id)
    const { error } = await supabase.from('organizers').delete().in('id', ids)
    if (error) return toast.error('Kunde inte ta bort', error.message)
    setOrganizers((prev) => prev.filter((o) => !ids.includes(o.id)))
    setSelected(new Set())
    toast.success(orgs.length === 1 ? 'Arrangören togs bort' : `${orgs.length} arrangörer togs bort`)
  }

  const bulkStatus = async (status: OrganizerStatus) => {
    const ids = Array.from(selected) as number[]
    if (status === 'active') {
      // Godkänn i bulk: utkast publiceras inte automatiskt
      const ok = await confirm({ title: `Godkänn ${ids.length} arrangörer?`, description: 'Deras event som är utkast förblir utkast.', confirmLabel: 'Godkänn' })
      if (!ok) return
    }
    if (await setStatus(ids, status)) {
      toast.success(`${ids.length} arrangörer ${status === 'active' ? 'godkända' : 'arkiverade'}`)
      setSelected(new Set())
    }
  }

  const openBulkMerge = () => {
    const [a, b] = Array.from(selected) as number[]
    const source = organizers.find((o) => o.id === a)
    if (!source) return
    setMergeTarget(b)
    setMergeSource(source)
  }

  // ---- kolumner --------------------------------------------------------

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Arrangör',
      width: 'minmax(220px,1fr)',
      sortable: true,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <OrganizerAvatar name={r.name} warn={r.needs_review || r.status === 'pending'} />
          <div className="flex min-w-0 flex-col">
            <Link href={`/organizers/${r.id}`} className="truncate text-[13px] font-medium text-ink hover:text-sea">
              {r.name}
            </Link>
            <span className={`truncate text-[11px] ${r.similar ? 'text-amber' : 'text-ink-muted'}`}>
              {r.similar
                ? `Liknar ”${r.similar.name}” (${r.similar.pct} %)`
                : r.alternative_names?.length
                  ? `Alias: ${r.alternative_names.join(', ')}`
                  : r.created_from_scraper
                    ? `Auto-skapad ${formatDay(r.created_at)}`
                    : r.email || r.location || ''}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'events',
      header: 'Event kommande / totalt',
      width: '150px',
      sortable: true,
      cell: (r) => (
        <span className="font-mono text-xs text-ink">
          {r.upcoming} / {r.total}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '130px',
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sea/40" onClick={(e) => e.stopPropagation()} aria-label="Ändra status">
              <StatusBadge domain="organizer" value={r.status} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {statusOptions('organizer').map((o) => (
              <DropdownMenuItem
                key={o.value}
                disabled={o.value === r.status}
                onSelect={() => (o.value === 'active' && r.status === 'pending' ? approve(r) : setStatus([r.id], o.value as OrganizerStatus).then((ok) => ok && toast.success('Status ändrad')))}
              >
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
    {
      key: 'enriched',
      header: 'Berikad',
      width: '110px',
      sortable: true,
      cell: (r) => <span className={`font-mono text-xs ${r.enriched_at ? 'text-ink-soft' : 'text-poppy'}`}>{r.enriched_at ? formatDay(r.enriched_at) : 'aldrig'}</span>,
    },
    {
      key: 'page',
      header: 'Arrangörssida',
      width: '130px',
      cell: (r) =>
        r.page ? (
          <Link href={`/organizer-pages/${r.page.id}/edit`} className={`text-[13px] font-medium ${r.page.is_published ? 'text-kelp' : 'text-sea'}`}>
            {r.page.is_published ? 'Publicerad' : 'Utkast'}
          </Link>
        ) : r.status === 'archived' ? (
          <span className="text-[13px] text-ink-faint">Ingen</span>
        ) : (
          <Link href={`/organizer-pages/new?organizer_id=${r.id}`} className="text-[13px] font-medium text-sea">
            Skapa sida
          </Link>
        ),
    },
    { key: 'source', header: 'Källa', width: '120px', cell: (r) => <span className="text-xs text-ink-muted">{r.scraper_source || 'Manuell'}</span> },
    {
      key: 'actions',
      header: '',
      width: '44px',
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Fler åtgärder" onClick={(e) => e.stopPropagation()} className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-stone hover:text-ink">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => router.push(`/organizers/${r.id}`)}>
              <Eye /> Visa
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push(`/organizers/${r.id}/edit`)}>
              <Pencil /> Redigera
            </DropdownMenuItem>
            {r.status === 'pending' ? (
              <DropdownMenuItem onSelect={() => approve(r)}>
                <Check /> Godkänn
              </DropdownMenuItem>
            ) : null}
            {r.status !== 'archived' ? (
              <DropdownMenuItem onSelect={() => setStatus([r.id], 'archived').then((ok) => ok && toast.success(`${r.name} arkiverad`))}>
                <Archive /> Arkivera
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={() => {
                setMergeTarget(r.similar ? (organizers.find((o) => o.name === r.similar!.name)?.id ?? null) : null)
                setMergeSource(r)
              }}
            >
              <GitMerge /> Slå ihop…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => remove([r])}>
              <Trash2 /> Ta bort
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const selectedOrgs = organizers.filter((o) => selected.has(o.id))

  return (
    <>
      <PageHeader
        title="Arrangörer"
        meta={`${formatNumber(organizers.length)} totalt · ${pages.size} med egen sida`}
        actions={
          <Button asChild>
            <Link href="/organizers/new">
              <Plus strokeWidth={2.5} /> Ny arrangör
            </Link>
          </Button>
        }
      />

      <FilterBar onReset={reset} hasActive={hasActiveFilters || !!state.status}>
        <Segmented
          value={state.status}
          onChange={(v) => set({ status: v })}
          items={[
            { value: '', label: 'Alla', count: counts.all },
            { value: 'pending', label: 'Väntar granskning', count: counts.pending },
            { value: 'active', label: 'Aktiva', count: counts.active },
            { value: 'archived', label: 'Arkiverade', count: counts.archived },
          ]}
        />
        <SearchInput value={state.q} onChange={(q) => set({ q })} placeholder="Namn, alias, e-post…" className="w-72" />
        <SelectFilter label="Källa" value={state.source} options={sources} onChange={(v) => set({ source: v })} />
        <SelectFilter
          label="Har sida"
          value={state.hasPage}
          options={[
            { value: 'yes', label: 'Ja' },
            { value: 'no', label: 'Nej' },
          ]}
          onChange={(v) => set({ hasPage: v })}
        />
      </FilterBar>

      {error ? (
        <ErrorState description={error} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={paged}
          rowKey={(r) => r.id}
          loading={loading}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          sort={sort}
          onSortChange={(s) => set({ sort: `${s.key}:${s.dir}` }, { resetPage: false })}
          rowClassName={(r) => (r.status === 'pending' ? 'bg-amber-light/25' : undefined)}
          emptyState={
            <EmptyState
              title={hasActiveFilters || state.status ? 'Inga arrangörer matchar' : 'Inga arrangörer än'}
              description={hasActiveFilters || state.status ? 'Prova att rensa filtren.' : 'Arrangörer skapas automatiskt av scrapers eller manuellt här.'}
              action={
                hasActiveFilters || state.status ? (
                  <Button variant="secondary" onClick={reset}>
                    Rensa filter
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/organizers/new">Ny arrangör</Link>
                  </Button>
                )
              }
            />
          }
          footer={<Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={(p) => set({ page: String(p) }, { resetPage: false })} itemLabel="arrangörer" />}
        />
      )}

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkButton primary disabled={selected.size !== 2} title={selected.size !== 2 ? 'Markera exakt två arrangörer' : undefined} onClick={openBulkMerge}>
          <span className="inline-flex items-center gap-1.5">
            <GitMerge className="size-3.5" /> Slå ihop
          </span>
        </BulkButton>
        <BulkButton onClick={() => bulkStatus('active')} disabled={!selectedOrgs.some((o) => o.status !== 'active')}>
          Godkänn
        </BulkButton>
        <BulkButton onClick={() => bulkStatus('archived')} disabled={!selectedOrgs.some((o) => o.status !== 'archived')}>
          Arkivera
        </BulkButton>
        <BulkButton danger onClick={() => remove(selectedOrgs)}>
          Ta bort
        </BulkButton>
      </BulkBar>

      <MergeDialog
        source={mergeSource}
        organizers={organizers}
        presetTargetId={mergeTarget}
        onClose={() => {
          setMergeSource(null)
          setMergeTarget(null)
        }}
        onMerged={() => {
          setSelected(new Set())
          load()
        }}
      />

      <Dialog open={!!publishDialog} onOpenChange={(o) => !o && setPublishDialog(null)}>
        {publishDialog ? (
          <DialogContent
            size="sm"
            title={`Godkänn ${publishDialog.organizer.name}`}
            description={`Arrangören har ${publishDialog.count} event som utkast. Vill du publicera dem samtidigt?`}
            footer={
              <>
                <Button variant="ghost" onClick={() => finishApprove(false)} loading={busy}>
                  Bara arrangören
                </Button>
                <Button onClick={() => finishApprove(true)} loading={busy}>
                  Publicera {publishDialog.count} event
                </Button>
              </>
            }
          >
            <span className="text-[13px] text-ink-soft">Utkasten blir synliga på ivarberg.nu direkt.</span>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}
