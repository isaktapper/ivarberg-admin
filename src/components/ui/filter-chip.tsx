'use client'

import * as React from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './dropdown-menu'

/** Ett filterchip. Aktivt = blått med kryss för att rensa. */
export function FilterChip({
  label,
  active,
  onClear,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> & { label: React.ReactNode; active?: boolean; onClear?: () => void }) {
  return (
    <span className="inline-flex">
      <button
        type="button"
        className={cn(
          'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border pl-3 pr-2.5 text-[13px] transition-colors',
          active ? 'border-sea bg-sea-light font-medium text-sea-dark' : 'border-line bg-white text-ink hover:bg-sand-soft',
          onClear && active ? 'rounded-r-none pr-2' : '',
          className
        )}
        {...props}
      >
        {label}
        {children}
        {!(active && onClear) ? <ChevronDown className="size-3.5 text-ink-muted" /> : null}
      </button>
      {active && onClear ? (
        <button
          type="button"
          aria-label="Rensa filter"
          onClick={onClear}
          className="inline-flex h-9 items-center rounded-r-full border border-l-0 border-sea bg-sea-light pl-1 pr-2.5 text-sea-dark hover:bg-sea-light/70"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </span>
  )
}

export interface FilterOption {
  value: string
  label: string
  count?: number
}

/** Chip som öppnar en meny med ett val */
export function SelectFilter({
  label,
  value,
  options,
  onChange,
  allLabel = 'Alla',
}: {
  label: string
  value: string
  options: FilterOption[]
  onChange: (v: string) => void
  allLabel?: string
}) {
  const current = options.find((o) => o.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterChip label={current ? `${label}: ${current.label}` : label} active={!!current} onClear={current ? () => onChange('') : undefined} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange('')}>{allLabel}</DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value)} className={o.value === value ? 'bg-sea-lightest font-medium' : ''}>
            <span className="flex-1">{o.label}</span>
            {o.count != null ? <span className="font-mono text-[11px] text-ink-muted">{o.count}</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Chip som öppnar en meny med flera val (kommaseparerat värde) */
export function MultiFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string[]
  options: FilterOption[]
  onChange: (v: string[]) => void
}) {
  const selected = options.filter((o) => value.includes(o.value))
  const text = selected.length === 0 ? label : selected.length <= 2 ? `${label}: ${selected.map((s) => s.label).join(', ')}` : `${label}: ${selected.length} valda`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterChip label={text} active={selected.length > 0} onClear={selected.length ? () => onChange([]) : undefined} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={value.includes(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(c) => onChange(c ? [...value, o.value] : value.filter((v) => v !== o.value))}
          >
            <span className="flex-1">{o.label}</span>
            {o.count != null ? <span className="font-mono text-[11px] text-ink-muted">{o.count}</span> : null}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Rad med filterchips + "Rensa" */
export function FilterBar({ children, onReset, hasActive, className }: { children: React.ReactNode; onReset?: () => void; hasActive?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="search">
      {children}
      {onReset && hasActive ? (
        <button type="button" onClick={onReset} className="h-9 px-2 text-[13px] text-ink-soft hover:text-ink">
          Rensa
        </button>
      ) : null}
    </div>
  )
}
