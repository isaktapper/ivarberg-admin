'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Flytande mörk verktygsrad som dyker upp när rader är markerade. */
export function BulkBar({ count, onClear, children, className, itemLabel = 'valda' }: { count: number; onClear: () => void; children: React.ReactNode; className?: string; itemLabel?: string }) {
  if (count === 0) return null
  return (
    <div
      role="toolbar"
      aria-label="Åtgärder för markerade"
      className={cn(
        'animate-toast-in fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-[12px] bg-ink py-2 pl-4 pr-2 text-white shadow-[var(--shadow-float)]',
        'md:left-[calc(50%+120px)]',
        className
      )}
    >
      <span className="mr-2 text-[13px] font-medium">
        <span className="font-mono">{count}</span> {itemLabel}
      </span>
      {children}
      <button type="button" aria-label="Avmarkera" onClick={onClear} className="ml-1 inline-flex size-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white">
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export function BulkButton({ className, primary, danger, ...props }: React.ComponentProps<'button'> & { primary?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'h-8 rounded-[8px] px-3 text-[13px] font-medium transition-colors disabled:opacity-50',
        primary ? 'bg-sea font-semibold text-white hover:bg-sea-dark' : danger ? 'text-[#F5B08A] hover:bg-white/10' : 'text-white hover:bg-white/10',
        className
      )}
      {...props}
    />
  )
}
