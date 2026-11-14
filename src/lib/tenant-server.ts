import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-server'
import { ACTIVE_TENANT_COOKIE, VARBERG_SLUG, type Tenant } from '@/lib/tenants'

/**
 * Vald stad för API-routes och serverkod: läser cookien som stadsväljaren
 * sätter. Standard är Varberg. Returnerar null om tabellen `tenants` inte finns
 * än (migrationen inte körd) — anropande kod ska då inte filtrera alls.
 */
export async function getActiveTenant(): Promise<Tenant | null> {
  const cookieStore = await cookies()
  const slug = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value || VARBERG_SLUG

  const { data, error } = await supabaseAdmin.from('tenants').select('*').in('slug', [slug, VARBERG_SLUG])
  if (error || !data?.length) return null

  const rows = data as Tenant[]
  return rows.find((t) => t.slug === slug) ?? rows.find((t) => t.slug === VARBERG_SLUG) ?? null
}

/** Inloggad användare från sessionscookien, eller null. */
export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
    },
  })
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

/** Får användaren skapa och ändra städer? */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle()
  return !error && !!data
}
