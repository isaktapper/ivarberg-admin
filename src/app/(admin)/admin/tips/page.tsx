'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, MoreHorizontal, Sparkles, XCircle, CheckCircle2, Lightbulb } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { EventTip, EventTipStatus } from '@/types/database'
import { useUrlState } from '@/hooks/use-url-state'
import { formatDay, formatRelative } from '@/lib/format'
import { PageHeader } from '@/components/ui/page-header'
import { Segmented } from '@/components/ui/tabs'
import { SearchInput } from '@/components/ui/search-input'
import { DataTable, TitleCell, Thumb, type Column } from '@/components/ui/data-table'
import { StatusBadge, CategoryChip } from '@/components/ui/status-badge'
import { Pagination } from '@/components/ui/pagination'
import { BulkBar, BulkButton } from '@/components/ui/bulk-bar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { convertTip, markTipsReviewed, rejectTip } from '@/components/admin/tip-actions'

const STATUSES: { value: string; label: string }[] = [
  { value: 'pending', label: 'Väntar' },
  { value: 'reviewed', label: 'Granskade' },
  { value: 'approved', label: 'Godkända' },
  { value: 'rejected', label: 'Avvisade' },
  { value: 'converted', label: 'Skapade' },
  { value: 'all', label: 'Alla' },
]

const DEFAULTS = { status: 'pending', q: '', page: '1' }
const PAGE_SIZE = 20
/**
 * API:et (/api/admin/tips) saknar sökparameter. Vi hämtar därför upp till
 * 200 tips för vald status och söker/paginerar i klienten.
 */
const FETCH_LIMIT = 200

export default function TipsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <TipsList />
    </Suspense>
  )
}

