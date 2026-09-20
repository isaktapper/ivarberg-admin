'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase'
import { organizerSchema, OrganizerFormData } from '@/lib/validations'
import { Organizer, OrganizerStatus } from '@/types/database'
import GooglePlacesAutocomplete from '@/components/GooglePlacesAutocomplete'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input, Select, inputBase } from '@/components/ui/input'
import { TagInput } from '@/components/ui/tag-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { statusOptions } from '@/lib/status'
import { cn } from '@/lib/utils'

/**
 * Delat formulär för ny/redigera arrangör.
 * Redigering: status-fält + "publicera utkast-event?"-dialog när pending → active.
 */
export function OrganizerForm({ organizer }: { organizer?: Organizer }) {
  const router = useRouter()
  const toast = useToast()
  const isEdit = !!organizer
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<OrganizerStatus>(organizer?.status ?? 'active')
  const [alternativeNames, setAlternativeNames] = useState<string[]>(organizer?.alternative_names ?? [])
  const [publishDialog, setPublishDialog] = useState<{ count: number; data: OrganizerFormData } | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
  } = useForm<OrganizerFormData>({
    resolver: zodResolver(organizerSchema),
    defaultValues: {
      name: organizer?.name ?? '',
      location: organizer?.location ?? '',
      venue_name: organizer?.venue_name ?? '',
      phone: organizer?.phone ?? '',
      email: organizer?.email ?? '',
      website: organizer?.website ?? '',
      alternative_names: organizer?.alternative_names ?? [],
    },
  })

  useEffect(() => {
    setValue('alternative_names', alternativeNames)
  }, [alternativeNames, setValue])

  // Varna vid osparade ändringar
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const save = async (data: OrganizerFormData, publishEvents: boolean) => {
    setSaving(true)
    try {
      const payload = {
        name: data.name,
        location: data.location || null,
        venue_name: data.venue_name || null,
        phone: data.phone || null,
        email: data.email || null,
        website: data.website || null,
        alternative_names: alternativeNames.length > 0 ? alternativeNames : null,
      }

      if (isEdit) {
        const { error } = await supabase
          .from('organizers')
          .update({
            ...payload,
            status,
            needs_review: status === 'pending', // Endast pending behöver review
            updated_at: new Date().toISOString(),
          })
          .eq('id', organizer.id)
        if (error) throw error

        if (publishEvents && status === 'active') {
          const { error: eventsError } = await supabase.from('events').update({ status: 'published' }).eq('organizer_id', organizer.id).eq('status', 'draft')
          if (eventsError) {
            toast.error('Arrangören sparades, men utkasten kunde inte publiceras', eventsError.message)
          } else {
            toast.success('Utkasten publicerades')
          }
        }
        toast.success('Arrangören sparad')
        router.push(`/organizers/${organizer.id}`)
      } else {
        const { data: created, error } = await supabase.from('organizers').insert([payload]).select('id').single()
        if (error) throw error
        toast.success('Arrangör skapad')
        router.push(created ? `/organizers/${created.id}` : '/organizers')
      }
    } catch (error) {
      toast.error(isEdit ? 'Kunde inte spara arrangören' : 'Kunde inte skapa arrangören', error instanceof Error ? error.message : 'Okänt fel')
    } finally {
      setSaving(false)
      setPublishDialog(null)
    }
  }

  const onSubmit = async (data: OrganizerFormData) => {
    // Pending → active: fråga om utkast-event ska publiceras samtidigt
    if (isEdit && organizer.status === 'pending' && status === 'active') {
      const { count, error } = await supabase.from('events').select('id', { count: 'exact', head: true }).eq('organizer_id', organizer.id).eq('status', 'draft')
      if (!error && (count ?? 0) > 0) {
        setPublishDialog({ count: count ?? 0, data })
        return
      }
    }
    await save(data, false)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Grunduppgifter" />
            <CardBody className="flex flex-col gap-4">
              <Field label="Namn" htmlFor="org-name" required error={errors.name?.message}>
                <Input id="org-name" {...register('name')} aria-invalid={!!errors.name} placeholder="t.ex. Varbergs Teater" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Platsnamn" htmlFor="org-venue" help="Standardplats för arrangörens event" error={errors.venue_name?.message}>
                  <Input id="org-venue" {...register('venue_name')} placeholder="t.ex. Societetshuset" />
                </Field>
                <Field label="Adress" htmlFor="org-location" error={errors.location?.message}>
                  <GooglePlacesAutocomplete
                    value={watch('location') || ''}
                    onChange={(v) => setValue('location', v, { shouldDirty: true })}
                    placeholder="Sök efter plats…"
                    className={inputBase}
                    name="location"
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Kontakt" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Telefon" htmlFor="org-phone" error={errors.phone?.message}>
                <Input id="org-phone" type="tel" {...register('phone')} placeholder="0340-…" />
              </Field>
              <Field label="E-post" htmlFor="org-email" error={errors.email?.message}>
                <Input id="org-email" type="email" {...register('email')} aria-invalid={!!errors.email} placeholder="info@…" />
              </Field>
              <Field label="Webbsida" htmlFor="org-website" className="sm:col-span-2" error={errors.website?.message} help="Krävs för att kunna skapa en arrangörssida automatiskt">
                <Input id="org-website" type="url" {...register('website')} aria-invalid={!!errors.website} placeholder="https://…" />
              </Field>
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Matchning" description="Scrapern kopplar event till arrangören via namnet eller något av aliasen." />
            <CardBody>
              <Field label="Alternativa namn" htmlFor="org-alias" help="Enter eller komma lägger till. T.ex. ”Sparbankshallen”, ”Rotundan”.">
                <TagInput id="org-alias" value={alternativeNames} onChange={setAlternativeNames} placeholder="Lägg till alias…" />
              </Field>
            </CardBody>
          </Card>

          {isEdit ? (
            <Card>
              <CardHeader title="Status" />
              <CardBody>
                <Field label="Status" htmlFor="org-status" help={status === 'pending' ? 'Väntande arrangörers event hamnar som utkast tills arrangören godkänns.' : status === 'archived' ? 'Arkiverade arrangörer visas inte i listor.' : undefined}>
                  <Select id="org-status" value={status} onChange={(e) => setStatus(e.target.value as OrganizerStatus)}>
                    {statusOptions('organizer').map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <div className={cn('sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-line bg-white px-4 py-3 md:-mx-8 md:px-8')}>
        <Button asChild variant="ghost">
          <Link href={isEdit ? `/organizers/${organizer.id}` : '/organizers'}>Avbryt</Link>
        </Button>
        <Button type="submit" loading={saving}>
          {isEdit ? 'Spara' : 'Skapa arrangör'}
        </Button>
      </div>

      <Dialog open={!!publishDialog} onOpenChange={(o) => !o && setPublishDialog(null)}>
        {publishDialog ? (
          <DialogContent
            size="sm"
            title="Publicera utkast också?"
            description={`Arrangören har ${publishDialog.count} event som utkast. Vill du publicera dem samtidigt som arrangören aktiveras?`}
            footer={
              <>
                <Button variant="ghost" onClick={() => save(publishDialog.data, false)} loading={saving}>
                  Bara arrangören
                </Button>
                <Button onClick={() => save(publishDialog.data, true)} loading={saving}>
                  Publicera {publishDialog.count} event
                </Button>
              </>
            }
          >
            <span className="text-[13px] text-ink-soft">Utkasten blir synliga på ivarberg.nu direkt.</span>
          </DialogContent>
        ) : null}
      </Dialog>
    </form>
  )
}
