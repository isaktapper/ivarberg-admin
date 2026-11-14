'use client'

import * as React from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { ACTIVE_TENANT_COOKIE, VARBERG_SLUG, type Tenant } from '@/lib/tenants'

interface TenantContextValue {
  /** Vald stad. null = tabellen finns inte än; filtrera då inte alls. */
  tenant: Tenant | null
  /** Städer användaren har tillgång till */
  tenants: Tenant[]
  /** Får skapa och ändra städer */
  isPlatformAdmin: boolean
  /** false tills städerna har hämtats */
  ready: boolean
  /** Byt stad. Laddar om sidan så att alla listor hämtas på nytt. */
  switchTenant: (slug: string) => void
  /** Hämta om listan (efter att en stad skapats eller ändrats) */
  reload: () => Promise<void>
}

const TenantContext = React.createContext<TenantContextValue>({
  tenant: null,
  tenants: [],
  isPlatformAdmin: false,
  ready: false,
  switchTenant: () => {},
  reload: async () => {},
})

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const hit = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [state, setState] = React.useState<{ tenants: Tenant[]; isPlatformAdmin: boolean; ready: boolean }>({ tenants: [], isPlatformAdmin: false, ready: false })
  const [slug, setSlug] = React.useState<string>(VARBERG_SLUG)

  const load = React.useCallback(async () => {
    if (!user) {
      setState({ tenants: [], isPlatformAdmin: false, ready: true })
      return
    }
    const [tenantsRes, adminRes, memberRes] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at', { ascending: true }),
      supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
      supabase.from('tenant_members').select('tenant_id').eq('user_id', user.id),
    ])

    // Tabellen saknas (migrationen inte körd): admin fungerar som innan städer fanns.
    if (tenantsRes.error) {
      setState({ tenants: [], isPlatformAdmin: false, ready: true })
      return
    }

    const all = (tenantsRes.data as Tenant[]) || []
    const isPlatformAdmin = !adminRes.error && !!adminRes.data
    const memberOf = new Set(((memberRes.data as { tenant_id: string }[] | null) || []).map((m) => m.tenant_id))
    const allowed = isPlatformAdmin ? all : all.filter((t) => memberOf.has(t.id))

    setSlug(readCookie(ACTIVE_TENANT_COOKIE) || VARBERG_SLUG)
    setState({ tenants: allowed, isPlatformAdmin, ready: true })
  }, [user])

  React.useEffect(() => {
    if (authLoading) return
    load()
  }, [authLoading, load])

  const tenant = React.useMemo(
    () => state.tenants.find((t) => t.slug === slug) ?? state.tenants.find((t) => t.slug === VARBERG_SLUG) ?? state.tenants[0] ?? null,
    [state.tenants, slug]
  )

  const switchTenant = React.useCallback((next: string) => {
    writeCookie(ACTIVE_TENANT_COOKIE, next)
    // Hel omladdning: sidorna hämtar sin data själva och ska alla börja om i nya staden.
    window.location.assign('/')
  }, [])

  // Håll cookien i takt med den stad som faktiskt visas, så att API-routes ser samma.
  React.useEffect(() => {
    if (tenant && readCookie(ACTIVE_TENANT_COOKIE) !== tenant.slug) writeCookie(ACTIVE_TENANT_COOKIE, tenant.slug)
  }, [tenant])

  const value = React.useMemo<TenantContextValue>(
    () => ({ tenant, tenants: state.tenants, isPlatformAdmin: state.isPlatformAdmin, ready: state.ready, switchTenant, reload: load }),
    [tenant, state, switchTenant, load]
  )

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantContextValue {
  return React.useContext(TenantContext)
}
