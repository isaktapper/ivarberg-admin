'use client'

import * as React from 'react'
import { Textarea } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Textarea med en liten markdown-verktygsrad som omsluter markerad text. */
export function MarkdownTextarea({
  id,
  value,
  onChange,
  rows = 6,
  className,
  placeholder,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  rows?: number
  className?: string
  placeholder?: string
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  const wrap = (before: string, after = before, fallback = 'text') => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || fallback
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  const prefixLines = (prefix: string) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const block = value.slice(lineStart, end) || 'punkt'
    const replaced = block
      .split('\n')
      .map((l) => (l.startsWith(prefix) ? l : prefix + l))
      .join('\n')
    onChange(value.slice(0, lineStart) + replaced + value.slice(end))
    requestAnimationFrame(() => el.focus())
  }

  const tool = 'inline-flex h-7 items-center rounded-md border border-line bg-white px-2 text-xs text-ink hover:bg-sand-soft'

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-1">
        <button type="button" className={cn(tool, 'font-semibold')} onClick={() => wrap('**')} aria-label="Fet">
          B
        </button>
        <button type="button" className={cn(tool, 'italic')} onClick={() => wrap('_')} aria-label="Kursiv">
          I
        </button>
        <button type="button" className={tool} onClick={() => wrap('[', '](https://)', 'länktext')}>
          Länk
        </button>
        <button type="button" className={tool} onClick={() => prefixLines('- ')}>
          Lista
        </button>
        <span className="ml-1.5 text-[11px] text-ink-faint">Markdown</span>
      </div>
      <Textarea ref={ref} id={id} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
