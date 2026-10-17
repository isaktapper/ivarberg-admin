'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ExternalLink, MoreHorizontal, Trash2, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { eventSchema, type EventFormData, eventStatuses } from '@/lib/validations'
import { EVENT_AREAS, type EventArea, resolveArea } from '@/lib/services/areaResolver'
import { resolveIsFree } from '@/lib/services/priceResolver'
import { getStatus } from '@/lib/status'
import { getFrontendUrl } from '@/lib/utils'
import type { Event, EventCategory, Organizer } from '@/types/database'
import GooglePlacesAutocomplete from '@/components/GooglePlacesAutocomplete'
import OrganizerSearchableDropdown from '@/components/OrganizerSearchableDropdown'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input, Select, Checkbox, inputBase } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/tabs'
import { CategoryPicker } from '@/components/ui/category-picker'
import { TagInput } from '@/components/ui/tag-input'
import { StatusBadge } from '@/components/ui/status-badge'
import { Kbd } from '@/components/ui/kbd'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useHotkeys } from '@/hooks/use-hotkeys'
import { cn } from '@/lib/utils'
import { MarkdownTextarea } from './MarkdownTextarea'
import { ImageField } from './ImageField'
import { PreviewCard, QualityCard, AiHelpCard, DuplicateWarning, HistoryCard, type SidebarValues } from './EventSidebar'

type IsFree = 'auto' | 'free' | 'paid'

function toDefaults(event?: Event | null): EventFormData {
  return {
    event_id: event?.event_id ?? '',
    name: event?.name ?? '',
    description: event?.description ?? '',
    date_time: event?.date_time ? event.date_time.slice(0, 16) : '',
    location: event?.location ?? '',
    venue_name: event?.venue_name ?? '',
    area: (event?.area as EventArea) ?? '',
    price: event?.price ?? '',
    is_free: event ? (event.is_free === true ? 'free' : event.is_free === false ? 'paid' : 'auto') : 'auto',
    image_url: event?.image_url ?? '',
    organizer_event_url: event?.organizer_event_url ?? '',
    booking_url: event?.booking_url ?? '',
    event_website: event?.event_website ?? '',
    categories: (event?.categories ?? []) as EventCategory[],
    organizer_id: event?.organizer_id ?? undefined,
    featured: event?.featured ?? false,
    status: event?.status ?? 'draft',
    max_participants: event?.max_participants ?? undefined,
    tags: event?.tags ?? [],
  }
}

/** Bygger payloaden till events-tabellen från formulärvärdena (samma semantik som de gamla sidorna). */
function toPayload(data: EventFormData) {
  const categories = data.categories && data.categories.length > 0 ? data.categories : (['Okategoriserad'] as EventCategory[])
  return {
    name: data.name,
    description: data.description || null,
    date_time: data.date_time,
    location: data.location,
    venue_name: data.venue_name || null,
    area: data.area || resolveArea(data.location, data.venue_name),
    price: data.price || null,
    is_free: data.is_free === 'free' ? true : data.is_free === 'paid' ? false : resolveIsFree(data.price),
    image_url: data.image_url || null,
    organizer_event_url: data.organizer_event_url || null,
    booking_url: data.booking_url || null,
    event_website: data.event_website || null,
    category: categories[0], // bakåtkompatibilitet
    categories,
    organizer_id: data.organizer_id || null,
    featured: data.featured,
    is_featured: data.featured,
    status: data.status,
    max_participants: data.max_participants || null,
    tags: data.tags ?? [],
  }
}

