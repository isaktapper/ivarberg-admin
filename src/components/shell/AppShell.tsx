'use client'

import * as React from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Sidebar, useBadgeCounts } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/states'
import { useHotkeys } from '@/hooks/use-hotkeys'

/** Skalet: sidomeny + topprad + innehåll. Alla admin-sidor renderas inuti. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const counts = useBadgeCounts()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)

  useHotkeys(React.useMemo(() => ({ 'mod+k': () => setSearchOpen((o) => !o) }), []))

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand">
        <Spinner className="size-7" />
      </div>
    )
  }

  if (!user) return null // middleware skickar till /login

  return (
    <div className="flex min-h-screen bg-sand">
      <div className="sticky top-0 hidden h-screen md:block">
        <Sidebar counts={counts} onOpenSearch={() => setSearchOpen(true)} />
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-60 p-0">
          <Sidebar counts={counts} onOpenSearch={() => { setMenuOpen(false); setSearchOpen(true) }} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
        <main className="flex flex-1 flex-col gap-5 px-4 py-6 md:px-8">{children}</main>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
