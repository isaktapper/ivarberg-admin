'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/contexts/TenantContext'
import { DEFAULT_THEME_COLORS, FEATURE_LABELS, VARBERG_TENANT_ID, slugifyCity, type Tenant, type TenantFeatures, type TenantStatus } from '@/lib/tenants'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/input'
import { Banner } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { ImageField } from '@/components/events/ImageField'

type ColorKey = keyof typeof DEFAULT_THEME_COLORS

const COLOR_FIELDS: { key: ColorKey; label: string; help: string }[] = [
  { key: 'primary', label: 'Huvudfärg', help: 'Knappar, länkar och aktiva ikoner' },
  { key: 'dark', label: 'Mörk yta', help: 'Sidfot och fasta fält' },
  { key: 'accent', label: 'Signalfärg', help: 'Märken som "Idag!"' },
  { key: 'background', label: 'Bakgrund', help: 'Sidans bakgrund' },
  { key: 'highlight', label: 'Accent på mörk yta', help: 'Detaljer i sidfoten' },
]

interface FormState {
  city_name: string
  name: string
  slug: string
  primary_domain: string
  municipality_code: string
  status: TenantStatus
  colors: Record<ColorKey, string>
  logoUrl: string
  faviconUrl: string
  faviconDarkUrl: string
  heroImageUrl: string
  ogImageUrl: string
  features: TenantFeatures
  seoTitle: string
  seoDescription: string
  heroHeading: string
  email: string
  instagramHandle: string
  address: string
}

function initial(tenant?: Tenant): FormState {
  return {
    city_name: tenant?.city_name ?? '',
    name: tenant?.name ?? '',
    slug: tenant?.slug ?? '',
    primary_domain: tenant?.primary_domain ?? '',
    municipality_code: tenant?.municipality_codes?.join(', ') ?? '',
    status: tenant?.status ?? 'draft',
    colors: { ...DEFAULT_THEME_COLORS, ...(tenant?.theme?.colors ?? {}) },
    logoUrl: tenant?.theme?.logoUrl ?? '',
    faviconUrl: tenant?.theme?.faviconUrl ?? '',
    faviconDarkUrl: tenant?.theme?.faviconDarkUrl ?? '',
    heroImageUrl: tenant?.theme?.heroImageUrl ?? '',
    ogImageUrl: tenant?.theme?.ogImageUrl ?? '',
    features: tenant?.features ?? {},
    seoTitle: tenant?.seo?.title ?? '',
    seoDescription: tenant?.seo?.description ?? '',
    heroHeading: tenant?.seo?.heroHeading ?? '',
    email: tenant?.contact?.email ?? '',
    instagramHandle: tenant?.contact?.instagramHandle ?? '',
    address: tenant?.contact?.address ?? '',
  }
}

