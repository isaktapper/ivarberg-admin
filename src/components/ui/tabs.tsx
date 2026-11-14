'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { SegmentedControl, SegmentedControlItem } from '@/components/base/segmented-control/segmented-control'

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
              on ? 'border-ink font-semibold text-ink' : 'border-transparent font-medium text-ink-soft hover:text-ink'
            )}
          >
            {t.label}
            {t.count != null ? (
              <span className={cn('rounded-full px-1.5 py-px font-mono text-[11px]', on ? 'bg-lime text-ink' : 'bg-stone text-ink-muted')}>{formatNumber(t.count)}</span>
            ) : null}
          </button>
        )
      })}
      {trailing ? <div className="ml-auto">{trailing}</div> : null}
    </nav>
  )
}

/** Segmenterad kontroll (Alla / Väntar / Aktiva). BoardUI:s knappgrupp med glidande markering. */
export function Segmented({ items, value, onChange, className, size = 'md' }: { items: TabItem[]; value: string; onChange: (v: string) => void; className?: string; size?: 'sm' | 'md' }) {
  return (
    <SegmentedControl
      aria-label="Filter"
      selectedKeys={new Set([value])}
      onSelectionChange={(keys) => {
        const next = [...keys][0]
        if (next != null && String(next) !== value) onChange(String(next))
      }}
      className={cn('w-fit max-w-full overflow-x-auto', className)}
    >
      {items.map((t) => (
        <SegmentedControlItem key={t.value} id={t.value} className={cn('gap-1.5 text-[13px]', size === 'sm' ? 'py-0.5' : 'py-1')}>
          {t.label}
          {t.count != null ? <span className="font-mono text-[11px] text-ink-faint">{formatNumber(t.count)}</span> : null}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}
