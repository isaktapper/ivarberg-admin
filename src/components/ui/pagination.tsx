'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { Select } from './input'
import { PAGE_SIZES } from '@/lib/constants'

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'rader',
  className,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (p: number) => void
  onPageSizeChange?: (s: number) => void
  itemLabel?: string
  className?: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const visible: (number | '…')[] = []
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || (p >= page - 1 && p <= page + 1)) visible.push(p)
    else if (visible[visible.length - 1] !== '…') visible.push('…')
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <span className="text-[13px] text-ink-soft">
        Visar <span className="font-mono text-ink">{formatNumber(from)}–{formatNumber(to)}</span> av <span className="font-mono text-ink">{formatNumber(total)}</span> {itemLabel}
      </span>
      <div className="flex items-center gap-4">
        {onPageSizeChange ? (
          <label className="inline-flex items-center gap-2 text-[13px] text-ink-soft">
            Per sida
            <Select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="h-8 w-auto py-0 text-[13px]">
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Föregående sida" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-white text-ink disabled:opacity-40">
            <ChevronLeft className="size-3.5" />
          </button>
          {visible.map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="px-1 font-mono text-xs text-ink-faint">…</span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPageChange(p)}
                className={cn('h-8 min-w-8 rounded-md px-2 font-mono text-xs', p === page ? 'bg-ink text-white' : 'border border-line bg-white text-ink hover:bg-sand-soft')}
              >
                {p}
              </button>
            )
          )}
          <button type="button" aria-label="Nästa sida" disabled={page >= pages} onClick={() => onPageChange(page + 1)} className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-white text-ink disabled:opacity-40">
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