function TipsList() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const { state, set } = useUrlState(DEFAULTS)

  const [tips, setTips] = useState<EventTip[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string | number>>(new Set())
  const [rejectTarget, setRejectTarget] = useState<number[] | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [busy, setBusy] = useState(false)

  const page = Math.max(1, parseInt(state.page) || 1)

  const loadCounts = useCallback(async () => {
    const keys = STATUSES.map((s) => s.value)
    const results = await Promise.all(
      keys.map((k) => {
        let q = supabase.from('event_tips').select('*', { count: 'exact', head: true })
        if (k !== 'all') q = q.eq('status', k)
        return q
      })
    )
    const next: Record<string, number> = {}
    keys.forEach((k, i) => (next[k] = results[i].count ?? 0))
    setCounts(next)
  }, [])

  const loadTips = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/tips?page=1&limit=${FETCH_LIMIT}&status=${state.status}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.details || json.error || 'Kunde inte hämta tips')
      setTips(json.tips || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Okänt fel')
    } finally {
      setLoading(false)
    }
  }, [state.status])

  useEffect(() => {
    loadTips()
    loadCounts()
  }, [loadTips, loadCounts])

  useEffect(() => setSelected(new Set()), [state.status, state.q])

  const filtered = useMemo(() => {
    const term = state.q.trim().toLowerCase()
    if (!term) return tips
    return tips.filter((t) =>
      [t.event_name, t.venue_name, t.event_location, t.submitter_name, t.submitter_email].some((v) => v?.toLowerCase().includes(term))
    )
  }, [tips, state.q])

  const pageRows = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page])

  const refresh = () => {
    loadTips()
    loadCounts()
    setSelected(new Set())
  }

  const doConvert = async (tip: EventTip) => {
    const ok = await confirm({
      title: 'Konvertera till event?',
      description: `”${tip.event_name}” skapas som utkast och kan sedan granskas och publiceras.`,
      confirmLabel: 'Konvertera',
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await convertTip(tip.id)
      toast.toast({
        kind: 'success',
        title: 'Event skapat som utkast',
        description: tip.event_name,
        action: { label: 'Öppna eventet', onClick: () => router.push(`/events/${result.event.id}/edit`) },
      })
      refresh()
    } catch (e) {
      toast.error('Kunde inte konvertera', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const doReject = async () => {
    if (!rejectTarget?.length) return
    setBusy(true)
    try {
      for (const id of rejectTarget) await rejectTip(id, rejectReason.trim())
      toast.success(rejectTarget.length === 1 ? 'Tipset avvisat' : `${rejectTarget.length} tips avvisade`)
      setRejectTarget(null)
      setRejectReason('')
      refresh()
    } catch (e) {
      toast.error('Kunde inte avvisa', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const doReviewed = async (ids: number[]) => {
    setBusy(true)
    try {
      await markTipsReviewed(ids)
      toast.success(ids.length === 1 ? 'Markerat som granskat' : `${ids.length} tips markerade som granskade`)
      refresh()
    } catch (e) {
      toast.error('Kunde inte uppdatera', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<EventTip>[] = [
    {
      key: 'event',
      header: 'Event',
      width: 'minmax(220px, 1.6fr)',
      cell: (t) => (
        <TitleCell thumb={<Thumb src={t.image_url} alt="" />} title={t.event_name} subtitle={t.venue_name || t.event_location || undefined} href={`/admin/tips/${t.id}`} />
      ),
    },
    { key: 'date', header: 'Datum', width: '110px', cell: (t) => <span className="font-mono text-xs">{formatDay(t.date_time || t.event_date)}</span> },
    { key: 'place', header: 'Plats', width: 'minmax(120px, 1fr)', cell: (t) => <span className="block truncate text-ink-soft">{t.event_location || '–'}</span> },
    {
      key: 'submitter',
      header: 'Inlämnare',
      width: 'minmax(140px, 1fr)',
      cell: (t) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{t.submitter_name || '–'}</span>
          <span className="truncate text-[11px] text-ink-muted">{t.submitter_email}</span>
        </div>
      ),
    },
    {
      key: 'cats',
      header: 'Kategorier',
      width: '150px',
      cell: (t) => {
        const cats = t.categories?.length ? t.categories : t.category ? [t.category] : []
        if (!cats.length) return <span className="text-ink-faint">–</span>
        return (
          <span className="flex items-center gap-1.5">
            <CategoryChip>{cats[0]}</CategoryChip>
            {cats.length > 1 ? <span className="text-[11px] text-ink-muted">+{cats.length - 1}</span> : null}
          </span>
        )
      },
    },
    { key: 'status', header: 'Status', width: '120px', cell: (t) => <StatusBadge domain="tip" value={t.status} /> },
    { key: 'created', header: 'Inkom', width: '110px', cell: (t) => <span className="font-mono text-xs text-ink-soft">{formatRelative(t.created_at)}</span> },
    {
      key: 'actions',
      header: '',
      width: '44px',
      cell: (t) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Fler åtgärder" onClick={(e) => e.stopPropagation()} className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-stone hover:text-ink">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => router.push(`/admin/tips/${t.id}`)}>
              <Eye /> Visa
            </DropdownMenuItem>
            {t.status !== 'converted' ? (
              <DropdownMenuItem onSelect={() => doConvert(t)}>
                <Sparkles /> Konvertera till event
              </DropdownMenuItem>
            ) : null}
            {t.status === 'pending' ? (
              <DropdownMenuItem onSelect={() => doReviewed([t.id])}>
                <CheckCircle2 /> Markera som granskad
              </DropdownMenuItem>
            ) : null}
            {t.status !== 'rejected' && t.status !== 'converted' ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => { setRejectTarget([t.id]); setRejectReason('') }}>
                  <XCircle /> Avvisa…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const selectedIds = Array.from(selected).map(Number)

  return (
    <>
      <PageHeader
        title="Tips från besökare"
        description="Event som besökare skickat in via ivarberg.nu. Konvertera till utkast eller avvisa."
        meta={counts.all != null ? `${counts.all} totalt` : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Segmented items={STATUSES.map((s) => ({ value: s.value, label: s.label, count: counts[s.value] ?? null }))} value={state.status} onChange={(v) => set({ status: v })} />
        <SearchInput value={state.q} onChange={(v) => set({ q: v })} placeholder="Sök namn, plats, inlämnare…" className="w-72" />
      </div>

      {error ? (
        <ErrorState title="Kunde inte hämta tips" description={error} onRetry={refresh} />
      ) : (
        <DataTable
          columns={columns}
          rows={pageRows}
          rowKey={(t) => t.id}
          loading={loading}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          rowHref={(t) => `/admin/tips/${t.id}`}
          onRowClick={(t) => router.push(`/admin/tips/${t.id}`)}
          emptyState={
            <EmptyState
              icon={<Lightbulb />}
              title={state.q ? 'Inga tips matchar sökningen' : 'Inga tips här'}
              description={state.status === 'pending' ? 'Alla inkomna tips är hanterade.' : undefined}
            />
          }
          footer={<Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={(p) => set({ page: String(p) }, { resetPage: false })} itemLabel="tips" />}
        />
      )}

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkButton primary disabled={busy} onClick={() => doReviewed(selectedIds)}>
          Markera granskade
        </BulkButton>
        <BulkButton danger disabled={busy} onClick={() => { setRejectTarget(selectedIds); setRejectReason('') }}>
          Avvisa
        </BulkButton>
      </BulkBar>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent
          size="sm"
          title={rejectTarget && rejectTarget.length > 1 ? `Avvisa ${rejectTarget.length} tips` : 'Avvisa tips'}
          description="Anledningen loggas och används inte i något utskick."
          footer={
            <>
              <Button variant="ghost" onClick={() => setRejectTarget(null)}>Avbryt</Button>
              <Button variant="destructive" loading={busy} onClick={doReject}>Avvisa</Button>
            </>
          }
        >
          <Field label="Anledning" htmlFor="reject-reason" help="Valfritt">
            <Textarea id="reject-reason" autoFocus value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="T.ex. dublett, utanför Varberg, otillräcklig info…" />
          </Field>
        </DialogContent>
      </Dialog>
    </>
  )
}

export type { EventTipStatus }
