'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check, ChevronDown, ChevronsUpDown, LogOut, Search, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { scopeEvents, scopeTenant, TENANT_STATUS_LABEL } from '@/lib/tenants'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { NAV, isActive, type NavGroup, type NavItem } from './nav'
import { InuMark } from './InuMark'
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
  const { tenant, ready } = useTenant()

  React.useEffect(() => {
    if (!ready) return
    let alive = true
    const load = async () => {
      const [review, tips, alerts] = await Promise.all([
        scopeEvents(supabase.from('events').select('*', { count: 'exact', head: true }).in('status', ['draft', 'pending_approval']), tenant),
        scopeTenant(supabase.from('event_tips').select('*', { count: 'exact', head: true }).eq('status', 'pending'), tenant),
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
  }, [tenant, ready])

  return counts
}

/**
 * Vilka grupper som är utfällda. Vid varje sidbyte fälls gruppen med sidan man
 * står på ut och alla andra ihop. Däremellan kan man fälla ut och ihop vilken
 * grupp som helst, även den man står i.
 */
function useOpenGroups(pathname: string) {
  const activeGroup = NAV.find((g) => g.items.some((item) => isActive(item, pathname)))?.key
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : []))

  React.useEffect(() => {
    setOpenGroups(new Set(activeGroup ? [activeGroup] : []))
  }, [pathname, activeGroup])

  const toggleGroup = React.useCallback((key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return { openGroups, toggleGroup }
}

function CountBadge({ value, tone }: { value: number; tone: 'tips' | 'alert' }) {
  if (value <= 0) return null
  return (
    <span className={cn('min-w-5 rounded-full px-1.5 py-0.5 text-center font-mono text-[11px] font-medium', tone === 'tips' ? 'bg-lime text-ink' : 'bg-poppy text-white')}>
      {value > 99 ? '99+' : value}
    </span>
  )
}

/** En grupp i menyn: rubrikrad med ikon som fäller ut länkarna. En grupp med en enda länk blir en vanlig länk. */
function NavSection({
  group,
  items,
  pathname,
  counts,
  open,
  onToggle,
  onNavigate,
}: {
  group: NavGroup
  items: NavItem[]
  pathname: string
  counts: BadgeCounts
  open: boolean
  onToggle: () => void
  onNavigate?: () => void
}) {
  const Icon = group.icon
  const badgeOf = (item: NavItem) => (item.badge ? counts[item.badge] : 0)
  const toneOf = (item: NavItem): 'tips' | 'alert' => (item.badge === 'tips' ? 'tips' : 'alert')
  if (items.length === 0) return null

  // Enkel länk (Översikt)
  if (items.length === 1 && !group.label) {
    const item = items[0]
    const active = isActive(item, pathname)
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-11 items-center gap-3 rounded-[12px] px-3 text-sm font-medium transition-colors',
          active ? 'bg-white text-ink shadow-[var(--shadow-card)]' : 'text-ink-soft hover:bg-white/70 hover:text-ink'
        )}
      >
        <Icon className={cn('size-[18px] shrink-0', active ? 'text-ink' : 'text-ink-muted')} />
        <span className="flex-1 truncate">{item.label}</span>
        <CountBadge value={badgeOf(item)} tone={toneOf(item)} />
      </Link>
    )
  }

  const groupActive = items.some((item) => isActive(item, pathname))
  const panelId = `nav-group-${group.key}`
  // Hopfälld grupp visar summan av länkarnas räknare, så inget väntande försvinner ur sikte
  const hiddenAlerts = open ? 0 : items.filter((i) => i.badge && i.badge !== 'tips').reduce((sum, i) => sum + badgeOf(i), 0)
  const hiddenTips = open ? 0 : items.filter((i) => i.badge === 'tips').reduce((sum, i) => sum + badgeOf(i), 0)

  return (
    <div className={cn('rounded-[12px] transition-colors', open && 'bg-white/60')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex h-11 w-full items-center gap-3 rounded-[12px] px-3 text-left text-sm font-medium text-ink hover:bg-white/70"
      >
        <Icon className={cn('size-[18px] shrink-0', groupActive ? 'text-ink' : 'text-ink-muted')} />
        <span className="flex-1 truncate">{group.label}</span>
        <CountBadge value={hiddenAlerts} tone="alert" />
        <CountBadge value={hiddenTips} tone="tips" />
        <ChevronDown className={cn('size-4 shrink-0 text-ink-faint transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <div id={panelId} className={cn('grid transition-[grid-template-rows] duration-200 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <ul className="flex flex-col gap-0.5 px-1.5 pb-1.5">
            {items.map((item) => {
              const active = isActive(item, pathname)
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    tabIndex={open ? undefined : -1}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-10 items-center gap-3 rounded-[10px] pl-[38px] pr-2.5 text-[13.5px] transition-colors',
                      active ? 'bg-white font-medium text-ink shadow-[var(--shadow-card)]' : 'text-ink-soft hover:bg-white hover:text-ink'
                    )}
                  >
                    <span className="flex-1 truncate">{item.label}</span>
                    {active ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-lime ring-2 ring-lime/30" /> : null}
                    <CountBadge value={badgeOf(item)} tone={toneOf(item)} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ counts, onOpenSearch, onNavigate, className }: { counts: BadgeCounts; onOpenSearch: () => void; onNavigate?: () => void; className?: string }) {
  const pathname = usePathname() || '/'
  const { user, signOut } = useAuth()
  const { tenant, tenants, isPlatformAdmin, switchTenant } = useTenant()
  const showSwitcher = tenants.length > 1
  const { openGroups, toggleGroup } = useOpenGroups(pathname)

  return (
    <nav aria-label="Huvudmeny" className={cn('flex h-full w-64 shrink-0 flex-col gap-4 bg-sand px-3 pb-4 pt-5', className)}>
      <div className="flex items-center justify-between px-2">
        <Link href="/" onClick={onNavigate} aria-label="inu admin, till översikten" className="flex items-center gap-2">
          <InuMark className="h-[18px] w-auto text-ink" />
          <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-ink">admin</span>
        </Link>
        <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-lime">beta</span>
      </div>

      {showSwitcher && tenant ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Vald stad: ${tenant.city_name}. Byt stad`}
              className="flex h-12 items-center gap-2.5 rounded-[12px] bg-white px-3 text-left outline-none hover:bg-sand-soft focus-visible:ring-2 focus-visible:ring-lime"
            >
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: tenant.theme?.colors?.primary || '#0F5AA6' }} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-semibold text-ink">{tenant.city_name}</span>
                <span className="truncate text-[11px] text-ink-muted">{tenant.primary_domain}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-ink-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[216px]">
            <DropdownMenuLabel>Stad</DropdownMenuLabel>
            {tenants.map((t) => (
              <DropdownMenuItem key={t.id} onSelect={() => (t.id === tenant.id ? undefined : switchTenant(t.slug))}>
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: t.theme?.colors?.primary || '#0F5AA6' }} />
                <span className="flex-1 truncate">{t.city_name}</span>
                {t.status !== 'live' ? <span className="text-[11px] text-ink-muted">{TENANT_STATUS_LABEL[t.status]}</span> : null}
                {t.id === tenant.id ? <Check className="!text-sea" /> : null}
              </DropdownMenuItem>
            ))}
            {isPlatformAdmin ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/admin/cities" onClick={onNavigate}>
                    <Settings2 /> Hantera städer
                  </Link>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Sök eller hoppa till (Cmd+K)"
        className="flex h-10 items-center gap-2.5 rounded-[12px] bg-white px-3 text-left text-[13px] text-ink-muted hover:bg-sand-soft"
      >
        <Search className="size-4" />
        <span className="flex-1">Sök eller hoppa till…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <div className="thin-scroll -mx-1 flex flex-1 flex-col gap-1 overflow-y-auto px-1">
        {NAV.map((group) => (
          <NavSection
            key={group.key}
            group={group}
            items={group.items.filter((item) => !item.platformOnly || isPlatformAdmin)}
            pathname={pathname}
            counts={counts}
            open={openGroups.has(group.key)}
            onToggle={() => toggleGroup(group.key)}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      <div className="flex items-center gap-2.5 rounded-[12px] bg-white p-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-lime font-display text-[13px] font-semibold text-ink">{initials(user?.email)}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-ink">{user?.email?.split('@')[0]}</span>
          <span className="truncate text-[11px] text-ink-muted">{user?.email}</span>
        </div>
        <button type="button" onClick={() => signOut()} aria-label="Logga ut" title="Logga ut" className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-stone hover:text-ink">
          <LogOut className="size-4" />
        </button>
      </div>
    </nav>
  )
}
