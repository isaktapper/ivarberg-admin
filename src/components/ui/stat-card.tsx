import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { toneClasses, type StatusTone } from '@/lib/status'

/** Siffra + etikett + not. Klickbar om href anges. */
export function StatCard({
  label,
  value,
  note,
  tone,
  icon,
  badge,
  href,
  className,
}: {
  label: React.ReactNode
  value: number | string | null | undefined
  note?: React.ReactNode
  tone?: StatusTone
  /** Ikon i en liten ruta före etiketten */
  icon?: React.ReactNode
  /** Chip bredvid siffran (ersätter tonpricken), t.ex. "+3 sedan igår" */
  badge?: React.ReactNode
  href?: string
  className?: string
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink-soft">
          {icon ? <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-stone text-ink [&_svg]:size-4">{icon}</span> : null}
          <span className="truncate">{label}</span>
        </span>
        {!badge && tone ? <span className={cn('size-2 shrink-0 rounded-full', toneClasses[tone].dot)} /> : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular font-display text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink">{typeof value === 'number' ? formatNumber(value) : value ?? '–'}</span>
        {badge}
      </div>
      {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
    </>
  )
  const cls = cn('flex flex-col gap-3 rounded-[16px] bg-white px-5 py-4', href && 'transition-colors hover:bg-sand-soft', className)
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
