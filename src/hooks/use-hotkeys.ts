'use client'

import { useEffect } from 'react'

type Handler = (e: KeyboardEvent) => void

/**
 * Kortkommandon som ignoreras när användaren skriver i ett fält.
 * Nycklar: 'a', 'j', 'mod+s', 'escape', 'shift+a'
 */
export function useHotkeys(map: Record<string, Handler>, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      const mod = e.metaKey || e.ctrlKey
      const combo = `${mod ? 'mod+' : ''}${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`
      const handler = map[combo]
      if (!handler) return
      if (typing && !mod && e.key.toLowerCase() !== 'escape') return
      e.preventDefault()
      handler(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [map, enabled])
}
