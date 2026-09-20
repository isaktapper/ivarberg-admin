'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TableSkeleton, EmptyState } from './states'

export interface Column<T> {
  key: string
  header: React.ReactNode
  /** CSS grid track, t.ex. "minmax(0,1fr)", "140px" */
  width: string
  sortable?: boolean
  align?: 'left' | 'right'
  cell: (row: T) => React.ReactNode
  /** Kan döljas via kolumnväljare */
  hideable?: boolean
}

export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

/**
 * Tabell byggd på CSS grid: 44–48 px rader, valbar markering, sortering,
 * skelett vid laddning och tomt läge. Kolumnbredder är grid-tracks.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyState,
  selectable,
  selected,
  onSelectedChange,
  sort,
  onSortChange,
  rowHref,
  onRowClick,
  rowClassName,
  dense,
  className,
  footer,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  loading?: boolean
  emptyState?: React.ReactNode
  selectable?: boolean
  selected?: Set<string | number>
  onSelectedChange?: (next: Set<string | number>) => void
  sort?: SortState
  onSortChange?: (s: SortState) => void
  rowHref?: (row: T) => string | undefined
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  dense?: boolean
  className?: string
  footer?: React.ReactNode
}) {
  const tracks = [selectable ? '44px' : null, ...columns.map((c) => c.width)].filter(Boolean).join(' ')
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)))
  const someSelected = selectable && rows.some((r) => selected?.has(rowKey(r)))

  const toggleAll = () => {
    if (!onSelectedChange) return
    const next = new Set(selected)
    if (allSelected) rows.forEach((r) => next.delete(rowKey(r)))
    else rows.forEach((r) => next.add(rowKey(r)))
    onSelectedChange(next)
  }

  const toggleOne = (key: string | number) => {
    if (!onSelectedChange) return
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectedChange(next)
  }

  const headerCell = (c: Column<T>) => {
    const active = sort?.key === c.key
    const content = (
      <span className={cn('inline-flex items-center gap-1', c.align === 'right' && 'justify-end')}>
        {c.header}
        {c.sortable ? (
          active ? (
            sort!.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
          ) : null
        ) : null}
      </span>
    )
    if (!c.sortable || !onSortChange) return <span key={c.key} className={cn(c.align === 'right' && 'text-right')}>{content}</span>
    return (
      <button
        key={c.key}
        type="button"
        onClick={() => onSortChange({ key: c.key, dir: active && sort!.dir === 'desc' ? 'asc' : 'desc' })}
        className={cn('inline-flex text-left hover:text-ink', active ? 'text-ink' : '', c.align === 'right' && 'justify-end')}
      >
        {content}
      </button>
    )
  }

  const rowH = dense ? 'min-h-10' : 'min-h-12'

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-[12px] border border-line bg-white', className)}>
      <div className="thin-scroll overflow-x-auto">
        <div className="min-w-fit">
          <div
            role="row"
            className="grid h-10 items-center gap-3 border-b border-line bg-sand-soft px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
            style={{ gridTemplateColumns: tracks }}
          >
            {selectable ? (
              <input
                type="checkbox"
                aria-label="Markera alla på sidan"
                checked={!!allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = !allSelected && !!someSelected
                }}
                onChange={toggleAll}
                className="size-4 cursor-pointer accent-sea"
              />
            ) : null}
            {columns.map(headerCell)}
          </div>

          {loading ? (
            <TableSkeleton rows={8} />
          ) : rows.length === 0 ? (
            emptyState ?? <EmptyState title="Inget att visa" />
          ) : (
            rows.map((row) => {
              const key = rowKey(row)
              const isSel = !!selected?.has(key)
              const href = rowHref?.(row)
              return (
                <div
                  key={key}
                  role="row"
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'grid items-center gap-3 border-b border-line-soft px-4 last:border-b-0',
                    rowH,
                    isSel ? 'bg-sea-lightest' : 'hover:bg-sand-soft',
                    (onRowClick || href) && 'cursor-pointer',
                    rowClassName?.(row)
                  )}
                  style={{ gridTemplateColumns: tracks }}
                >
                  {selectable ? (
                    <input
                      type="checkbox"
                      aria-label="Markera rad"
                      checked={isSel}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleOne(key)}
                      className="size-4 cursor-pointer accent-sea"
                    />
                  ) : null}
                  {columns.map((c) => (
                    <div key={c.key} className={cn('min-w-0 text-[13px] text-ink', c.align === 'right' && 'text-right')}>
                      {c.cell(row)}
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>
      </div>
      {footer ? <div className="border-t border-line px-4 py-3">{footer}</div> : null}
    </div>
  )
}

/** Vanlig "namn + underrad" cell */
export function TitleCell({ title, subtitle, thumb, href }: { title: React.ReactNode; subtitle?: React.ReactNode; thumb?: React.ReactNode; href?: string }) {
  const Title = href ? 'a' : 'span'
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {thumb}
      <div className="flex min-w-0 flex-col">
        <Title href={href} className="truncate text-[13px] font-medium text-ink hover:text-sea">
          {title}
        </Title>
        {subtitle ? <span className="truncate text-[11px] text-ink-muted">{subtitle}</span> : null}
      </div>
    </div>
  )
}

/** Miniatyrbild 32×32 med fallback */
export function Thumb({ src, alt = '', size = 32, className }: { src?: string | null; alt?: string; size?: number; className?: string }) {
  const [broken, setBroken] = React.useState(false)
  const style = { width: size, height: size }
  if (!src || broken) {
    return (
      <span style={style} className={cn('flex shrink-0 items-center justify-center rounded-md bg-poppy-light font-mono text-[9px] text-poppy', className)} title="Bild saknas">
        ingen
      </span>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={style} onError={() => setBroken(true)} className={cn('shrink-0 rounded-md object-cover', className)} />
}
