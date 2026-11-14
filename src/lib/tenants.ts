/**
 * Städer (tenants). En rad per sajt i tabellen `tenants`
 * (database/migrations/scale/001_tenants.sql).
 *
 * Varberg är standard överallt: finns ingen vald stad, eller har migrationen
 * inte körts än, beter sig admin precis som innan städer fanns.
 */

export const VARBERG_TENANT_ID = '00000000-0000-4000-8000-000000001383'
export const VARBERG_SLUG = 'varberg'
export const ACTIVE_TENANT_COOKIE = 'active_tenant'

export interface TenantTheme {
  colors?: {
    /** Knappar, länkar, aktiva ikoner */
    primary?: string
    /** Mörka ytor: footer, fasta fält */
    dark?: string
    /** Varm signal: "Idag!", märken */
    accent?: string
    /** Sidbakgrund */
    background?: string
    /** Accent på mörka ytor */
    highlight?: string
  }
  logoUrl?: string
  faviconUrl?: string
  /** Favicon när webbläsaren är i mörkt läge. Tom = samma som faviconUrl. */
  faviconDarkUrl?: string
  heroImageUrl?: string
  ogImageUrl?: string
}

export interface TenantFeatures {
  /** Områdesfilter på startsidan (kräver områden för staden) */
  areaFilter?: boolean
  /** Guidesidorna (att göra, evenemang, kalender) */
  guides?: boolean
  /** Säsongssidor (jul, sommar, lov) */
  seasons?: boolean
  /** Kategori- och områdessidor med egna texter */
  taxonomyPages?: boolean
  /** Nyhetsbrevsrutan */
  newsletter?: boolean
  /** Instagram-rutan */
  instagram?: boolean
}

export interface TenantSeo {
  title?: string
  description?: string
  heroHeading?: string
}

export interface TenantContact {
  email?: string
  instagramUrl?: string
  instagramHandle?: string
  address?: string
}

export type TenantStatus = 'draft' | 'live' | 'paused'

export interface Tenant {
  id: string
  slug: string
  name: string
  city_name: string
  municipality_codes: string[]
  primary_domain: string
  theme: TenantTheme
  features: TenantFeatures
  seo: TenantSeo
  contact: TenantContact
  status: TenantStatus
  created_at: string
  updated_at: string
}

export const TENANT_STATUS_LABEL: Record<TenantStatus, string> = {
  draft: 'Utkast',
  live: 'Live',
  paused: 'Pausad',
}

/** Standardfärger för en ny stad (samma palett som ivarberg.nu) */
export const DEFAULT_THEME_COLORS = {
  primary: '#0F5AA6',
  dark: '#0B1B3A',
  accent: '#B84A14',
  background: '#F7F2EA',
  highlight: '#7FD1C8',
} as const

export const FEATURE_LABELS: { key: keyof TenantFeatures; label: string; help: string }[] = [
  { key: 'newsletter', label: 'Nyhetsbrev', help: 'Visar anmälningsrutan. Utskick per stad finns inte än.' },
  { key: 'instagram', label: 'Instagram-ruta', help: 'Kräver att Instagram-konto är ifyllt.' },
  { key: 'areaFilter', label: 'Områdesfilter', help: 'Kräver områden för staden. Finns bara för Varberg än.' },
  { key: 'guides', label: 'Guidesidor', help: 'Texterna finns bara för Varberg än.' },
  { key: 'seasons', label: 'Säsongssidor', help: 'Texterna finns bara för Varberg än.' },
  { key: 'taxonomyPages', label: 'Kategori- och områdessidor', help: 'Texterna finns bara för Varberg än.' },
]

export function isVarberg(tenant: Pick<Tenant, 'id'> | null | undefined): boolean {
  return !tenant || tenant.id === VARBERG_TENANT_ID
}

/** Publika sajtens adress för en stad */
export function tenantSiteUrl(tenant: Pick<Tenant, 'primary_domain'> | null | undefined): string {
  return tenant?.primary_domain ? `https://${tenant.primary_domain}` : 'https://ivarberg.nu'
}

/** "falkenberg" av "Falkenberg", "kungsbacka" av "Kungsbacka" */
export function slugifyCity(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Generiken hålls medvetet enkel (Q in, Q ut): Supabase-byggarnas typer är så
// djupa att ett villkor på Q får TypeScript att ge upp i stora Promise.all.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any

/**
 * Begränsa en events-fråga till stadens kommuner. Utan stad (migrationen inte
 * körd) lämnas frågan orörd. Anropas på en fråga efter .select()/.update().
 */
export function scopeEvents<Q>(query: Q, tenant: Pick<Tenant, 'municipality_codes'> | null | undefined, column = 'municipality_code'): Q {
  if (!tenant) return query
  return (query as AnyQuery).in(column, tenant.municipality_codes)
}

/** Begränsa en fråga mot en tabell med tenant_id till vald stad. */
export function scopeTenant<Q>(query: Q, tenant: Pick<Tenant, 'id'> | null | undefined, column = 'tenant_id'): Q {
  if (!tenant) return query
  return (query as AnyQuery).eq(column, tenant.id)
}

/** Fält att lägga på ett nytt event så att det hamnar i vald stad. */
export function eventTenantFields(tenant: Pick<Tenant, 'municipality_codes'> | null | undefined): { municipality_code?: string } {
  const code = tenant?.municipality_codes?.[0]
  return code ? { municipality_code: code } : {}
}

/** Fält att lägga på en ny rad i en tabell med tenant_id. */
export function rowTenantFields(tenant: Pick<Tenant, 'id'> | null | undefined): { tenant_id?: string } {
  return tenant ? { tenant_id: tenant.id } : {}
}
