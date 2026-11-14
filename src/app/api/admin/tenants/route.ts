import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase-server'
import { getSessionUser, isPlatformAdmin } from '@/lib/tenant-server'
import { VARBERG_TENANT_ID } from '@/lib/tenants'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Färgen ska anges som #RRGGBB')
const optionalUrl = z.string().trim().max(500).optional()

const tenantSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Kortnamnet får bara innehålla a–z, siffror och bindestreck').max(40),
  name: z.string().trim().min(1, 'Sajtens namn krävs').max(80),
  city_name: z.string().trim().min(1, 'Stadens namn krävs').max(80),
  municipality_codes: z.array(z.string().regex(/^\d{4}$/, 'Kommunkoden ska vara fyra siffror')).min(1, 'Minst en kommunkod krävs'),
  primary_domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Ange domänen utan https:// och utan snedstreck, t.ex. ifalkenberg.nu'),
  status: z.enum(['draft', 'live', 'paused']),
  theme: z
    .object({
      colors: z.object({ primary: hex, dark: hex, accent: hex, background: hex, highlight: hex }).partial().optional(),
      logoUrl: optionalUrl,
      faviconUrl: optionalUrl,
      faviconDarkUrl: optionalUrl,
      heroImageUrl: optionalUrl,
      ogImageUrl: optionalUrl,
    })
    .default({}),
  features: z.record(z.string(), z.boolean()).default({}),
  seo: z.object({ title: z.string().trim().max(120).optional(), description: z.string().trim().max(300).optional(), heroHeading: z.string().trim().max(80).optional() }).default({}),
  contact: z.object({ email: z.string().trim().max(120).optional(), instagramUrl: optionalUrl, instagramHandle: z.string().trim().max(60).optional(), address: z.string().trim().max(200).optional() }).default({}),
})

/** Ta bort tomma strängar så att sajten faller tillbaka på sina standardvärden. */
function stripEmpty<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === undefined || v === null) continue
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? stripEmpty(v as Record<string, unknown>) : v
  }
  return out as T
}

async function requirePlatformAdmin() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 })
  if (!(await isPlatformAdmin(user.id))) return NextResponse.json({ error: 'Du har inte behörighet att hantera städer' }, { status: 403 })
  return null
}

function dbError(error: { code?: string; message: string }) {
  if (error.code === '23505') {
    const what = error.message.includes('primary_domain') ? 'Domänen' : 'Kortnamnet'
    return NextResponse.json({ error: `${what} används redan av en annan stad` }, { status: 409 })
  }
  return NextResponse.json({ error: error.message }, { status: 500 })
}

/** POST /api/admin/tenants — skapa en stad */
export async function POST(request: NextRequest) {
  const denied = await requirePlatformAdmin()
  if (denied) return denied

  const parsed = tenantSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Ogiltiga uppgifter' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('tenants').insert(stripEmpty(parsed.data)).select('*').single()
  if (error) return dbError(error)
  return NextResponse.json({ tenant: data })
}

/** PATCH /api/admin/tenants — ändra en stad ({ id, ...fält }) */
export async function PATCH(request: NextRequest) {
  const denied = await requirePlatformAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : null
  if (!id) return NextResponse.json({ error: 'id saknas' }, { status: 400 })

  const parsed = tenantSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Ogiltiga uppgifter' }, { status: 400 })

  const values = stripEmpty(parsed.data)
  if (id === VARBERG_TENANT_ID) {
    // Varbergs kortnamn och kommunkod är standardvärden i databasen och i koden.
    values.slug = 'varberg'
    values.municipality_codes = ['1383']
  }

  // theme/seo/contact/features ersätts i sin helhet, så tömda fält försvinner.
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update({ ...values, theme: values.theme ?? {}, seo: values.seo ?? {}, contact: values.contact ?? {}, features: values.features ?? {} })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return dbError(error)
  return NextResponse.json({ tenant: data })
}
