'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { CATEGORIES } from '@/lib/constants'
import type { EventCategory } from '@/types/database'

/**
 * Kategorichips. Första valda = huvudkategori (stjärna). Klick på en vald
 * icke-huvudkategori gör den till huvud; klick på huvud avmarkerar.
 */
export function CategoryPicker({
  value,
  onChange,
  max = 3,
  scores,
  className,
}: {
  value: EventCategory[]
  onChange: (v: EventCategory[]) => void
  max?: number
  /** AI-säkerhet per kategori (0–1), visas som liten siffra */
  scores?: Record<string, number> | null
  className?: string
}) {
  const toggle = (cat: EventCategory) => {
    const idx = value.indexOf(cat)
    if (idx === 0) return onChange(value.slice(1))
    if (idx > 0) return onChange([cat, ...value.filter((c) => c !== cat)])
    if (value.length >= max) return
    onChange([...value, cat])
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {CATEGORIES.map((cat) => {
        const idx = value.indexOf(cat)
        const on = idx >= 0
        const main = idx === 0
        const disabled = !on && value.length >= max
        const score = scores?.[cat]
        return (
          <button
            key={cat}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(cat)}
            title={main ? 'Huvudkategori – klicka för att avmarkera' : on ? 'Klicka för att göra till huvudkategori' : undefined}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              on ? 'border-sea bg-sea-light font-semibold text-sea-dark' : 'border-line bg-white text-ink hover:bg-sand-soft'
            )}
          >
            {main ? <span aria-hidden>★</span> : null}
            {cat}
            {score != null ? <span className="font-mono text-[10px] text-ink-muted">{Math.round(score * 100)}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