/** Relativ luminans och kontrast enligt WCAG, för att varna för oläsliga färgval. */
function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number | null {
  const la = luminance(a)
  const lb = luminance(b)
  if (la === null || lb === null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function CityForm({ tenant }: { tenant?: Tenant }) {
  const router = useRouter()
  const toast = useToast()
  const { reload } = useTenant()
  const [form, setForm] = React.useState<FormState>(() => initial(tenant))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Vid ny stad fylls sajtnamn, kortnamn och domän i utifrån stadens namn tills man själv ändrar dem.
  const [touched, setTouched] = React.useState<{ name?: boolean; slug?: boolean; domain?: boolean }>({})

  const isNew = !tenant
  const isVarberg = tenant?.id === VARBERG_TENANT_ID

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  const setCity = (value: string) => {
    setForm((f) => {
      if (!isNew) return { ...f, city_name: value }
      const slug = slugifyCity(value)
      const domain = slug ? `i${slug.replace(/-/g, '')}.nu` : ''
      return {
        ...f,
        city_name: value,
        slug: touched.slug ? f.slug : slug,
        primary_domain: touched.domain ? f.primary_domain : domain,
        name: touched.name ? f.name : domain,
      }
    })
  }

  const warnings = React.useMemo(() => {
    const out: string[] = []
    const onPrimary = contrast('#FFFFFF', form.colors.primary)
    if (onPrimary !== null && onPrimary < 4.5) out.push(`Vit text på huvudfärgen har kontrast ${onPrimary.toFixed(1)}:1. Välj en mörkare huvudfärg (minst 4,5:1).`)
    const linkOnBg = contrast(form.colors.primary, form.colors.background)
    if (linkOnBg !== null && linkOnBg < 4.5) out.push(`Huvudfärgen mot bakgrunden har kontrast ${linkOnBg.toFixed(1)}:1. Länkar blir svåra att läsa (minst 4,5:1).`)
    const onDark = contrast(form.colors.highlight, form.colors.dark)
    if (onDark !== null && onDark < 4.5) out.push(`Accenten mot den mörka ytan har kontrast ${onDark.toFixed(1)}:1 (minst 4,5:1).`)
    return out
  }, [form.colors])

  const submit = async () => {
    setError(null)
    const codes = form.municipality_code.split(/[\s,]+/).map((c) => c.trim()).filter(Boolean)
    const handle = form.instagramHandle.trim().replace(/^@/, '')
    const payload = {
      id: tenant?.id,
      city_name: form.city_name,
      name: form.name,
      slug: form.slug,
      primary_domain: form.primary_domain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      municipality_codes: codes,
      status: form.status,
      theme: { colors: form.colors, logoUrl: form.logoUrl, faviconUrl: form.faviconUrl, faviconDarkUrl: form.faviconDarkUrl, heroImageUrl: form.heroImageUrl, ogImageUrl: form.ogImageUrl },
      features: form.features,
      seo: { title: form.seoTitle, description: form.seoDescription, heroHeading: form.heroHeading },
      contact: { email: form.email, instagramHandle: handle ? `@${handle}` : '', instagramUrl: handle ? `https://instagram.com/${handle}` : '', address: form.address },
    }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/tenants', { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kunde inte spara')
      await reload()
      toast.success(isNew ? 'Staden är skapad' : 'Ändringarna är sparade', form.city_name)
      if (isNew) router.push(`/admin/cities/${json.tenant.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte spara')
    } finally {
      setBusy(false)
    }
  }

  const city = form.city_name.trim() || 'staden'

  return (
    <form
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader title="Grunduppgifter" description="Det här räcker för att sajten ska fungera. Resten har rimliga standardvärden." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Stad" htmlFor="city-name" required help="Används i rubriker och texter: Vad händer i …?">
              <Input id="city-name" value={form.city_name} onChange={(e) => setCity(e.target.value)} placeholder="Falkenberg" autoComplete="off" required />
            </Field>
            <Field label="Kommunkod" htmlFor="city-code" required help="SCB:s fyrsiffriga kod. Avgör vilka event som visas. Flera koder skiljs med komma.">
              <Input id="city-code" value={form.municipality_code} onChange={(e) => set('municipality_code', e.target.value)} placeholder="1382" inputMode="numeric" disabled={isVarberg} required />
            </Field>
            <Field label="Domän" htmlFor="city-domain" required help="Utan https://. Kopplas sedan i Vercel och DNS.">
              <Input id="city-domain" value={form.primary_domain} onChange={(e) => { setTouched((t) => ({ ...t, domain: true })); set('primary_domain', e.target.value) }} placeholder="ifalkenberg.nu" autoComplete="off" required />
            </Field>
            <Field label="Sajtens namn" htmlFor="city-site-name" required help="Visas i sidfot, titlar och som avsändare.">
              <Input id="city-site-name" value={form.name} onChange={(e) => { setTouched((t) => ({ ...t, name: true })); set('name', e.target.value) }} placeholder="ifalkenberg.nu" autoComplete="off" required />
            </Field>
            <Field label="Kortnamn" htmlFor="city-slug" required help="Sätts som SITE_SLUG i Vercel-projektet. Går inte att ändra i efterhand utan att ändra där också.">
              <Input id="city-slug" value={form.slug} onChange={(e) => { setTouched((t) => ({ ...t, slug: true })); set('slug', e.target.value) }} placeholder="falkenberg" autoComplete="off" disabled={isVarberg} required className="font-mono" />
            </Field>
            <Field label="Status" htmlFor="city-status" help="Utkast och Pausad göms för sökmotorer.">
              <Select id="city-status" value={form.status} onChange={(e) => set('status', e.target.value as TenantStatus)}>
                <option value="draft">Utkast</option>
                <option value="live">Live</option>
                <option value="paused">Pausad</option>
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Färger" description="Sajten räknar själv fram ljusare och mörkare nyanser av huvudfärgen." />
          <CardBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {COLOR_FIELDS.map((c) => (
                <Field key={c.key} label={c.label} htmlFor={`color-${c.key}`} help={c.help}>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={`${c.label}, färgväljare`}
                      value={/^#[0-9a-f]{6}$/i.test(form.colors[c.key]) ? form.colors[c.key] : '#000000'}
                      onChange={(e) => set('colors', { ...form.colors, [c.key]: e.target.value.toUpperCase() })}
                      className="size-10 shrink-0 cursor-pointer rounded-[8px] border border-line bg-white p-1"
                    />
                    <Input id={`color-${c.key}`} value={form.colors[c.key]} onChange={(e) => set('colors', { ...form.colors, [c.key]: e.target.value })} className="font-mono" maxLength={7} />
                  </div>
                </Field>
              ))}
            </div>
            {warnings.length ? (
              <Banner tone="wait" title="Kontrollera läsbarheten">
                <ul className="list-disc pl-4">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Banner>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Bilder" description="Lämnas en bild tom används en neutral standardbild." />
          <CardBody className="flex flex-col gap-5">
            <Field label="Logga" help="Visas i sidhuvudet. PNG eller SVG med genomskinlig bakgrund.">
              <ImageField contain value={form.logoUrl} onChange={(v) => set('logoUrl', v)} />
            </Field>
            <Field label="Bild överst på startsidan" help="Liggande foto från staden, minst 2000 px brett.">
              <ImageField value={form.heroImageUrl} onChange={(v) => set('heroImageUrl', v)} />
            </Field>
            <Field label="Delningsbild" help="Visas när sajten delas i sociala medier. 1200 × 630 px.">
              <ImageField value={form.ogImageUrl} onChange={(v) => set('ogImageUrl', v)} />
            </Field>
            <Field label="Favicon" help="Kvadratisk ikon för webbläsarfliken, minst 64 px.">
              <ImageField contain value={form.faviconUrl} onChange={(v) => set('faviconUrl', v)} />
            </Field>
            <Field label="Favicon i mörkt läge" hint="valfri" help="Visas när webbläsaren är i mörkt läge, t.ex. en ljus variant. Tom = samma som ovan.">
              <ImageField contain value={form.faviconDarkUrl} onChange={(v) => set('faviconDarkUrl', v)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Texter och kontakt" description="Tomma fält får standardtexter utifrån stadens namn." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Rubrik på startsidan" htmlFor="city-hero" className="sm:col-span-2">
              <Input id="city-hero" value={form.heroHeading} onChange={(e) => set('heroHeading', e.target.value)} placeholder={`Vad händer i ${city}?`} />
            </Field>
            <Field label="Sidtitel" htmlFor="city-seo-title" className="sm:col-span-2" help="Det som syns i sökresultat och i webbläsarfliken.">
              <Input id="city-seo-title" value={form.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} placeholder={`${form.name || 'sajten'} - Vad händer i ${city}?`} />
            </Field>
            <Field label="Beskrivning" htmlFor="city-seo-desc" className="sm:col-span-2" help="Högst 160 tecken syns i sökresultat.">
              <Textarea id="city-seo-desc" value={form.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} placeholder={`Din kompletta guide till evenemang i ${city}.`} className="min-h-20" />
            </Field>
            <Field label="E-post" htmlFor="city-email">
              <Input id="city-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder={`info@${form.primary_domain || 'domän.nu'}`} />
            </Field>
            <Field label="Instagram-konto" htmlFor="city-ig">
              <Input id="city-ig" value={form.instagramHandle} onChange={(e) => set('instagramHandle', e.target.value)} placeholder="@ifalkenberg.nu" />
            </Field>
            <Field label="Postadress" htmlFor="city-address" className="sm:col-span-2" help="Visas i sidfoten. Kan lämnas tom.">
              <Input id="city-address" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Delar av sajten" description="Startsida, eventsidor, arrangörssidor och tipsformulär är alltid på." />
          <CardBody className="flex flex-col gap-3.5">
            {FEATURE_LABELS.map((f) => (
              <div key={f.key} className="flex flex-col gap-0.5">
                <Checkbox checked={!!form.features[f.key]} onChange={(e) => set('features', { ...form.features, [f.key]: e.target.checked })} label={f.label} />
                <span className="pl-[26px] text-xs text-ink-muted">{f.help}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:h-fit">
        <Card>
          <CardBody className="flex flex-col gap-3">
            {error ? <Banner tone="bad">{error}</Banner> : null}
            <Button type="submit" loading={busy} size="lg">
              {isNew ? 'Skapa stad' : 'Spara ändringar'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.push('/admin/cities')}>
              {isNew ? 'Avbryt' : 'Tillbaka till städer'}
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Förhandsvisning" />
          <CardBody className="p-0">
            <div className="overflow-hidden rounded-b-[12px]" style={{ background: form.colors.background }}>
              <div className="flex flex-col gap-3 px-4 py-5">
                <span className="text-[17px] font-bold leading-tight" style={{ color: form.colors.dark }}>
                  {form.heroHeading || `Vad händer i ${city}?`}
                </span>
                <div className="flex items-center gap-2">
                  <span className="rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ background: form.colors.primary }}>
                    Visa event
                  </span>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: form.colors.accent }}>
                    Idag!
                  </span>
                  <span className="text-xs font-medium underline" style={{ color: form.colors.primary }}>
                    Länk
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3" style={{ background: form.colors.dark }}>
                <span className="text-xs font-semibold text-white">{form.name || 'sajten'}</span>
                <span className="text-[11px] font-medium" style={{ color: form.colors.highlight }}>
                  Tipsa oss
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </form>
  )
}