export function EventForm({ mode, event, onSaved }: { mode: 'create' | 'edit'; event?: Event | null; onSaved?: (id: number) => void }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [organizers, setOrganizers] = React.useState<Organizer[]>([])
  const [saving, setSaving] = React.useState(false)
  const [scores, setScores] = React.useState<Record<string, number> | null>(event?.category_scores ?? null)

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: toDefaults(event),
  })
  const { register, handleSubmit, setValue, watch, formState, reset } = form
  const { errors, isDirty } = formState

  React.useEffect(() => {
    if (event) reset(toDefaults(event))
  }, [event, reset])

  React.useEffect(() => {
    supabase
      .from('organizers')
      .select('*')
      .order('name')
      .then(({ data }) => setOrganizers(data ?? []))
  }, [])

  // Varna vid lämna sidan med osparade ändringar
  React.useEffect(() => {
    if (!isDirty) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [isDirty])

  const v = watch()
  const dateTime = v.date_time || ''
  const datePart = dateTime.slice(0, 10)
  const timePart = dateTime.slice(11, 16)
  const setDateTime = (d: string, t: string) => setValue('date_time', d && t ? `${d}T${t}` : d ? `${d}T00:00` : '', { shouldDirty: true, shouldValidate: true })

  const resolvedArea = React.useMemo(() => resolveArea(v.location || '', v.venue_name || ''), [v.location, v.venue_name])

  const sidebarValues: SidebarValues = {
    name: v.name || '',
    description: v.description || '',
    date_time: v.date_time || '',
    venue_name: v.venue_name || '',
    location: v.location || '',
    image_url: v.image_url || '',
    price: v.price || '',
    is_free: (v.is_free as IsFree) || 'auto',
    categories: (v.categories || []) as EventCategory[],
  }

  const save = React.useCallback(
    async (data: EventFormData, statusOverride?: EventFormData['status']) => {
      setSaving(true)
      const payload = toPayload({ ...data, status: statusOverride ?? data.status })
      try {
        if (mode === 'create') {
          const { generateUniqueEventId } = await import('@/lib/event-id-generator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const eventId = await generateUniqueEventId(data.name, 'manual', supabase as any)
          const { data: inserted, error } = await supabase
            .from('events')
            .insert([{ ...payload, event_id: eventId }])
            .select('id')
            .single()
          if (error) throw error
          toast.success(statusOverride === 'published' ? 'Eventet är publicerat' : 'Eventet är sparat')
          reset(data)
          onSaved?.(inserted.id)
        } else if (event) {
          const { error } = await supabase
            .from('events')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', event.id)
          if (error) throw error
          toast.success(statusOverride === 'published' ? 'Eventet är publicerat' : 'Ändringarna är sparade')
          reset({ ...data, status: statusOverride ?? data.status })
          onSaved?.(event.id)
        }
      } catch (e) {
        const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Okänt fel'
        toast.error('Kunde inte spara eventet', msg)
      } finally {
        setSaving(false)
      }
    },
    [mode, event, onSaved, reset, toast]
  )

  const submit = React.useCallback(
    (statusOverride?: EventFormData['status']) =>
      handleSubmit(
        (data) => save(data, statusOverride),
        () => toast.error('Formuläret har fel', 'Kontrollera de markerade fälten.')
      )(),
    [handleSubmit, save, toast]
  )

  useHotkeys(React.useMemo(() => ({ 'mod+s': () => submit() }), [submit]))

  const remove = async () => {
    if (!event) return
    const ok = await confirm({ title: 'Ta bort eventet?', description: `”${event.name}” tas bort permanent. Det går inte att ångra.`, confirmLabel: 'Ta bort', destructive: true })
    if (!ok) return
    const { error } = await supabase.from('events').delete().eq('id', event.id)
    if (error) return toast.error('Kunde inte ta bort eventet', error.message)
    toast.success('Eventet är borttaget')
    router.push('/events')
  }

  const statusLabel = (s: string) => getStatus('event', s).label
  const isPublished = mode === 'edit' && event?.status === 'published'

  return (
    <div className="flex flex-col gap-5 pb-20">
      {/* Sidhuvud */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/events" className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink">
            <ArrowLeft className="size-3.5" />
            Alla events
          </Link>
          <span className="text-ink-faint">/</span>
          <h1 className="truncate font-display text-xl font-semibold text-ink">{mode === 'create' ? 'Nytt event' : event?.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge domain="event" value={v.status} />
          {isPublished && event ? (
            <Button asChild variant="secondary">
              <a href={`${getFrontendUrl()}/event/${event.event_id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Visa på ivarberg.nu
              </a>
            </Button>
          ) : null}
          {mode === 'edit' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="Fler åtgärder">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem destructive onSelect={remove}>
                  <Trash2 />
                  Ta bort event
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex flex-col gap-4"
        >
          {/* Grunduppgifter */}
          <Card>
            <CardHeader title="Grunduppgifter" />
            <CardBody className="flex flex-col gap-4">
              <Field label="Namn" htmlFor="f-name" required error={errors.name?.message}>
                <Input id="f-name" {...register('name')} aria-invalid={!!errors.name} placeholder="t.ex. Höstmarknad på Torget" />
              </Field>
              <Field
                label="Beskrivning"
                htmlFor="f-desc"
                error={errors.description?.message}
                help={`${(v.description || '').length} tecken · minst 100 rekommenderas för kvalitetspoäng`}
              >
                <MarkdownTextarea id="f-desc" value={v.description || ''} onChange={(t) => setValue('description', t, { shouldDirty: true })} />
              </Field>
              <Field label="Kategorier" required hint="1–3, första blir huvudkategori" error={errors.categories?.message as string | undefined}>
                <CategoryPicker value={(v.categories || []) as EventCategory[]} onChange={(c) => setValue('categories', c, { shouldDirty: true, shouldValidate: true })} scores={scores} />
              </Field>
            </CardBody>
          </Card>

          {/* När och var */}
          <Card>
            <CardHeader title="När och var" />
            <CardBody className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Datum" htmlFor="f-date" required error={errors.date_time?.message}>
                  <Input id="f-date" type="date" value={datePart} onChange={(e) => setDateTime(e.target.value, timePart)} aria-invalid={!!errors.date_time} />
                </Field>
                <Field label="Starttid" htmlFor="f-time" required>
                  <Input id="f-time" type="time" value={timePart} onChange={(e) => setDateTime(datePart, e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Platsnamn" htmlFor="f-venue" error={errors.venue_name?.message}>
                  <Input id="f-venue" {...register('venue_name')} placeholder="t.ex. Varbergs Teater" />
                </Field>
                <Field label="Adress" htmlFor="f-addr" required error={errors.location?.message} help="Välj en plats så fylls platsnamn och adress i automatiskt">
                  <div className={cn(inputBase, 'flex items-center gap-2 py-0', errors.location && 'border-poppy')}>
                    <MapPin className="size-[15px] shrink-0 text-ink-muted" />
                    <GooglePlacesAutocomplete
                      name="location"
                      value={v.location || ''}
                      onChange={(val) => setValue('location', val, { shouldDirty: true, shouldValidate: true })}
                      onVenueNameChange={(name) => setValue('venue_name', name, { shouldDirty: true })}
                      placeholder="Sök efter plats…"
                      className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                    />
                  </div>
                </Field>
              </div>
              <Field label="Område" htmlFor="f-area" help="Lämna på Auto så härleds området från adress och platsnamn när eventet sparas">
                <div className="flex items-center gap-2">
                  <Select id="f-area" {...register('area')} className="max-w-xs">
                    <option value="">Auto</option>
                    {EVENT_AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                  {!v.area ? (
                    <span className="whitespace-nowrap rounded-full bg-sea-light px-2 py-0.5 text-[11px] font-medium text-sea-dark">{resolvedArea ?? 'Okänt område'} · auto</span>
                  ) : null}
                </div>
              </Field>
            </CardBody>
          </Card>

          {/* Pris, biljetter och länkar */}
          <Card>
            <CardHeader title="Pris, biljetter och länkar" />
            <CardBody className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_260px]">
                <Field label="Pris" htmlFor="f-price" error={errors.price?.message}>
                  <Input id="f-price" {...register('price')} placeholder="t.ex. Gratis, 100 kr, 50–150 kr" />
                </Field>
                <Field label="Gratis-badge" help={v.is_free === 'auto' || !v.is_free ? 'Härleds från priset' : v.is_free === 'free' ? 'Visar gratis-badge publikt' : 'Ingen badge'}>
                  <Segmented
                    className="h-10 w-full [&>button]:flex-1 [&>button]:justify-center"
                    value={(v.is_free as IsFree) || 'auto'}
                    onChange={(val) => setValue('is_free', val as IsFree, { shouldDirty: true })}
                    items={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'free', label: 'Gratis' },
                      { value: 'paid', label: 'Kostar' },
                    ]}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Biljettlänk" htmlFor="f-book" error={errors.booking_url?.message} help={!v.booking_url ? 'Tomt. Besökare kan inte köpa biljett direkt från ivarberg.nu.' : undefined}>
                  <Input id="f-book" type="url" {...register('booking_url')} placeholder="https://…" aria-invalid={!!errors.booking_url} className={!v.booking_url ? 'border-poppy-line bg-[#FFF8F4]' : ''} />
                </Field>
                <Field label="Arrangörens eventsida" htmlFor="f-site" error={errors.event_website?.message} help="Visas aldrig som utlänk, används för hämtning och kontroll">
                  <Input id="f-site" type="url" {...register('event_website')} placeholder="https://…" aria-invalid={!!errors.event_website} />
                </Field>
              </div>
              <Field label="Käll-URL" hint="från scrapern" htmlFor="f-src" error={errors.organizer_event_url?.message}>
                <Input id="f-src" type="url" {...register('organizer_event_url')} placeholder="https://…" aria-invalid={!!errors.organizer_event_url} className="font-mono text-xs" />
              </Field>
            </CardBody>
          </Card>

          {/* Bild */}
          <Card>
            <CardHeader title="Bild" />
            <CardBody>
              <ImageField value={v.image_url || ''} onChange={(url) => setValue('image_url', url, { shouldDirty: true, shouldValidate: true })} />
              {errors.image_url?.message ? <span className="mt-2 block text-xs text-poppy">{errors.image_url.message}</span> : null}
            </CardBody>
          </Card>

          {/* Arrangör och synlighet */}
          <Card>
            <CardHeader title="Arrangör och synlighet" />
            <CardBody className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Arrangör" error={errors.organizer_id?.message}>
                  <OrganizerSearchableDropdown organizers={organizers} value={v.organizer_id ?? null} onChange={(id) => setValue('organizer_id', id ?? undefined, { shouldDirty: true })} placeholder="Välj arrangör…" showStatus />
                </Field>
                <Field label="Status" htmlFor="f-status" error={errors.status?.message}>
                  <Select id="f-status" {...register('status')}>
                    {eventStatuses.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Taggar" htmlFor="f-tags">
                  <TagInput id="f-tags" value={v.tags || []} onChange={(t) => setValue('tags', t, { shouldDirty: true })} />
                </Field>
                <Field label="Max antal deltagare" htmlFor="f-max" error={errors.max_participants?.message}>
                  <Input id="f-max" type="number" min={1} {...register('max_participants', { setValueAs: (val) => (val === '' || val == null ? undefined : Number(val)) })} />
                </Field>
              </div>
              <Checkbox label="Featured i listor" {...register('featured')} />
            </CardBody>
          </Card>
        </form>

        {/* Högerspalt */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <PreviewCard v={sidebarValues} />
          <QualityCard v={sidebarValues} />
          <AiHelpCard
            v={sidebarValues}
            onCategories={(cats, sc) => {
              setValue('categories', cats, { shouldDirty: true, shouldValidate: true })
              setScores(sc)
            }}
            onDescription={(text) => setValue('description', text, { shouldDirty: true })}
          />
          <DuplicateWarning name={v.name || ''} dateTime={v.date_time || ''} excludeId={event?.id} />
          {mode === 'edit' && event ? <HistoryCard eventId={event.event_id} /> : null}
        </aside>
      </div>

      {/* Sparrad */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-between border-t border-line bg-white px-4 md:left-60 md:px-8">
        <span className="hidden items-center gap-2 text-[13px] text-ink-soft sm:inline-flex">
          {isDirty ? (
            <>
              <span className="size-2 rounded-full bg-amber" />
              Osparade ändringar
            </>
          ) : (
            <>
              <span className="size-2 rounded-full bg-kelp" />
              Allt sparat
            </>
          )}
          <span className="text-ink-faint">·</span>
          <Kbd>⌘S</Kbd> sparar
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={() => router.push('/events')}>
            Avbryt
          </Button>
          <Button type="button" variant="secondary" loading={saving} onClick={() => submit(mode === 'create' ? 'draft' : undefined)}>
            {mode === 'create' ? 'Spara som utkast' : 'Spara'}
          </Button>
          <Button type="button" loading={saving} onClick={() => submit('published')}>
            Spara och publicera
          </Button>
        </div>
      </div>
    </div>
  )
}
