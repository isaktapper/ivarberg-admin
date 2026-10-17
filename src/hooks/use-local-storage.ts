'use client'

import { useCallback, useEffect, useState } from 'react'

/** Per-användar-inställningar (kolumner, tätthet, sidstorlek). Skyddad mot SSR och privat läge. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) setValue(JSON.parse(raw))
    } catch {
      /* ignorera */
    }
    setReady(true)
  }, [key])

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          /* ignorera */
        }
        return resolved
      })
    },
    [key]
  )

  return [value, update, ready] as const
}
