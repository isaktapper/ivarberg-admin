import { cn } from "@/lib/utils"

export function Kbd({ children, className, onDark }: { children: React.ReactNode; className?: string; onDark?: boolean }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-mono text-[11px] font-medium", onDark ? "border-white/40 text-white/80" : "border-line text-ink-faint", className)}>
      {children}
    </kbd>
  )
}
