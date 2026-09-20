import * as React from "react"
import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("rounded-[12px] border border-line bg-white", className)} {...props} />
}

function CardHeader({ className, title, description, actions, children, ...props }: React.ComponentProps<"div"> & { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div data-slot="card-header" className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)} {...props}>
      <div className="flex min-w-0 flex-col gap-0.5">
        {title ? <h2 className="font-display text-base font-semibold text-ink">{title}</h2> : null}
        {description ? <p className="text-[13px] text-ink-soft">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-body" className={cn("px-5 py-4", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center justify-between gap-3 border-t border-line px-5 py-3", className)} {...props} />
}

/** Sektionsrubrik i versaler (t.ex. i sidopaneler) */
function SectionLabel({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted", className)} {...props} />
}

export { Card, CardHeader, CardBody, CardFooter, SectionLabel }
