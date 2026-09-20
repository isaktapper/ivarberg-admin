'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, GripVertical, ImageOff, Star, X, ArrowDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { OrganizerPage, ContactInfo, SocialLinks, Organizer } from '@/types/database'
import { getFrontendUrl } from '@/lib/utils'
import { formatRelative } from '@/lib/format'
import OrganizerSearchableDropdown from '@/components/OrganizerSearchableDropdown'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input, Textarea, Checkbox } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/** Proxa externa bilder för att undvika CORS/hotlink-block */
export function getProxiedImageUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return `/api/image-proxy?url=${encodeURIComponent(url)}`
  return url
}

export function generateSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

interface FormData {
  name: string
  slug: string
  title: string
  description: string
  content: string
  hero_image_url: string
  gallery_images: string[]
  contact_info: ContactInfo
  social_links: SocialLinks
  seo_title: string
  seo_description: string
  seo_keywords: string
  is_published: boolean
}

const EMPTY: FormData = {
  name: '',
  slug: '',
  title: '',
  description: '',
  content: '',
  hero_image_url: '',
  gallery_images: [],
  contact_info: { email: '', phone: '', website: '', address: '' },
  social_links: { facebook: '', instagram: '', twitter: '', linkedin: '', youtube: '' },
  seo_title: '',
  seo_description: '',
  seo_keywords: '',
  is_published: false,
}

function fromPage(p: OrganizerPage): FormData {
  return {
    name: p.name || '',
    slug: p.slug || '',
    title: p.title || '',
    description: p.description || '',
    content: p.content || '',
    hero_image_url: p.hero_image_url || '',
    gallery_images: p.gallery_images || [],
    contact_info: { ...EMPTY.contact_info, ...(p.contact_info || {}) },
    social_links: { ...EMPTY.social_links, ...(p.social_links || {}) },
    seo_title: p.seo_title || '',
    seo_description: p.seo_description || '',
    seo_keywords: p.seo_keywords || '',
    is_published: !!p.is_published,
  }
}

/**
 * Delat formulär för ny/redigera arrangörssida.
 * `page` = redigera, `presetOrganizerId` = förifyll från arrangör (ny sida).
 */
