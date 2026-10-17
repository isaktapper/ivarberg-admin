'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Filter/sortering/sida som lever i URL:en så att en vy kan länkas,
 * laddas om och gås tillbaka till. Tomma värden tas bort ur URL:en.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const state = useMemo(() => {
    const out = { ...defaults } as T
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const v = searchParams.get(key as string)
      if (v !== null) (out as Record<string, string>)[key as string] = v
    }
    return out
  }, [searchParams, defaults])

  const set = useCallback(
    (patch: Partial<T>, opts: { resetPage?: boolean } = { resetPage: true }) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === '' || value === defaults[key]) next.delete(key)
        else next.set(key, String(value))
      }
      if (opts.resetPage && !('page' in patch) && 'page' in defaults) next.delete('page')
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams, defaults]
  )

  const reset = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname])

  return { state, set, reset }
}
