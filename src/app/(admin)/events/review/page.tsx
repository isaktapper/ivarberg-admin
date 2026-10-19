'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, Pencil, Sparkles } from 'lucide-react'
import * as stringSimilarity from 'string-similarity'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import type { Event, EventCategory } from '@/types/database'
import { formatDay, formatRelative, formatTime, toDateTimeLocalInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useHotkeys } from '@/hooks/use-hotkeys'
import { Button } from '@/components/ui/button'
import { Card, CardBody, SectionLabel } from '@/components/ui/card'
import { Kbd } from '@/components/ui/kbd'
import { CategoryChip, QualityDot, StatusBadge } from '@/components/ui/status-badge'
import { SelectFilter } from '@/components/ui/filter-chip'
import { Banner, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { Input, Textarea, Field } from '@/components/ui/input'
import { CategoryPicker } from '@/components/ui/category-picker'
import { Thumb } from '@/components/ui/data-table'
import { qualityTone, toneClasses } from '@/lib/status'

type ReviewEvent = Event & { organizer?: { id: number; name: string; status: string; scraper_source?: string | null } | null }

const MANUAL = 'Manuell'
const sourceOf = (e: ReviewEvent) => e.organizer?.scraper_source || MANUAL

interface DupeMatch {
  id: number
  name: string
  venue_name?: string | null
  date_time: string
  organizer?: { name: string } | null
  similarity: number
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\wåäöÅÄÖ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export default function EventReviewPage() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()

  const [queue, setQueue] = useState<ReviewEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [done, setDone] = useState(0)
  const [initialTotal, setInitialTotal] = useState(0)
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [source, setSource] = useState('')
  const [sort, setSort] = useState<'score' | 'newest'>('score')
  const [edited, setEdited] = useState<Partial<Event>>({})
  const [dupes, setDupes] = useState<DupeMatch[]>([])
  const [dismissedDupes, setDismissedDupes] = useState<Set<string>>(new Set())
  const [suggesting, setSuggesting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAllRows<ReviewEvent>((from, to) =>
        supabase
          .from('events')
          .select('*, organizer:organizers(id,name,status,scraper_source)')
          .in('status', ['draft', 'pending_approval'])
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      )
      setQueue(data)
      setInitialTotal(data.length)
      setDone(0)
      setSkipped(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Okänt fel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const sources = useMemo(() => {
    const set = new Map<string, number>()
    queue.forEach((e) => set.set(sourceOf(e), (set.get(sourceOf(e)) ?? 0) + 1))
    return Array.from(set.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'sv'))
      .map(([value, count]) => ({ value, label: value, count }))
  }, [queue])

  const list = useMemo(() => {
    let items = source ? queue.filter((e) => sourceOf(e) === source) : queue.slice()
    if (sort === 'score') items.sort((a, b) => (a.quality_score ?? 0) - (b.quality_score ?? 0))
    // 'newest' = ordningen från servern (created_at desc)
    const active = items.filter((e) => !skipped.has(e.id))
    const rest = items.filter((e) => skipped.has(e.id))
    items = [...active, ...rest]
    return items
  }, [queue, source, sort, skipped])

  const current = useMemo(() => list.find((e) => e.id === currentId) ?? list[0] ?? null, [list, currentId])
  const currentIndex = current ? list.findIndex((e) => e.id === current.id) : -1

  // Nollställ redigering när aktuellt event byts
  useEffect(() => {
    setEdited({})
  }, [current?.id])

  const dirty = Object.keys(edited).length > 0
  const val = <K extends keyof Event>(k: K): Event[K] | undefined => (edited[k] !== undefined ? (edited[k] as Event[K]) : current?.[k])
  const setField = <K extends keyof Event>(k: K, v: Event[K]) => setEdited((p) => ({ ...p, [k]: v }))

  // Dublettkontroll: publicerade event samma dag med liknande namn
  useEffect(() => {
    if (!current) {
      setDupes([])
      return
    }
    let alive = true
    const d = new Date(current.date_time)
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const end = new Date(start.getTime() + 86_400_000)
    supabase
      .from('events')
      .select('id,name,venue_name,date_time,organizer:organizers(name)')
      .eq('status', 'published')
      .neq('id', current.id)
      .gte('date_time', start.toISOString())
      .lt('date_time', end.toISOString())
      .limit(200)
      .then(({ data }) => {
        if (!alive) return
        const matches: DupeMatch[] = []
        const me = normalize(current.name)
        ;(data ?? []).forEach((row) => {
          const similarity = stringSimilarity.compareTwoStrings(me, normalize(row.name))
          if (similarity >= 0.8) {
            const org = Array.isArray(row.organizer) ? row.organizer[0] : row.organizer
            matches.push({ id: row.id, name: row.name, venue_name: row.venue_name, date_time: row.date_time, organizer: org ?? null, similarity })
          }
        })
        matches.sort((a, b) => b.similarity - a.similarity)
        setDupes(matches)
      })
    return () => {
      alive = false
    }
  }, [current?.id, current?.name, current?.date_time]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleDupes = dupes.filter((m) => current && !dismissedDupes.has(`${current.id}-${m.id}`))

  // ---- Navigering ----
  const goTo = (idx: number) => {
    const target = list[idx]
    if (target) setCurrentId(target.id)
  }
  const prev = () => goTo(Math.max(0, currentIndex - 1))

  const removeFromQueue = (id: number) => {
    const idx = list.findIndex((e) => e.id === id)
    const following = list[idx + 1] ?? list[idx - 1] ?? null
    setQueue((q) => q.filter((e) => e.id !== id))
    setSkipped((s) => {
      const n = new Set(s)
      n.delete(id)
      return n
    })
    setCurrentId(following?.id ?? null)
    setDone((n) => n + 1)
  }

  // ---- Åtgärder (samma DB-semantik som tidigare) ----
  const saveChanges = async (): Promise<boolean> => {
    if (!current || !dirty) return true
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('events')
        .update({ ...edited, updated_at: new Date().toISOString() })
        .eq('id', current.id)
      if (error) throw error
      setQueue((q) => q.map((e) => (e.id === current.id ? { ...e, ...edited } : e)))
      setEdited({})
      toast.success('Ändringar sparade')
      return true
    } catch (e) {
      toast.error('Kunde inte spara', e instanceof Error ? e.message : undefined)
      return false
    } finally {
      setProcessing(false)
    }
  }

  const approve = async () => {
    if (!current || processing) return
    if (dirty && !(await saveChanges())) return
    setProcessing(true)
    try {
      const { error } = await supabase.from('events').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', current.id)
      if (error) throw error
      toast.success('Publicerat', current.name)
      removeFromQueue(current.id)
    } catch (e) {
      toast.error('Kunde inte godkänna', e instanceof Error ? e.message : undefined)
    } finally {
      setProcessing(false)
    }
  }

  const reject = async () => {
    if (!current || processing) return
    const ok = await confirm({ title: 'Avvisa eventet?', description: `”${current.name}” markeras som inställt och visas inte publikt.`, confirmLabel: 'Avvisa', destructive: true })
    if (!ok) return
    setProcessing(true)
    try {
      const { error } = await supabase.from('events').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', current.id)
      if (error) throw error
      toast.info('Avvisat', current.name)
      removeFromQueue(current.id)
    } catch (e) {
      toast.error('Kunde inte avvisa', e instanceof Error ? e.message : undefined)
    } finally {
      setProcessing(false)
    }
  }

  const skip = () => {
    if (!current) return
    const id = current.id
    setSkipped((s) => new Set(s).add(id))
    // Nästa aktiva efter den nuvarande, annars första aktiva
    const after = list.slice(currentIndex + 1).find((e) => !skipped.has(e.id) && e.id !== id) ?? list.find((e) => !skipped.has(e.id) && e.id !== id) ?? list[currentIndex + 1] ?? list[0]
    setCurrentId(after?.id ?? null)
  }

  const edit = () => current && router.push(`/events/${current.id}/edit`)

  const approveAllGood = async () => {
    const good = queue.filter((e) => (e.quality_score ?? 0) >= 80)
    if (good.length === 0) return
    const ok = await confirm({ title: `Godkänn ${good.length} event?`, description: 'Alla event i kön med kvalitetspoäng 80 eller högre publiceras direkt.', confirmLabel: 'Publicera alla' })
    if (!ok) return
    setProcessing(true)
    try {
      const ids = good.map((e) => e.id)
      const { error } = await supabase.from('events').update({ status: 'published', updated_at: new Date().toISOString() }).in('id', ids)
      if (error) throw error
      setQueue((q) => q.filter((e) => !ids.includes(e.id)))
      setDone((n) => n + ids.length)
      if (current && ids.includes(current.id)) setCurrentId(null)
      toast.success(`${ids.length} event publicerade`)
    } catch (e) {
      toast.error('Kunde inte publicera', e instanceof Error ? e.message : undefined)
    } finally {
      setProcessing(false)
    }
  }

  const mergeKeepCurrent = async (m: DupeMatch) => {
    if (!current) return
    const ok = await confirm({ title: 'Slå ihop och behåll det här eventet?', description: `Det publicerade eventet ”${m.name}” tas bort permanent. Det här eventet behåller du i kön.`, confirmLabel: 'Ta bort dubletten', destructive: true })
    if (!ok) return
    const { error } = await supabase.from('events').delete().eq('id', m.id)
    if (error) return toast.error('Kunde inte ta bort dubletten', error.message)
    setDupes((d) => d.filter((x) => x.id !== m.id))
    toast.success('Dubletten borttagen', m.name)
  }

  const suggestCategories = async () => {
    if (!current) return
    setSuggesting(true)
    try {
      const res = await fetch('/api/admin/events/suggest-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: val('name'), description: val('description'), venue_name: val('venue_name') }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Fel')
      const cats = (json.categories as string[]).filter((c) => c !== 'Okategoriserad') as EventCategory[]
      if (cats.length === 0) return toast.info('AI:n kunde inte föreslå någon kategori')
      setEdited((p) => ({ ...p, categories: cats.slice(0, 3), category_scores: json.scores || {} }))
      toast.success('Kategorier föreslagna', cats.join(', '))
    } catch (e) {
      toast.error('Kunde inte föreslå kategorier', e instanceof Error ? e.message : undefined)
    } finally {
      setSuggesting(false)
    }
  }

  const goodCount = queue.filter((e) => (e.quality_score ?? 0) >= 80).length

  useHotkeys(
    useMemo(
      () => ({
        j: () => skip(),
        k: () => prev(),
        a: () => approve(),
        r: () => reject(),
        e: () => edit(),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [current?.id, currentIndex, list, dirty, edited, processing, skipped]
    ),
    !!current
  )

  // ---- Render ----
  if (loading) return <LoadingState label="Hämtar kön…" />
  if (error) return <ErrorState description={error} onRetry={load} />

  const totalToday = initialTotal
  const progress = totalToday ? Math.round((done / totalToday) * 100) : 0

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">Granska</h1>
        <p className="text-sm text-ink-soft">Nya event från scrapers och tips som väntar på ett beslut.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="hidden items-center gap-1.5 text-[13px] text-ink-soft xl:inline-flex">
          <Kbd>J</Kbd> hoppa över · <Kbd>K</Kbd> föregående · <Kbd>A</Kbd> godkänn · <Kbd>R</Kbd> avvisa · <Kbd>E</Kbd> redigera
        </span>
        <Button variant="secondary" disabled={goodCount === 0 || processing} onClick={approveAllGood}>
          Godkänn alla med poäng ≥ 80 ({goodCount})
        </Button>
      </div>
    </div>
  )

  if (queue.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Card>
          <EmptyState
            icon={<CheckCircle2 />}
            title="Allt granskat"
            description={done > 0 ? `${done} event hanterade i den här sessionen. Inget mer väntar.` : 'Inget event väntar på granskning just nu.'}
            action={
              <Button asChild variant="secondary">
                <Link href="/events">Till alla events</Link>
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  const c = current
  const categories = (c ? (val('categories') ?? []) : []) as EventCategory[]
  const pickedCategories = categories.filter((cat) => cat !== 'Okategoriserad')
  const issues = (c?.quality_issues ?? '')
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const checks = c
    ? [
        { ok: new Date(c.date_time) > new Date(), label: 'Datum i framtiden' },
        { ok: !!val('image_url'), label: 'Bild finns' },
        { ok: !!c.organizer_id, label: c.organizer ? `Arrangör kopplad (${c.organizer.name})` : 'Arrangör kopplad' },
        { ok: (val('description')?.length ?? 0) >= 50, label: 'Beskrivning minst 50 tecken' },
        { ok: categories.length > 0 && !categories.includes('Okategoriserad'), label: 'Kategoriserat' },
      ]
    : []

  return (
    <div className="flex flex-col gap-5">
      {header}

      <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
        {/* Kö */}
        <Card className="hidden max-h-[calc(100vh-200px)] flex-col overflow-hidden lg:flex">
          <div className="flex flex-col gap-2.5 border-b border-line px-5 pb-3 pt-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">{list.length} att granska</h2>
              <span className="text-xs text-ink-muted">
                {done} av {totalToday} klara i dag
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-stone">
              <div className="h-full bg-sea transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <SelectFilter label="Källa" value={source} options={sources} onChange={setSource} allLabel="Alla källor" />
              <SelectFilter
                label="Sortera"
                value={sort}
                options={[
                  { value: 'score', label: 'lägst poäng först' },
                  { value: 'newest', label: 'nyast först' },
                ]}
                onChange={(v) => setSort((v as 'score' | 'newest') || 'score')}
              />
            </div>
          </div>
          <div className="thin-scroll flex flex-col overflow-y-auto">
            {list.map((e) => {
              const active = e.id === c?.id
              const isSkipped = skipped.has(e.id)
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setCurrentId(e.id)}
                  className={cn(
                    'flex items-center gap-3 border-b border-l-[3px] border-b-line-soft px-4 py-3 text-left transition-colors',
                    active ? 'border-l-sea bg-sea-lightest' : 'border-l-transparent hover:bg-sand-soft',
                    isSkipped && 'opacity-60'
                  )}
                >
                  <Thumb src={e.image_url} size={44} className="rounded-lg" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-medium text-ink">{e.name}</span>
                    <span className="truncate text-xs text-ink-muted">
                      {sourceOf(e)} · {formatDay(e.date_time)}
                      {isSkipped ? ' · hoppad' : ''}
                    </span>
                  </div>
                  <QualityDot score={e.quality_score} />
                </button>
              )
            })}
          </div>
        </Card>

        {/* Granskning */}
        {c ? (
          <div className="flex flex-col gap-4 pb-20 lg:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryChip muted>{sourceOf(c)}</CategoryChip>
                  <StatusBadge domain="event" value={c.status} />
                  <span className="text-xs text-ink-muted">
                    importerad {formatRelative(c.created_at)} · {currentIndex + 1} av {list.length}
                  </span>
                </div>
                <h2 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{val('name')}</h2>
                <span className="text-sm text-ink-soft">
                  {formatDay(val('date_time'))} · {formatTime(val('date_time'))} · {val('venue_name') || '–'}
                  {c.location ? `, ${c.location}` : ''}
                  {c.price ? ` · ${c.price}` : ''}
                </span>
              </div>
              <span className={cn('inline-flex items-center gap-2 rounded-[10px] border border-line bg-white px-3 py-2 font-mono text-sm font-medium text-ink')}>
                <span className={cn('size-2 rounded-full', toneClasses[qualityTone(c.quality_score)].dot)} />
                {c.quality_score ?? '–'} / 100
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
              <div className="flex flex-col gap-3">
                <div className="relative aspect-square w-full overflow-hidden rounded-[12px] bg-amber-light md:w-[300px]">
                  {val('image_url') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={val('image_url') as string} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 text-amber">
                      <ImageIcon className="size-8" />
                      <span className="text-xs font-medium">Bild saknas</span>
                    </div>
                  )}
                  <span className="absolute bottom-2.5 left-2.5 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-medium text-white">1:1-beskärning för Instagram</span>
                </div>
                <Field label="Bild-URL" htmlFor="rv-image">
                  <Input id="rv-image" value={val('image_url') ?? ''} onChange={(e) => setField('image_url', e.target.value)} placeholder="https://…" />
                </Field>
                {c.organizer_event_url ? (
                  <a href={c.organizer_event_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-sea hover:text-sea-dark">
                    <ExternalLink className="size-3.5" />
                    Öppna källan hos arrangören
                  </a>
                ) : null}
              </div>

              <div className="flex flex-col gap-3">
                <Card>
                  <CardBody className="flex flex-col gap-3">
                    <SectionLabel>Uppgifter</SectionLabel>
                    <Field label="Namn" htmlFor="rv-name">
                      <Input id="rv-name" value={val('name') ?? ''} onChange={(e) => setField('name', e.target.value)} />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Datum och tid" htmlFor="rv-date">
                        <Input id="rv-date" type="datetime-local" value={toDateTimeLocalInput(val('date_time'))} onChange={(e) => e.target.value && setField('date_time', new Date(e.target.value).toISOString())} />
                      </Field>
                      <Field label="Platsnamn" htmlFor="rv-venue">
                        <Input id="rv-venue" value={val('venue_name') ?? ''} onChange={(e) => setField('venue_name', e.target.value)} />
                      </Field>
                    </div>
                    <Field label="Beskrivning" htmlFor="rv-desc" help={`${val('description')?.length ?? 0} tecken`}>
                      <Textarea id="rv-desc" rows={5} value={val('description') ?? ''} onChange={(e) => setField('description', e.target.value)} />
                    </Field>
                    {dirty ? (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" loading={processing} onClick={saveChanges}>
                          Spara ändringar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEdited({})}>
                          Ångra
                        </Button>
                      </div>
                    ) : null}
                  </CardBody>
                </Card>

                <Card>
                  <CardBody className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <SectionLabel>Kategorier</SectionLabel>
                      <Button size="sm" variant="secondary" loading={suggesting} onClick={suggestCategories}>
                        <Sparkles className="text-sea" />
                        Föreslå med AI
                      </Button>
                    </div>
                    <CategoryPicker value={pickedCategories} onChange={(v) => setField('categories', v)} scores={val('category_scores')} />
                    <span className="text-xs text-ink-muted">Max 3. ★ = huvudkategori, klicka på en vald kategori för att göra den till huvud. Siffran är AI:ns säkerhet.</span>
                  </CardBody>
                </Card>

                <div className="grid gap-3 md:grid-cols-2">
                  <Card>
                    <CardBody className="flex flex-col gap-2">
                      <SectionLabel>Kvalitetskontroll</SectionLabel>
                      {checks.map((ch) => (
                        <span key={ch.label} className={cn('flex items-center gap-2 text-[13px]', ch.ok ? 'text-ink' : 'text-amber')}>
                          {ch.ok ? <Check className="size-3.5 text-kelp" strokeWidth={2.5} /> : <AlertTriangle className="size-3.5" />}
                          {ch.label}
                        </span>
                      ))}
                      {issues.map((i) => (
                        <span key={i} className="flex items-center gap-2 text-[13px] text-poppy">
                          <AlertTriangle className="size-3.5" />
                          {i}
                        </span>
                      ))}
                    </CardBody>
                  </Card>

                  {visibleDupes.length > 0 ? (
                    <Banner
                      tone="wait"
                      title={`Möjlig dublett · ${Math.round(visibleDupes[0].similarity * 100)} %`}
                      actions={
                        <>
                          <button type="button" onClick={() => mergeKeepCurrent(visibleDupes[0])} className="rounded-md border border-amber-line bg-white px-2.5 py-1 text-xs font-medium text-amber hover:bg-amber-light">
                            Slå ihop, behåll den här
                          </button>
                          <button type="button" onClick={() => setDismissedDupes((s) => new Set(s).add(`${c.id}-${visibleDupes[0].id}`))} className="px-1 text-xs font-medium text-amber">
                            Inte dublett
                          </button>
                          <Link href={`/events/${visibleDupes[0].id}/edit`} className="px-1 text-xs font-medium text-amber">
                            Öppna
                          </Link>
                        </>
                      }
                    >
                      ”{visibleDupes[0].name}” · {visibleDupes[0].organizer?.name ?? visibleDupes[0].venue_name ?? ''} · publicerad · {formatDay(visibleDupes[0].date_time)} {formatTime(visibleDupes[0].date_time)}
                    </Banner>
                  ) : (
                    <Card>
                      <CardBody className="flex flex-col gap-1.5">
                        <SectionLabel>Dublettkontroll</SectionLabel>
                        <span className="flex items-center gap-2 text-[13px] text-ink">
                          <Check className="size-3.5 text-kelp" strokeWidth={2.5} />
                          Inget publicerat event med liknande namn samma dag
                        </span>
                      </CardBody>
                    </Card>
                  )}
                </div>
              </div>
            </div>

            {/* Åtgärder – desktop */}
            <div className="hidden items-center justify-between border-t border-line pt-4 lg:flex">
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="lg" onClick={prev} disabled={currentIndex <= 0}>
                  <ChevronLeft className="size-4" />
                  Föregående <Kbd>K</Kbd>
                </Button>
                <Button variant="secondary" size="lg" onClick={skip}>
                  Hoppa över <Kbd>J</Kbd>
                </Button>
                <Button variant="secondary" size="lg" onClick={edit}>
                  <Pencil className="size-4" />
                  Redigera <Kbd>E</Kbd>
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="destructive" size="lg" onClick={reject} disabled={processing}>
                  Avvisa <Kbd>R</Kbd>
                </Button>
                <Button variant="success" size="lg" onClick={approve} loading={processing}>
                  Godkänn och publicera <Kbd onDark>A</Kbd>
                </Button>
              </div>
            </div>

            {/* Åtgärder – mobil */}
            <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-sand px-4 pb-6 pt-3 lg:hidden">
              <Button variant="destructive" className="h-12 flex-1 text-[15px]" onClick={reject} disabled={processing}>
                Avvisa
              </Button>
              <Button variant="secondary" className="size-12" aria-label="Hoppa över" onClick={skip}>
                <ChevronRight className="size-5" />
              </Button>
              <Button variant="success" className="h-12 flex-[2] text-[15px]" onClick={approve} loading={processing}>
                Godkänn och publicera
              </Button>
            </div>
          </div>
        ) : (
          <Card>
            <EmptyState title="Inget event matchar filtret" description="Byt källa eller rensa filtret för att se resten av kön." action={<Button variant="secondary" onClick={() => setSource('')}>Visa alla källor</Button>} />
          </Card>
        )}
      </div>

      {/* Läge/progress på mobil */}
      {c ? (
        <span className="text-center text-xs text-ink-muted lg:hidden">
          {currentIndex + 1} / {list.length} · {done} klara i dag
        </span>
      ) : null}
    </div>
  )
}
