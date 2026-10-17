'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Sökfält med ikon, debounce och rensa-knapp. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Sök…',
  debounce = 250,
  className,
  autoFocus,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  debounce?: number
  className?: string
  autoFocus?: boolean
  'aria-label'?: string
}) {
  const [local, setLocal] = React.useState(value)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => setLocal(value), [value])

  const emit = (v: string) => {
    setLocal(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(v), debounce)
  }

  return (
    <div className={cn('flex h-9 items-center gap-2 rounded-[8px] border border-line bg-white px-3 focus-within:border-sea focus-within:ring-2 focus-within:ring-sea/20', className)}>
      <Search className="size-[15px] shrink-0 text-ink-muted" />
      <input
        type="search"
        aria-label={ariaLabel ?? placeholder}
        value={local}
        autoFocus={autoFocus}
        onChange={(e) => emit(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
      />
      {local ? (
        <button type="button" aria-label="Rensa sökning" onClick={() => { setLocal(''); onChange('') }} className="rounded p-0.5 text-ink-faint hover:text-ink">
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
