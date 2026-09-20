import * as React from "react"
import { cn } from "@/lib/utils"
import { getStatus, qualityTone, toneClasses, type StatusDomain, type StatusTone } from "@/lib/status"

export function ToneBadge({ tone, children, className, dot = true }: { tone: StatusTone; children: React.ReactNode; className?: string; dot?: boolean }) {
  const t = toneClasses[tone]
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-medium", t.chip, className)}>
      {dot ? <span className={cn("size-1.5 rounded-full", t.dot)} /> : null}
      {children}
    </span>
  )
}

/** Statusbadge för valfri domän: <StatusBadge domain="event" value={event.status} /> */
export function StatusBadge({ domain, value, className }: { domain: StatusDomain; value: string | boolean | null | undefined; className?: string }) {
  const meta = getStatus(domain, value)
  return (
    <ToneBadge tone={meta.tone} className={className}>
      {meta.label}
    </ToneBadge>
  )
}

/** Kategori-chip (blå) */
export function CategoryChip({ children, className, muted }: { children: React.ReactNode; className?: string; muted?: boolean }) {
  return (
    <span className={cn("inline-flex w-fit items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", muted ? "bg-stone text-ink-soft" : "bg-sea-light text-sea-dark", className)}>
      {children}
    </span>
  )
}

/** Kvalitetspoäng som prick + siffra */
export function QualityDot({ score, className, showLabel = true }: { score: number | null | undefined; className?: string; showLabel?: boolean }) {
  const tone = qualityTone(score)
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs text-ink", className)} title={score == null ? "Ingen kvalitetspoäng" : `Kvalitetspoäng ${score}`}>
      <span className={cn("size-2 rounded-full", toneClasses[tone].dot)} />
      {showLabel ? (score ?? "–") : null}
    </span>
  )
}
