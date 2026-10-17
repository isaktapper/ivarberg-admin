'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Search, CornerDownLeft, Calendar, Users, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { ALL_NAV_ITEMS } from './nav'
import { formatDay } from '@/lib/format'
import { Kbd } from '@/components/ui/kbd'

interface Item {
  id: string
  group: 'Sidor' | 'Åtgärder' | 'Events' | 'Arrangörer'
  label: string
  hint?: string
  href: string
  icon: React.ReactNode
}

/** ⌘K: hoppa till sida, skapa nytt, eller sök events och arrangörer. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const [q, setQ] = React.useState('')
  const [remote, setRemote] = React.useState<Item[]>([])
  const [active, setActive] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) {
      setQ('')
      setRemote([])
      setActive(0)
    }
  }, [open])

  React.useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setRemote([])
      return
    }
    let alive = true
    const t = setTimeout(async () => {
      const like = `%${term.replace(/[%_]/g, '')}%`
      const [ev, org] = await Promise.all([
        supabase.from('events').select('id, name, date_time, venue_name').or(`name.ilike.${like},venue_name.ilike.${like}`).order('date_time', { ascending: false }).limit(6),
        supabase.from('organizers').select('id, name, status').ilike('name', like).limit(4),
      ])
      if (!alive) return
      const items: Item[] = []
      ev.data?.forEach((e) => items.push({ id: `e${e.id}`, group: 'Events', label: e.name, hint: `${formatDay(e.date_time)} · ${e.venue_name ?? ''}`, href: `/events/${e.id}/edit`, icon: <Calendar className="size-4" /> }))
      org.data?.forEach((o) => items.push({ id: `o${o.id}`, group: 'Arrangörer', label: o.name, hint: o.status, href: `/organizers/${o.id}`, icon: <Users className="size-4" /> }))
      setRemote(items)
    }, 200)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  const local: Item[] = React.useMemo(() => {
    const term = q.trim().toLowerCase()
    const pages: Item[] = ALL_NAV_ITEMS.map((n) => ({ id: n.key, group: 'Sidor', label: n.label, href: n.href, icon: <n.icon className="size-4" /> }))
    const actions: Item[] = [
      { id: 'new-event', group: 'Åtgärder', label: 'Skapa nytt event', href: '/events/new', icon: <Plus className="size-4" /> },
      { id: 'new-org', group: 'Åtgärder', label: 'Skapa ny arrangör', href: '/organizers/new', icon: <Plus className="size-4" /> },
    ]
    const all = [...actions, ...pages]
    return term ? all.filter((i) => i.label.toLowerCase().includes(term)) : all
  }, [q])

  const items = [...local, ...remote]

  React.useEffect(() => setActive(0), [q, remote.length])

  const go = (item: Item) => {
    onOpenChange(false)
    router.push(item.href)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault()
      go(items[active])
    }
  }

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  let lastGroup = ''
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="animate-fade-in fixed inset-0 z-50 bg-ink/40" />
        <DialogPrimitive.Content
          onKeyDown={onKey}
          className="animate-pop-in fixed left-1/2 top-[18%] z-50 w-[calc(100%-32px)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[12px] border border-line bg-white shadow-[var(--shadow-pop)] outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Sök eller hoppa till</DialogPrimitive.Title>
          <div className="flex h-12 items-center gap-3 border-b border-line px-4">
            <Search className="size-4 text-ink-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök event, arrangör eller sida…" className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint" />
            <Kbd>esc</Kbd>
          </div>
          <div ref={listRef} className="thin-scroll max-h-[50vh] overflow-y-auto py-2">
            {items.length === 0 ? <div className="px-4 py-8 text-center text-[13px] text-ink-muted">Inga träffar</div> : null}
            {items.map((item, i) => {
              const showGroup = item.group !== lastGroup
              lastGroup = item.group
              return (
                <React.Fragment key={item.id}>
                  {showGroup ? <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{item.group}</div> : null}
                  <button
                    type="button"
                    data-index={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={cn('flex w-full items-center gap-3 px-4 py-2 text-left text-[13px]', i === active ? 'bg-sea-lightest text-ink' : 'text-ink')}
                  >
                    <span className="text-ink-muted">{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.hint ? <span className="truncate font-mono text-[11px] text-ink-muted">{item.hint}</span> : null}
                    {i === active ? <CornerDownLeft className="size-3.5 text-ink-faint" /> : null}
                  </button>
                </React.Fragment>
              )
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
