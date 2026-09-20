'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, MoreHorizontal, Pencil, ExternalLink, Eye, EyeOff, Copy, Trash2, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { OrganizerPage } from '@/types/database'
import { getFrontendUrl } from '@/lib/utils'
import { formatRelative, formatNumber } from '@/lib/format'
import { useUrlState } from '@/hooks/use-url-state'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import { FilterBar, SelectFilter } from '@/components/ui/filter-chip'
import { DataTable, type Column } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { Pagination } from '@/components/ui/pagination'
import { BulkBar, BulkButton } from '@/components/ui/bulk-bar'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState, ErrorState, Banner } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'

type PageRow = OrganizerPage & { organizer?: { id: number; name: string } | null; event_count: number }

const DEFAULTS = { q: '', status: '', page: '1' }
const PAGE_SIZE = 50

export default function OrganizerPagesPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const { state, set, reset } = useUrlState(DEFAULTS)

  const [pages, setPages] = useState<PageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string | number>>(new Set())
  const [busy, setBusy] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pagesRes, eventsRes] = await Promise.all([
        supabase.from('organizer_pages').select('*, organizer:organizers(id, name)').order('created_at', { ascending: false }),
        supabase.from('events').select('organizer_id').not('organizer_id', 'is', null),
      ])
      if (pagesRes.error) throw pagesRes.error
      const counts = new Map<number, number>()
      eventsRes.data?.forEach((e) => e.organizer_id && counts.set(e.organizer_id, (counts.get(e.organizer_id) ?? 0) + 1))
      setPages((pagesRes.data ?? []).map((p) => ({ ...p, event_count: p.organizer_id ? (counts.get(p.organizer_id) ?? 0) : 0 })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Okänt fel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = state.q.trim().toLowerCase()
    return pages.filter((p) => {
      if (state.status === 'published' && !p.is_published) return false
      if (state.status === 'draft' && p.is_published) return false
      if (q && ![p.name, p.slug, p.title, p.description, p.organizer?.name].filter(Boolean).join(' ').toLowerCase().includes(q)) return false
      return true
    })
  }, [pages, state])

  const page = Math.max(1, parseInt(state.page) || 1)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const publishedCount = pages.filter((p) => p.is_published).length

  // ---- åtgärder --------------------------------------------------------
  const setPublished = async (ids: number[], value: boolean) => {
    setBusy(true)
    const { error } = await supabase.from('organizer_pages').update({ is_published: value }).in('id', ids)
    setBusy(false)
    if (error) return toast.error('Kunde inte uppdatera', error.message)
    setPages((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, is_published: value } : p)))
    setSelected(new Set())
    toast.success(ids.length === 1 ? (value ? 'Sidan publicerad' : 'Sidan avpublicerad') : `${ids.length} sidor ${value ? 'publicerade' : 'avpublicerade'}`)
  }

  const remove = async (rows: PageRow[]) => {
    const ok = await confirm({
      title: rows.length === 1 ? `Ta bort ”${rows[0].name}”?` : `Ta bort ${rows.length} sidor?`,
      description: 'Sidan försvinner från ivarberg.nu. Går inte att ångra.',
      confirmLabel: 'Ta bort',
      destructive: true,
    })
    if (!ok) return
    const ids = rows.map((r) => r.id)
    const { error } = await supabase.from('organizer_pages').delete().in('id', ids)
    if (error) return toast.error('Kunde inte ta bort', error.message)
    setPages((prev) => prev.filter((p) => !ids.includes(p.id)))
    setSelected(new Set())
    toast.success(rows.length === 1 ? 'Sidan togs bort' : `${rows.length} sidor togs bort`)
  }

  const duplicate = async (p: PageRow) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, organizer, event_count, ...rest } = p
    const { data, error } = await supabase
      .from('organizer_pages')
      .insert({ ...rest, name: `${p.name} (Kopia)`, slug: `${p.slug}-kopia-${Date.now()}`, title: `${p.title} (Kopia)`, is_published: false })
      .select('*, organizer:organizers(id, name)')
      .single()
    if (error) return toast.error('Kunde inte duplicera', error.message)
    if (data) {
      setPages((prev) => [{ ...data, event_count: p.event_count }, ...prev])
      toast.toast({ kind: 'success', title: 'Sidan duplicerad som utkast', action: { label: 'Öppna kopian', onClick: () => router.push(`/organizer-pages/${data.id}/edit`) } })
    }
  }

  const handleImport = async () => {
    if (!importUrl.trim()) return setImportError('Ange en URL')
    setImporting(true)
    setImportError('')
    try {
      const response = await fetch('/api/organizer-pages/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: importUrl.trim() }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Import misslyckades')
      setPages((prev) => [{ ...result.page, event_count: 0 }, ...prev])
      setImportOpen(false)
      setImportUrl('')
      toast.toast({ kind: 'success', title: 'Sidan importerad som utkast', action: { label: 'Redigera', onClick: () => router.push(`/organizer-pages/${result.page.id}/edit`) } })
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Okänt fel vid import')
    } finally {
      setImporting(false)
    }
  }

  const columns: Column<PageRow>[] = [
    {
      key: 'name',
      header: 'Namn',
      width: 'minmax(220px,1fr)',
      cell: (p) => (
        <div className="flex min-w-0 flex-col">
          <Link href={`/organizer-pages/${p.id}/edit`} className="truncate text-[13px] font-medium text-ink hover:text-sea">
            {p.name}
          </Link>
          <span className="truncate text-[11px] text-ink-muted">{p.title}</span>
        </div>
      ),
    },
    {
      key: 'organizer',
      header: 'Arrangör',
      width: '170px',
      cell: (p) =>
        p.organizer ? (
          <Link href={`/organizers/${p.organizer.id}`} className="truncate text-[13px] text-sea hover:text-sea-dark">
            {p.organizer.name}
          </Link>
        ) : (
          <span className="text-[13px] text-ink-faint">Ingen</span>
        ),
    },
    { key: 'slug', header: 'Slug', width: '180px', cell: (p) => <span className="block truncate font-mono text-xs text-ink-soft">/{p.slug}</span> },
    { key: 'status', header: 'Status', width: '110px', cell: (p) => <StatusBadge domain="page" value={p.is_published} /> },
    { key: 'events', header: 'Event', width: '70px', cell: (p) => <span className="font-mono text-xs text-ink">{p.event_count}</span> },
    { key: 'updated', header: 'Uppdaterad', width: '130px', cell: (p) => <span className="font-mono text-xs text-ink-soft">{formatRelative(p.updated_at)}</span> },
    {
      key: 'actions',
      header: '',
      width: '44px',
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Fler åtgärder" className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-stone hover:text-ink">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => router.push(`/organizer-pages/${p.id}/edit`)}>
              <Pencil /> Redigera
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => window.open(`${getFrontendUrl()}/arrangor/${p.slug}`, '_blank', 'noopener')}>
              <ExternalLink /> Visa på webben
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPublished([p.id], !p.is_published)}>
              {p.is_published ? <EyeOff /> : <Eye />} {p.is_published ? 'Avpublicera' : 'Publicera'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => duplicate(p)}>
              <Copy /> Duplicera
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => remove([p])}>
              <Trash2 /> Ta bort
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const selectedRows = pages.filter((p) => selected.has(p.id))
  const hasActive = !!(state.q || state.status)

  return (
    <>
      <PageHeader
        title="Arrangörssidor"
        meta={`${formatNumber(pages.length)} sidor · ${publishedCount} publicerade`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Download /> Importera från URL
            </Button>
            <Button asChild>
              <Link href="/organizer-pages/new">
                <Plus strokeWidth={2.5} /> Ny sida
              </Link>
            </Button>
          </>
        }
      />

      <FilterBar onReset={reset} hasActive={hasActive}>
        <SearchInput value={state.q} onChange={(q) => set({ q })} placeholder="Namn, slug, arrangör…" className="w-72" />
        <SelectFilter
          label="Status"
          value={state.status}
          options={[
            { value: 'published', label: 'Publicerad', count: publishedCount },
            { value: 'draft', label: 'Utkast', count: pages.length - publishedCount },
          ]}
          onChange={(v) => set({ status: v })}
        />
      </FilterBar>

      {error ? (
        <ErrorState description={error} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={paged}
          rowKey={(p) => p.id}
          loading={loading}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          emptyState={
            <EmptyState
              title={hasActive ? 'Inga sidor matchar' : 'Inga arrangörssidor än'}
              description={hasActive ? 'Prova att rensa filtren.' : 'Skapa en sida manuellt, importera från en URL eller generera från en arrangör.'}
              action={
                hasActive ? (
                  <Button variant="secondary" onClick={reset}>
                    Rensa filter
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/organizer-pages/new">Ny sida</Link>
                  </Button>
                )
              }
            />
          }
          footer={<Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={(p) => set({ page: String(p) }, { resetPage: false })} itemLabel="sidor" />}
        />
      )}

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkButton primary disabled={busy || !selectedRows.some((p) => !p.is_published)} onClick={() => setPublished(selectedRows.filter((p) => !p.is_published).map((p) => p.id), true)}>
          Publicera
        </BulkButton>
        <BulkButton disabled={busy || !selectedRows.some((p) => p.is_published)} onClick={() => setPublished(selectedRows.filter((p) => p.is_published).map((p) => p.id), false)}>
          Avpublicera
        </BulkButton>
        <BulkButton danger onClick={() => remove(selectedRows)}>
          Ta bort
        </BulkButton>
      </BulkBar>

      <Dialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o)
          if (!o) {
            setImportUrl('')
            setImportError('')
          }
        }}
      >
        <DialogContent
          size="sm"
          title="Importera från URL"
          description="Sidan hämtas, innehållet skrivs om med AI och sparas som utkast."
          footer={
            <>
              <Button variant="ghost" onClick={() => setImportOpen(false)}>
                Avbryt
              </Button>
              <Button onClick={handleImport} loading={importing} disabled={!importUrl.trim()}>
                Importera
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Webbadress" htmlFor="import-url" error={importError || null}>
              <Input id="import-url" type="url" autoFocus value={importUrl} onChange={(e) => setImportUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleImport()} placeholder="https://arrangoren.se" aria-invalid={!!importError} />
            </Field>
            {importing ? <Banner tone="info">Hämtar och genererar innehåll, det tar 10–30 sekunder…</Banner> : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
