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
  href,
  className,
}: {
  label: React.ReactNode
  value: number | string | null | undefined
  note?: React.ReactNode
  tone?: StatusTone
  href?: string
  className?: string
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-soft">{label}</span>
        {tone ? <span className={cn('size-2 rounded-full', toneClasses[tone].dot)} /> : null}
      </div>
      <span className="font-display text-[32px] font-semibold leading-none text-ink">{typeof value === 'number' ? formatNumber(value) : value ?? '–'}</span>
      {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
    </>
  )
  const cls = cn('flex flex-col gap-2.5 rounded-[12px] border border-line bg-white px-5 py-4', href && 'transition-colors hover:border-sea/40 hover:bg-sand-soft', className)
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
