'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'

export interface TabItem {
  value: string
  label: React.ReactNode
  count?: number | null
}

/** Understrukna flikar (sparade vyer) */
export function Tabs({ items, value, onChange, className, trailing }: { items: TabItem[]; value: string; onChange: (v: string) => void; className?: string; trailing?: React.ReactNode }) {
  return (
    <nav className={cn('flex items-center gap-1 border-b border-line', className)} role="tablist">
      {items.map((t) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={cn(
              '-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-[13px] transition-colors',
              on ? 'border-sea font-semibold text-ink' : 'border-transparent font-medium text-ink-soft hover:text-ink'
            )}
          >
            {t.label}
            {t.count != null ? (
              <span className={cn('rounded-full px-1.5 py-px font-mono text-[11px]', on ? 'bg-sea-light text-sea-dark' : 'bg-stone text-ink-muted')}>{formatNumber(t.count)}</span>
            ) : null}
          </button>
        )
      })}
      {trailing ? <div className="ml-auto">{trailing}</div> : null}
    </nav>
  )
}

/** Segmenterad kontroll (Alla / Väntar / Aktiva) */
export function Segmented({ items, value, onChange, className, size = 'md' }: { items: TabItem[]; value: string; onChange: (v: string) => void; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('inline-flex overflow-hidden rounded-[8px] border border-line bg-white', size === 'sm' ? 'h-8' : 'h-9', className)} role="tablist">
      {items.map((t, i) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 text-[13px] transition-colors',
              i > 0 && 'border-l border-line',
              on ? 'bg-ink font-medium text-white' : 'text-ink-soft hover:bg-sand-soft'
            )}
          >
            {t.label}
            {t.count != null ? <span className={cn('font-mono text-[11px]', on ? 'text-white/70' : 'text-ink-muted')}>{formatNumber(t.count)}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
