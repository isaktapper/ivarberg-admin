'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { EventStatus } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import EventHeatmap from '@/components/EventHeatmap'
import { Calendar, Users, TrendingUp, Clock } from 'lucide-react'

interface DashboardStats {
  totalEvents: number
  publishedEvents: number
  draftEvents: number
  pendingEvents: number
  totalOrganizers: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalEvents: 0,
    publishedEvents: 0,
    draftEvents: 0,
    pendingEvents: 0,
    totalOrganizers: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Räkna med count-queries - att hämta rader och räkna .length
      // cappas av Supabase vid 1000 rader och ger fel siffror
      const countEvents = (status?: string) => {
        let query = supabase.from('events').select('*', { count: 'exact', head: true })
        if (status) query = query.eq('status', status)
        return query
      }

      const [total, published, draft, pending, organizers] = await Promise.all([
        countEvents(),
        countEvents('published'),
        countEvents('draft'),
        countEvents('pending_approval'),
        supabase.from('organizers').select('*', { count: 'exact', head: true }),
      ])

      for (const result of [total, published, draft, pending, organizers]) {
        if (result.error) throw result.error
      }

      setStats({
        totalEvents: total.count || 0,
        publishedEvents: published.count || 0,
        draftEvents: draft.count || 0,
        pendingEvents: pending.count || 0,
        totalOrganizers: organizers.count || 0,
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }


  if (loading) {
    return (
      <ProtectedLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </ProtectedLayout>
    )
  }

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Översikt över dina events och organizers
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Calendar className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Totala Events
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.totalEvents}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Publicerade
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.publishedEvents}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-6 w-6 text-yellow-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Utkast
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.draftEvents}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Users className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Organizers
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.totalOrganizers}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Event Heatmap Calendar */}
        <EventHeatmap />
      </div>
    </ProtectedLayout>
  )
}
