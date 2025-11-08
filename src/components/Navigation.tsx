'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { 
  Calendar, 
  Users, 
  LayoutDashboard, 
  LogOut,
  Menu,
  X,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  BarChart3,
  AlertCircle,
  Globe
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

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

export default function Navigation({ 
  onSidebarToggle 
}: { 
  onSidebarToggle?: (collapsed: boolean) => void 
} = {}) {
  const pathname = usePathname()
  const { signOut, user } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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
    <>
      {/* Desktop Sidebar */}
      <div
        className={cn(
          'hidden md:flex md:flex-col md:fixed md:inset-y-0 bg-gray-900 transition-all duration-300',
          sidebarCollapsed ? 'md:w-20' : 'md:w-64'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800">
          {!sidebarCollapsed && (
            <h1 className="text-lg font-bold text-white">
              Ivarberg Admin
            </h1>
          )}
          <button
            onClick={() => {
              const newState = !sidebarCollapsed
              setSidebarCollapsed(newState)
              onSidebarToggle?.(newState)
            }}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || 
              (item.href === '/events/review' && pathname?.startsWith('/events/review')) ||
              (item.href === '/events/statistics' && pathname?.startsWith('/events/statistics')) ||
              (item.href === '/organizer-pages' && pathname?.startsWith('/organizer-pages')) ||
              (item.href === '/admin/tips' && pathname?.startsWith('/admin/tips'))
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )}
                title={sidebarCollapsed ? item.name : undefined}
              >
                <Icon className={cn('flex-shrink-0 w-5 h-5', !sidebarCollapsed && 'mr-3')} />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1">{item.name}</span>
                    {item.badge && item.href === '/events/review' && pendingCount > 0 && (
                      <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                        {pendingCount}
                      </span>
                    )}
                  </>
                )}
                {sidebarCollapsed && item.badge && item.href === '/events/review' && pendingCount > 0 && (
                  <span className="absolute top-1 right-1 inline-flex items-center justify-center w-4 h-4 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-800 p-4">
          {!sidebarCollapsed ? (
            <div className="space-y-3">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                    <span className="text-sm font-medium text-white">
                      {user?.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="ml-3 overflow-hidden">
                  <p className="text-sm font-medium text-white truncate">
                    {user?.email}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-300 rounded-md hover:bg-gray-800 hover:text-white"
              >
                <LogOut className="w-5 h-5 mr-3" />
                Logga ut
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center p-2 text-gray-300 rounded-md hover:bg-gray-800 hover:text-white"
              title="Logga ut"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center justify-between h-16 px-4">
          <h1 className="text-lg font-bold text-white">
            Ivarberg Admin
          </h1>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-gray-900">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800">
              <h1 className="text-lg font-bold text-white">
                Ivarberg Admin
              </h1>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
              {navigation.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || 
                  (item.href === '/events/review' && pathname?.startsWith('/events/review')) ||
                  (item.href === '/events/statistics' && pathname?.startsWith('/events/statistics')) ||
                  (item.href === '/organizer-pages' && pathname?.startsWith('/organizer-pages')) ||
                  (item.href === '/event-tips' && pathname?.startsWith('/event-tips'))
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center justify-between px-3 py-3 text-base font-medium rounded-md',
                      isActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <div className="flex items-center">
                      <Icon className="w-5 h-5 mr-3" />
                      {item.name}
                    </div>
                    {item.badge && item.href === '/events/review' && pendingCount > 0 && (
                      <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* User section */}
            <div className="border-t border-gray-800 p-4">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
                    <span className="text-base font-medium text-white">
                      {user?.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-white">
                    {user?.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  handleSignOut()
                  setMobileMenuOpen(false)
                }}
                className="w-full flex items-center px-3 py-3 text-base font-medium text-gray-300 rounded-md hover:bg-gray-800 hover:text-white"
              >
                <LogOut className="w-5 h-5 mr-3" />
                Logga ut
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
