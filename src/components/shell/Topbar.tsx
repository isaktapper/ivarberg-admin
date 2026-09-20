'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CRUMBS } from './nav'

export function Topbar({ onOpenMenu, onOpenSearch }: { onOpenMenu: () => void; onOpenSearch: () => void }) {
  const pathname = usePathname() || '/'
  const crumbs = CRUMBS.find((c) => pathname === c.prefix || (c.prefix !== '/' && pathname.startsWith(c.prefix)))?.crumbs ?? ['Översikt']

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-sand px-4 md:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" onClick={onOpenMenu} aria-label="Öppna meny" className="-ml-2 inline-flex size-9 items-center justify-center rounded-md text-ink md:hidden">
          <Menu className="size-5" />
        </button>
        <nav aria-label="Brödsmulor" className="flex min-w-0 items-center gap-2 text-[13px] text-ink-muted">
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <span aria-hidden>/</span> : null}
              <span className={i === crumbs.length - 1 ? 'truncate font-medium text-ink' : 'hidden sm:inline'}>{c}</span>
            </React.Fragment>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onOpenSearch} aria-label="Sök" className="inline-flex size-9 items-center justify-center rounded-md text-ink-soft hover:bg-stone md:hidden">
          <Search className="size-4" />
        </button>
        <Button asChild>
          <Link href="/events/new">
            <Plus className="size-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Nytt event</span>
          </Link>
        </Button>
      </div>
    </header>
  )
}
