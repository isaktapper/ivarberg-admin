'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import {
  Calendar,
  Users,
  LayoutDashboard,
  LogOut,
  CheckSquare,
  Download,
  BarChart3,
  AlertCircle,
  Globe,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Events', href: '/events', icon: Calendar },
  { name: 'Granska Events', href: '/events/review', icon: CheckSquare, badge: true },
  { name: 'Tips', href: '/admin/tips', icon: AlertCircle, badge: true },
  { name: 'Duplicates', href: '/events/duplicates', icon: AlertCircle },
  { name: 'Statistik', href: '/events/statistics', icon: BarChart3 },
  { name: 'Scrapers', href: '/scrapers', icon: Download },
  { name: 'Organizers', href: '/organizers', icon: Users },
  { name: 'Arrangörssidor', href: '/organizer-pages', icon: Globe },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { signOut, user } = useAuth()
  const { toggleSidebar, state } = useSidebar()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    fetchPendingCount()

    // Subscription för att uppdatera count i realtid
    const subscription = supabase
      .channel('events-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          fetchPendingCount()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const fetchPendingCount = async () => {
    try {
      const { count } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .in('status', ['draft', 'pending_approval'])

      setPendingCount(count || 0)
    } catch (error) {
      console.error('Error fetching pending count:', error)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center justify-between px-2 py-2">
          <SidebarMenu className="flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground group-data-[collapsible=icon]:hidden">
                    <img
                      src={`/Group 31 (1).png`}
                      alt="Ivarberg Admin"
                      className="h-6 w-auto object-contain"
                    />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <img
                      src={`/Group 31 (1).png`}
                      alt="Ivarberg Admin"
                      className="h-6 w-auto object-contain"
                    />
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <button
            onClick={toggleSidebar}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            title={state === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {state === 'collapsed' ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href ||
                  (item.href === '/events/review' && pathname?.startsWith('/events/review')) ||
                  (item.href === '/events/statistics' && pathname?.startsWith('/events/statistics')) ||
                  (item.href === '/organizer-pages' && pathname?.startsWith('/organizer-pages')) ||
                  (item.href === '/admin/tips' && pathname?.startsWith('/admin/tips'))

                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge && item.href === '/events/review' && pendingCount > 0 && (
                      <SidebarMenuBadge className="bg-red-500 text-white">
                        {pendingCount > 99 ? '99+' : pendingCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarSeparator className="mb-2" />
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm group-data-[collapsible=icon]:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
                <span className="text-xs font-medium">
                  {user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {user?.email}
                </p>
              </div>
            </div>
            <SidebarMenuButton onClick={handleSignOut} tooltip="Logga ut">
              <LogOut />
              <span>Logga ut</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

