import * as React from 'react'
import { Loader2, AlertTriangle, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-sea', className)} aria-label="Laddar" />
}

export function LoadingState({ label = 'Laddar…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex h-48 flex-col items-center justify-center gap-2 text-[13px] text-ink-muted', className)}>
      <Spinner />
      {label}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-stone', className)} />
}

/** Skelett-rader för en tabell */
export function TableSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-12 items-center gap-4 border-b border-line-soft px-4">
          <Skeleton className="size-4" />
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-3.5 w-[30%]" />
          <Skeleton className="h-3.5 w-[12%]" />
          <Skeleton className="h-5 w-[10%] rounded-full" />
          <Skeleton className="h-3.5 w-[14%]" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-14 text-center', className)}>
      <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-sand-deep text-ink-muted [&_svg]:size-5">{icon ?? <Inbox />}</span>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description ? <p className="max-w-sm text-[13px] text-ink-soft">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ title = 'Något gick fel', description, onRetry, className }: { title?: string; description?: React.ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-[12px] border border-poppy-line bg-poppy-light/40 px-6 py-10 text-center', className)}>
      <AlertTriangle className="size-5 text-poppy" />
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description ? <p className="max-w-md text-[13px] text-ink-soft">{description}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Försök igen
        </Button>
      ) : null}
    </div>
  )
}

/** Gul/röd infobanner inuti en sida */
export function Banner({ tone = 'wait', title, children, actions, className }: { tone?: 'wait' | 'bad' | 'info' | 'ok'; title?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  const tones = {
    wait: 'border-amber-line bg-amber-light text-amber',
    bad: 'border-poppy-line bg-poppy-light text-poppy',
    info: 'border-sea-light bg-sea-lightest text-sea-dark',
    ok: 'border-kelp-light bg-kelp-light text-kelp',
  }
  return (
    <div className={cn('flex flex-col gap-2 rounded-[12px] border px-4 py-3', tones[tone], className)}>
      {title ? <span className="text-[13px] font-semibold">{title}</span> : null}
      {children ? <div className="text-[13px] text-ink">{children}</div> : null}
      {actions ? <div className="flex flex-wrap gap-3 pt-0.5 text-[13px] font-medium">{actions}</div> : null}
    </div>
  )
}
