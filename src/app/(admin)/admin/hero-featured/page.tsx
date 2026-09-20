'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronUp, ChevronDown, X, Calendar, MapPin, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Event, HeroFeaturedEvent } from '@/types/database'
import { formatDateTime, formatDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardBody, CardHeader, SectionLabel } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { SearchInput } from '@/components/ui/search-input'
import { Thumb } from '@/components/ui/data-table'
import { EmptyState, ErrorState, LoadingState, Spinner } from '@/components/ui/states'
import { IconButton } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'

type Featured = HeroFeaturedEvent & { event?: Event }
const MAX_SECONDARY = 5

export default function HeroFeaturedPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [main, setMain] = useState<Featured | null>(null)
  const [secondary, setSecondary] = useState<Featured[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState<'main' | 'secondary' | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [m, s] = await Promise.all([
        supabase.from('hero_featured_events').select('*, event:events(*)').eq('position', 'main').maybeSingle(),
        supabase.from('hero_featured_events').select('*, event:events(*)').eq('position', 'secondary').order('priority', { ascending: true }),
      ])
      if (m.error) throw m.error
      if (s.error) throw s.error
      setMain((m.data as Featured) || null)
      setSecondary((s.data as Featured[]) || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Okänt fel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      await load()
      toast.success(label)
    } catch (e) {
      toast.error('Något gick fel', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const setMainEvent = (eventId: number) =>
    run('Huvudevent uppdaterat', async () => {
      if (main) {
        const { error } = await supabase.from('hero_featured_events').delete().eq('id', main.id)
        if (error) throw error
      }
      const { error } = await supabase.from('hero_featured_events').insert({ event_id: eventId, position: 'main', priority: null })
      if (error) throw error
      setPicker(null)
    })

  const removeMain = async () => {
    if (!main) return
    const ok = await confirm({ title: 'Ta bort huvudeventet?', description: 'Hero-sektionen på startsidan visas utan huvudevent tills ett nytt väljs.', confirmLabel: 'Ta bort', destructive: true })
    if (!ok) return
    run('Huvudevent borttaget', async () => {
      const { error } = await supabase.from('hero_featured_events').delete().eq('id', main.id)
      if (error) throw error
    })
  }

  const addSecondary = (eventId: number) => {
    if (secondary.length >= MAX_SECONDARY) {
      toast.error(`Max ${MAX_SECONDARY} sekundära event`)
      return
    }
    run('Sekundärt event tillagt', async () => {
      const { error } = await supabase.from('hero_featured_events').insert({ event_id: eventId, position: 'secondary', priority: secondary.length + 1 })
      if (error) throw error
      setPicker(null)
    })
  }

  /** Skriver om prioriteterna 1..n för listan i given ordning, parallellt. */
  const writePriorities = async (list: Featured[]) => {
    const results = await Promise.all(list.map((f, i) => supabase.from('hero_featured_events').update({ priority: i + 1 }).eq('id', f.id)))
    const failed = results.find((r) => r.error)
    if (failed?.error) throw failed.error
  }

  const removeSecondary = async (item: Featured) => {
    const ok = await confirm({ title: 'Ta bort från hero?', description: item.event?.name, confirmLabel: 'Ta bort', destructive: true })
    if (!ok) return
    run('Borttaget från hero', async () => {
      const { error } = await supabase.from('hero_featured_events').delete().eq('id', item.id)
      if (error) throw error
      await writePriorities(secondary.filter((s) => s.id !== item.id))
    })
  }

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= secondary.length) return
    const next = [...secondary]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSecondary(next) // optimistiskt
    run('Ordningen sparad', () => writePriorities(next))
  }

  const featuredIds = [main?.event_id, ...secondary.map((s) => s.event_id)].filter((x): x is number => typeof x === 'number')

  if (loading) return <LoadingState />
  if (error) return <ErrorState title="Kunde inte hämta hero-event" description={error} onRetry={load} />

  return (
    <>
      <PageHeader title="Hero på startsidan" description="Ett huvudevent och upp till fem sekundära som visas överst på ivarberg.nu." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Huvudevent"
              description="Det stora kortet överst i hero-sektionen."
              actions={
                main ? (
                  <>
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => setPicker('main')}>Byt</Button>
                    <Button variant="destructive" size="sm" disabled={busy} onClick={removeMain}>Ta bort</Button>
                  </>
                ) : null
              }
            />
            <CardBody>
              {main?.event ? (
                <EventPreview event={main.event} large />
              ) : (
                <button type="button" disabled={busy} onClick={() => setPicker('main')} className="flex w-full flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-[#C9C0AE] bg-sand-soft py-12 text-ink-soft hover:border-sea hover:text-sea">
                  <Plus className="size-5" />
                  <span className="text-[13px] font-medium">Välj huvudevent</span>
                </button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`Sekundära (${secondary.length}/${MAX_SECONDARY})`}
              description="Ordningen här är ordningen på startsidan."
              actions={
                secondary.length < MAX_SECONDARY ? (
                  <Button size="sm" disabled={busy} onClick={() => setPicker('secondary')}>
                    <Plus strokeWidth={2.5} /> Lägg till
                  </Button>
                ) : null
              }
            />
            <div className="flex flex-col">
              {secondary.map((item, i) => (
                <div key={item.id} className="flex items-center gap-3 border-b border-line-soft px-5 py-3 last:border-b-0">
                  <span className="w-5 font-mono text-xs text-ink-muted">{i + 1}</span>
                  <Thumb src={item.event?.image_url} size={44} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link href={item.event ? `/events/${item.event.id}/edit` : '#'} className="truncate text-[13px] font-medium text-ink hover:text-sea">{item.event?.name ?? 'Okänt event'}</Link>
                    <span className="truncate text-[11px] text-ink-muted">{item.event ? `${formatDateTime(item.event.date_time)} · ${item.event.venue_name || item.event.location}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <IconButton label="Flytta upp" disabled={busy || i === 0} onClick={() => move(i, -1)}><ChevronUp /></IconButton>
                    <IconButton label="Flytta ner" disabled={busy || i === secondary.length - 1} onClick={() => move(i, 1)}><ChevronDown /></IconButton>
                    <IconButton label="Ta bort" disabled={busy} onClick={() => removeSecondary(item)} className="hover:bg-poppy-light hover:text-poppy"><X /></IconButton>
                  </div>
                </div>
              ))}
              {Array.from({ length: MAX_SECONDARY - secondary.length }).map((_, i) => (
                <button
                  key={`empty-${i}`}
                  type="button"
                  disabled={busy}
                  onClick={() => setPicker('secondary')}
                  className="mx-5 my-2 flex h-11 items-center justify-center gap-2 rounded-[8px] border border-dashed border-[#C9C0AE] text-[13px] text-ink-muted hover:border-sea hover:text-sea"
                >
                  <Plus className="size-4" /> Tom plats {secondary.length + i + 1}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Så visas det på ivarberg.nu" />
          <CardBody className="bg-sand">
            <div className="flex flex-col gap-2">
              <MockTile event={main?.event} tall label="Huvud" />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: MAX_SECONDARY }).map((_, i) => (
                  <MockTile key={i} event={secondary[i]?.event} label={String(i + 1)} className={i === 4 ? 'col-span-2' : ''} />
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <EventPicker open={picker !== null} title={picker === 'main' ? 'Välj huvudevent' : 'Lägg till sekundärt event'} excludeIds={featuredIds} onClose={() => setPicker(null)} onPick={(id) => (picker === 'main' ? setMainEvent(id) : addSecondary(id))} busy={busy} />
    </>
  )
}

function EventPreview({ event, large }: { event: Event; large?: boolean }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="flex flex-col gap-3 overflow-hidden rounded-[10px] border border-line">
      {event.image_url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.image_url} alt="" onError={() => setBroken(true)} className={cn('w-full object-cover', large ? 'aspect-video' : 'aspect-[3/2]')} />
      ) : (
        <div className={cn('flex w-full items-center justify-center bg-poppy-light font-mono text-xs text-poppy', large ? 'aspect-video' : 'aspect-[3/2]')}>Bild saknas</div>
      )}
      <div className="flex flex-col gap-1.5 px-4 pb-4">
        <Link href={`/events/${event.id}/edit`} className="inline-flex items-center gap-1.5 font-display text-lg font-semibold text-ink hover:text-sea">
          {event.name} <Pencil className="size-3.5 text-ink-muted" />
        </Link>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft">
          <span className="inline-flex items-center gap-1.5"><Calendar className="size-3.5 text-ink-muted" /> {formatDateTime(event.date_time)}</span>
          <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-ink-muted" /> {event.venue_name || event.location}</span>
        </div>
      </div>
    </div>
  )
}

function MockTile({ event, tall, label, className }: { event?: Event; tall?: boolean; label: string; className?: string }) {
  return (
    <div className={cn('relative flex items-end overflow-hidden rounded-[8px] border border-line bg-white p-2', tall ? 'h-24' : 'h-14', !event && 'border-dashed', className)}>
      {event?.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.image_url} alt="" className="absolute inset-0 size-full object-cover opacity-70" />
      ) : null}
      <span className="relative truncate rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-ink">{event ? event.name : `${label} · tom`}</span>
    </div>
  )
}

function EventPicker({ open, title, excludeIds, onClose, onPick, busy }: { open: boolean; title: string; excludeIds: number[]; onClose: () => void; onPick: (id: number) => void; busy: boolean }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Event[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setQ('')
      setRows([])
      return
    }
    let alive = true
    setLoading(true)
    const like = `%${q.trim().replace(/[%_]/g, '')}%`
    let query = supabase.from('events').select('*').eq('status', 'published').gte('date_time', new Date().toISOString()).order('date_time', { ascending: true }).limit(20)
    if (q.trim()) query = query.ilike('name', like)
    query.then(({ data }) => {
      if (!alive) return
      setRows(((data as Event[]) || []).filter((e) => !excludeIds.includes(e.id)))
      setLoading(false)
    })
    return () => {
      alive = false
    }
    // excludeIds ändras bara när listan laddas om; q och open styr sökningen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description="Endast publicerade, kommande event." size="md" className="h-[70vh]">
        <div className="flex h-full flex-col gap-3">
          <SearchInput value={q} onChange={setQ} placeholder="Sök på eventnamn…" autoFocus />
          <div className="thin-scroll -mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : rows.length === 0 ? (
              <EmptyState title="Inga event hittades" description="Prova ett annat sökord." className="py-8" />
            ) : (
              rows.map((e) => (
                <button key={e.id} type="button" disabled={busy} onClick={() => onPick(e.id)} className="flex items-center gap-3 rounded-[8px] px-2 py-2 text-left hover:bg-sand-soft disabled:opacity-50">
                  <Thumb src={e.image_url} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium text-ink">{e.name}</span>
                    <span className="truncate text-[11px] text-ink-muted">{formatDay(e.date_time)} · {e.venue_name || e.location}</span>
                  </span>
                  <Plus className="size-4 text-ink-muted" />
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { SectionLabel }
