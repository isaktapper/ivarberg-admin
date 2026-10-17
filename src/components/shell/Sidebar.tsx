'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { NAV, isActive } from './nav'
import { Kbd } from '@/components/ui/kbd'
import { initials } from '@/lib/format'

export interface BadgeCounts {
  review: number
  tips: number
  alerts: number
}

/** Räknare för menyn: väntande event, väntande tips, olösta larm. Uppdateras i realtid. */
export function useBadgeCounts(): BadgeCounts {
  const [counts, setCounts] = React.useState<BadgeCounts>({ review: 0, tips: 0, alerts: 0 })

  React.useEffect(() => {
    let alive = true
    const load = async () => {
      const [review, tips, alerts] = await Promise.all([
        supabase.from('events').select('*', { count: 'exact', head: true }).in('status', ['draft', 'pending_approval']),
        supabase.from('event_tips').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('system_alerts').select('*', { count: 'exact', head: true }).eq('resolved', false),
      ])
      if (alive) setCounts({ review: review.count ?? 0, tips: tips.count ?? 0, alerts: alerts.count ?? 0 })
    }
    load()
    const channel = supabase
      .channel('sidebar-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_tips' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_alerts' }, load)
      .subscribe()
    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [])

  return counts
}

export function Sidebar({ counts, onOpenSearch, onNavigate, className }: { counts: BadgeCounts; onOpenSearch: () => void; onNavigate?: () => void; className?: string }) {
  const pathname = usePathname() || '/'
  const { user, signOut } = useAuth()

  return (
    <nav aria-label="Huvudmeny" className={cn('flex h-full w-60 shrink-0 flex-col gap-4 border-r border-line bg-sand-deep px-3 pb-4 pt-5', className)}>
      <div className="flex items-center justify-between px-2">
        <Link href="/" onClick={onNavigate} className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Group 31 (1).png" alt="iVarberg" className="h-[26px] w-auto" />
        </Link>
        <span className="rounded-md bg-[#E7DECD] px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">Admin</span>
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Sök eller hoppa till (Cmd+K)"
        className="flex h-10 items-center gap-2.5 rounded-[10px] border border-line bg-white px-3 text-left text-[13px] text-ink-muted hover:border-ink-faint"
      >
        <Search className="size-4" />
        <span className="flex-1">Sök eller hoppa till…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <div className="thin-scroll flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {NAV.map((group, gi) => (
          <React.Fragment key={gi}>
            {group.label ? <div className="px-2.5 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{group.label}</div> : null}
            {group.items.map((item) => {
              const active = isActive(item, pathname)
              const badge = item.badge ? counts[item.badge] : 0
              const Icon = item.icon
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-[8px] px-2.5 text-sm transition-colors',
                    active ? 'bg-white font-semibold text-ink shadow-[var(--shadow-card)]' : 'font-medium text-ink-soft hover:bg-white/60 hover:text-ink'
                  )}
                >
                  <Icon className={cn('size-[18px] shrink-0', active ? 'text-sea' : 'text-ink-muted')} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge > 0 ? (
                    <span className={cn('min-w-5 rounded-full px-1.5 py-0.5 text-center font-mono text-[11px] font-medium text-white', item.badge === 'tips' ? 'bg-sea' : 'bg-poppy')}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </React.Fragment>
        ))}
      </div>

      <div className="flex items-center gap-2.5 border-t border-line pl-1 pt-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink font-display text-[13px] font-semibold text-white">{initials(user?.email)}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-ink">{user?.email?.split('@')[0]}</span>
          <span className="truncate text-[11px] text-ink-muted">{user?.email}</span>
        </div>
        <button type="button" onClick={() => signOut()} aria-label="Logga ut" title="Logga ut" className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-white hover:text-ink">
          <LogOut className="size-4" />
        </button>
      </div>
    </nav>
  )
}