export function OrganizerPageForm({ page, presetOrganizerId }: { page?: OrganizerPage; presetOrganizerId?: number | null }) {
  const router = useRouter()
  const toast = useToast()
  const isEdit = !!page

  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [organizerId, setOrganizerId] = useState<number | null>(page?.organizer_id ?? presetOrganizerId ?? null)
  const [form, setForm] = useState<FormData>(page ? fromPage(page) : EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [newGalleryImage, setNewGalleryImage] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [broken, setBroken] = useState<Set<string>>(new Set())

  const patch = useCallback((p: Partial<FormData>) => {
    setForm((prev) => ({ ...prev, ...p }))
    setDirty(true)
  }, [])

  useEffect(() => {
    supabase
      .from('organizers')
      .select('*')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => setOrganizers(data ?? []))
  }, [])

  const fillFromOrganizer = useCallback(
    async (id: number) => {
      const { data } = await supabase.from('organizers').select('*').eq('id', id).single()
      if (!data) return
      patch({
        name: data.name,
        slug: generateSlug(data.name),
        title: data.name,
        description: `Upptäck evenemang från ${data.name} i Varberg.`,
        contact_info: { email: data.email || '', phone: data.phone || '', website: data.website || '', address: data.location || '' },
        seo_title: data.name,
        seo_description: `Upptäck evenemang från ${data.name} i Varberg.`,
        seo_keywords: `${data.name}, evenemang, varberg`,
      })
    },
    [patch]
  )

  // Ny sida med ?organizer_id → förifyll
  useEffect(() => {
    if (!isEdit && presetOrganizerId) fillFromOrganizer(presetOrganizerId)
  }, [isEdit, presetOrganizerId, fillFromOrganizer])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const handleOrganizerChange = (id: number | null) => {
    setOrganizerId(id)
    setDirty(true)
    if (id && !isEdit) fillFromOrganizer(id)
  }

  const handleSlugChange = (value: string) => {
    setErrors((prev) => ({ ...prev, slug: value && !/^[a-z0-9-]+$/.test(value) ? 'Bara små bokstäver, siffror och bindestreck' : '' }))
    patch({ slug: value })
  }

  const checkSlugUnique = async () => {
    if (!form.slug || errors.slug) return
    let q = supabase.from('organizer_pages').select('id', { count: 'exact', head: true }).eq('slug', form.slug)
    if (isEdit) q = q.neq('id', page.id)
    const { count } = await q
    if ((count ?? 0) > 0) setErrors((prev) => ({ ...prev, slug: 'En sida med denna slug finns redan' }))
  }

  // ---- galleri ---------------------------------------------------------
  const addGalleryImage = () => {
    const url = newGalleryImage.trim()
    if (!url) return
    patch({ gallery_images: [...form.gallery_images, url] })
    setNewGalleryImage('')
  }
  const removeGalleryImage = (i: number) => patch({ gallery_images: form.gallery_images.filter((_, idx) => idx !== i) })
  const moveImageToHero = (i: number) => {
    const url = form.gallery_images[i]
    if (!url) return
    patch({ hero_image_url: url, gallery_images: [...(form.hero_image_url ? [form.hero_image_url] : []), ...form.gallery_images.filter((_, idx) => idx !== i)] })
  }
  const moveHeroToGallery = () => form.hero_image_url && patch({ gallery_images: [...form.gallery_images, form.hero_image_url], hero_image_url: '' })
  const reorder = (from: number, to: number) => {
    const next = [...form.gallery_images]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    patch({ gallery_images: next })
  }

  // ---- spara -----------------------------------------------------------
  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Namn är obligatoriskt'
    if (!form.slug.trim()) e.slug = 'Slug är obligatoriskt'
    else if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = 'Bara små bokstäver, siffror och bindestreck'
    if (!form.title.trim()) e.title = 'Titel är obligatoriskt'
    if (!form.description.trim()) e.description = 'Beskrivning är obligatoriskt'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = async (publish?: boolean) => {
    if (!validate()) {
      toast.error('Formuläret har fel', 'Rätta de markerade fälten.')
      return
    }
    const is_published = publish ?? form.is_published
    setSaving(true)
    try {
      const payload = { ...form, organizer_id: organizerId, is_published }
      if (isEdit) {
        const { error } = await supabase.from('organizer_pages').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', page.id)
        if (error) throw error
        setForm((prev) => ({ ...prev, is_published }))
        setDirty(false)
        toast.success(is_published ? 'Sidan sparad och publicerad' : 'Sidan sparad')
      } else {
        const { data, error } = await supabase.from('organizer_pages').insert(payload).select().single()
        if (error) throw error
        setDirty(false)
        toast.success(is_published ? 'Sidan skapad och publicerad' : 'Sidan skapad som utkast')
        if (data) router.push(`/organizer-pages/${data.id}/edit`)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('duplicate key')) {
        setErrors((prev) => ({ ...prev, slug: 'En sida med denna slug finns redan' }))
        toast.error('Slug är upptagen', 'Välj en annan slug.')
      } else toast.error(isEdit ? 'Kunde inte spara sidan' : 'Kunde inte skapa sidan', msg)
    } finally {
      setSaving(false)
    }
  }

  const publicUrl = `${getFrontendUrl()}/arrangor/${form.slug || '…'}`
  const img = (url: string, cls: string) =>
    broken.has(url) ? (
      <span className={cn('flex items-center justify-center bg-stone text-ink-faint', cls)}>
        <ImageOff className="size-5" />
      </span>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={getProxiedImageUrl(url)} alt="" className={cn('object-cover', cls)} onError={() => setBroken((b) => new Set(b).add(url))} />
    )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Innehåll" />
            <CardBody className="flex flex-col gap-4">
              <Field label="Arrangör" help={isEdit ? 'Sidan kopplas till arrangörens event.' : 'Väljer du en arrangör förifylls fälten nedan.'}>
                <OrganizerSearchableDropdown organizers={organizers} value={organizerId} onChange={handleOrganizerChange} placeholder="Välj arrangör…" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Namn" htmlFor="p-name" required error={errors.name}>
                  <Input id="p-name" value={form.name} aria-invalid={!!errors.name} onChange={(e) => patch({ name: e.target.value, slug: form.slug || generateSlug(e.target.value) })} />
                </Field>
                <Field label="Slug" htmlFor="p-slug" required error={errors.slug} help={<span className="font-mono">{publicUrl}</span>}>
                  <Input id="p-slug" value={form.slug} aria-invalid={!!errors.slug} onChange={(e) => handleSlugChange(e.target.value)} onBlur={checkSlugUnique} className="font-mono text-[13px]" />
                </Field>
              </div>
              <Field label="Titel" htmlFor="p-title" required error={errors.title} help="Rubriken på sidan">
                <Input id="p-title" value={form.title} aria-invalid={!!errors.title} onChange={(e) => patch({ title: e.target.value })} />
              </Field>
              <Field label="Beskrivning" htmlFor="p-desc" required error={errors.description} help="Kort ingress, 1–2 meningar">
                <Textarea id="p-desc" rows={3} value={form.description} aria-invalid={!!errors.description} onChange={(e) => patch({ description: e.target.value })} />
              </Field>
              <Field label="Innehåll" htmlFor="p-content" hint="Markdown" help="Rubriker med #, listor med -, länkar som [text](url)">
                <Textarea id="p-content" rows={14} value={form.content} onChange={(e) => patch({ content: e.target.value })} className="font-mono text-[13px] leading-relaxed" />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Bilder" description="Hero-bilden visas överst. Dra galleribilderna för att ändra ordning." />
            <CardBody className="flex flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
                <div className="relative">
                  {form.hero_image_url ? (
                    img(form.hero_image_url, 'h-[150px] w-[200px] rounded-[10px]')
                  ) : (
                    <span className="flex h-[150px] w-[200px] items-center justify-center rounded-[10px] bg-amber-light text-amber">
                      <ImageOff className="size-6" />
                    </span>
                  )}
                  {form.hero_image_url ? (
                    <button type="button" onClick={moveHeroToGallery} title="Flytta till galleriet" className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md bg-white/90 text-ink shadow-[var(--shadow-card)] hover:bg-white">
                      <ArrowDown className="size-3.5" />
                    </button>
                  ) : null}
                </div>
                <Field label="Hero-bild (URL)" htmlFor="p-hero" help="Bilder hämtas via bildproxyn så externa länkar fungerar.">
                  <Input id="p-hero" type="url" value={form.hero_image_url} onChange={(e) => patch({ hero_image_url: e.target.value })} placeholder="https://…" />
                </Field>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-[13px] font-medium text-ink">
                  Galleri <span className="font-normal text-ink-muted">· {form.gallery_images.length} bilder</span>
                </span>
                {form.gallery_images.length ? (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                    {form.gallery_images.map((url, i) => (
                      <div
                        key={`${url}-${i}`}
                        draggable
                        onDragStart={(e) => {
                          setDragIndex(i)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (dragIndex !== null && dragIndex !== i) reorder(dragIndex, i)
                          setDragIndex(null)
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        className={cn('group relative aspect-square cursor-grab overflow-hidden rounded-[10px] border border-line bg-stone', dragIndex === i && 'opacity-50')}
                      >
                        {img(url, 'h-full w-full')}
                        <span className="absolute left-1.5 top-1.5 rounded bg-white/90 p-0.5 text-ink-muted">
                          <GripVertical className="size-3.5" />
                        </span>
                        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-ink/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button type="button" onClick={() => moveImageToHero(i)} title="Använd som hero" className="inline-flex size-7 items-center justify-center rounded-md bg-white/90 text-ink hover:bg-white">
                            <Star className="size-3.5" />
                          </button>
                          <button type="button" onClick={() => removeGalleryImage(i)} title="Ta bort" className="inline-flex size-7 items-center justify-center rounded-md bg-white/90 text-poppy hover:bg-white">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-muted">Inga galleribilder än.</span>
                )}
                <div className="flex gap-2">
                  <Input
                    type="url"
                    aria-label="Bild-URL"
                    value={newGalleryImage}
                    onChange={(e) => setNewGalleryImage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addGalleryImage()
                      }
                    }}
                    placeholder="https://… (Enter lägger till)"
                  />
                  <Button type="button" variant="secondary" onClick={addGalleryImage} disabled={!newGalleryImage.trim()}>
                    Lägg till
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Publicering" />
            <CardBody className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <StatusBadge domain="page" value={form.is_published} />
                {isEdit && page?.updated_at ? <span className="text-xs text-ink-muted">Uppdaterad {formatRelative(page.updated_at)}</span> : null}
              </div>
              <Checkbox label="Publicerad på ivarberg.nu" checked={form.is_published} onChange={(e) => patch({ is_published: e.target.checked })} />
              {isEdit && page?.is_published ? (
                <a href={`${getFrontendUrl()}/arrangor/${page.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-sea">
                  Visa på ivarberg.nu <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Kontakt" />
            <CardBody className="flex flex-col gap-3">
              <Field label="E-post" htmlFor="c-email">
                <Input id="c-email" type="email" value={form.contact_info.email ?? ''} onChange={(e) => patch({ contact_info: { ...form.contact_info, email: e.target.value } })} />
              </Field>
              <Field label="Telefon" htmlFor="c-phone">
                <Input id="c-phone" type="tel" value={form.contact_info.phone ?? ''} onChange={(e) => patch({ contact_info: { ...form.contact_info, phone: e.target.value } })} />
              </Field>
              <Field label="Webbsida" htmlFor="c-web">
                <Input id="c-web" type="url" value={form.contact_info.website ?? ''} onChange={(e) => patch({ contact_info: { ...form.contact_info, website: e.target.value } })} />
              </Field>
              <Field label="Adress" htmlFor="c-addr">
                <Input id="c-addr" value={form.contact_info.address ?? ''} onChange={(e) => patch({ contact_info: { ...form.contact_info, address: e.target.value } })} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Sociala medier" />
            <CardBody className="flex flex-col gap-3">
              {(['facebook', 'instagram', 'twitter', 'linkedin', 'youtube'] as const).map((k) => (
                <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} htmlFor={`s-${k}`}>
                  <Input id={`s-${k}`} type="url" value={form.social_links[k] ?? ''} onChange={(e) => patch({ social_links: { ...form.social_links, [k]: e.target.value } })} placeholder="https://…" />
                </Field>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="SEO" />
            <CardBody className="flex flex-col gap-3">
              <Field label="SEO-titel" htmlFor="seo-t" help={`${form.seo_title.length} / 60 tecken`}>
                <Input id="seo-t" value={form.seo_title} onChange={(e) => patch({ seo_title: e.target.value })} />
              </Field>
              <Field label="SEO-beskrivning" htmlFor="seo-d" help={`${form.seo_description.length} / 160 tecken`}>
                <Textarea id="seo-d" rows={3} value={form.seo_description} onChange={(e) => patch({ seo_description: e.target.value })} />
              </Field>
              <Field label="Nyckelord" htmlFor="seo-k" help="Kommaseparerade">
                <Input id="seo-k" value={form.seo_keywords} onChange={(e) => patch({ seo_keywords: e.target.value })} />
              </Field>
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t border-line bg-white px-4 py-3 md:-mx-8 md:px-8">
        <span className="flex items-center gap-2 text-[13px] text-ink-soft">
          {dirty ? (
            <>
              <span className="size-2 rounded-full bg-amber" /> Osparade ändringar
            </>
          ) : null}
        </span>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/organizer-pages">Avbryt</Link>
          </Button>
          <Button type="submit" variant="secondary" loading={saving}>
            {form.is_published ? 'Spara' : 'Spara utkast'}
          </Button>
          {!form.is_published ? (
            <Button type="button" onClick={() => save(true)} loading={saving}>
              Spara och publicera
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  )
}
