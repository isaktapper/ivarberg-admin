'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Navigation from './Navigation'
import { cn } from '@/lib/utils'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return null // Middleware will redirect to login
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation onSidebarToggle={setSidebarCollapsed} />
      {/* Main content with dynamic sidebar offset */}
      <main 
        className={cn(
          'pt-16 md:pt-0 transition-all duration-300',
          sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'
        )}
      >
        <div className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
