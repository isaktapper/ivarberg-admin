'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Chips + inmatning. Enter eller komma lägger till, Backspace tar bort sista. */
export function TagInput({ value, onChange, placeholder = 'Lägg till…', className, id }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; className?: string; id?: string }) {
  const [draft, setDraft] = React.useState('')

  const add = () => {
    const v = draft.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setDraft('')
  }

  return (
    <div className={cn('flex min-h-10 flex-wrap items-center gap-1.5 rounded-[8px] border border-line bg-white px-2 py-1.5 focus-within:border-sea focus-within:ring-2 focus-within:ring-sea/20', className)}>
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-stone px-2 py-0.5 text-xs text-ink">
          {tag}
          <button type="button" aria-label={`Ta bort ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))} className="rounded-full text-ink-muted hover:text-ink">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={add}
        placeholder={placeholder}
        className="min-w-24 flex-1 bg-transparent px-1 text-[13px] text-ink outline-none placeholder:text-ink-faint"
      />
    </div>
  )
}
