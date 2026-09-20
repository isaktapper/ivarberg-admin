import * as React from "react"
import { cn } from "@/lib/utils"

/** Sidans H1 + beskrivning till vänster, åtgärder till höger. */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {description ? <p className="text-sm text-ink-soft">{description}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        {meta ? <span className="font-mono text-xs text-ink-muted">{meta}</span> : null}
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
