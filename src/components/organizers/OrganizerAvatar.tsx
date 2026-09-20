import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'

export function OrganizerAvatar({ name, warn, size = 32, className }: { name: string; warn?: boolean; size?: number; className?: string }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn('flex shrink-0 items-center justify-center rounded-[8px] font-display font-semibold', warn ? 'bg-amber-light text-amber' : 'bg-ink text-white', className)}
    >
      {initials(name)}
    </span>
  )
}
