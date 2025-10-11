'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Organizer } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye,
  Mail,
  Phone,
  MapPin,
  Globe,
  Users
} from 'lucide-react'
import Link from 'next/link'

export default function OrganizersPage() {
  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [filteredOrganizers, setFilteredOrganizers] = useState<Organizer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchOrganizers()
  }, [])

  useEffect(() => {
    filterOrganizers()
  }, [organizers, searchTerm]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrganizers = async () => {
    try {
      const { data, error } = await supabase
        .from('organizers')
        .select('*')
        .order('name')

      if (error) throw error
      setOrganizers(data || [])
    } catch (error) {
      console.error('Error fetching organizers:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterOrganizers = () => {
    let filtered = organizers

    if (searchTerm) {
      filtered = filtered.filter(organizer =>
        organizer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        organizer.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        organizer.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    setFilteredOrganizers(filtered)
  }

  const deleteOrganizer = async (id: number) => {
    if (!confirm('Är du säker på att du vill ta bort denna organizer?')) {
      return
    }

    try {
      // Check if organizer has events
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id')
        .eq('organizer_id', id)

      if (eventsError) throw eventsError

      if (events && events.length > 0) {
        alert('Kan inte ta bort organizer som har events kopplade till sig. Ta bort eller uppdatera events först.')
        return
      }

      const { error } = await supabase
        .from('organizers')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      setOrganizers(organizers.filter(organizer => organizer.id !== id))
    } catch (error) {
      console.error('Error deleting organizer:', error)
      alert('Fel vid borttagning av organizer')
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
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organizers</h1>
            <p className="mt-1 text-sm text-gray-500">
              Hantera alla event-organizers
            </p>
          </div>
          <Link
            href="/organizers/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ny Organizer
          </Link>
        </div>

        {/* Search */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Sök organizers..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Organizers List */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {filteredOrganizers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Inga organizers</h3>
              <p className="mt-1 text-sm text-gray-500">
                Kom igång genom att skapa din första organizer.
              </p>
              <div className="mt-6">
                <Link
                  href="/organizers/new"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ny Organizer
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-1/4">
                      Namn
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-56">
                      Kontakt
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-40">
                      Plats
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                      Webbsida
                    </th>
                    <th className="px-2 py-2 text-right w-28">
                      <span className="sr-only">Åtgärder</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredOrganizers.map((organizer) => (
                    <tr key={organizer.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {organizer.name}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-gray-900 space-y-0.5">
                          {organizer.email && (
                            <a 
                              href={`mailto:${organizer.email}`}
                              className="text-blue-600 hover:text-blue-800 block truncate"
                              title={organizer.email}
                            >
                              {organizer.email}
                            </a>
                          )}
                          {organizer.phone && (
                            <a 
                              href={`tel:${organizer.phone}`}
                              className="text-blue-600 hover:text-blue-800 block"
                            >
                              {organizer.phone}
                            </a>
                          )}
                          {!organizer.email && !organizer.phone && (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-sm text-gray-500 truncate">
                          {organizer.location || '-'}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {organizer.website ? (
                          <a
                            href={organizer.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                          >
                            <Globe className="w-3 h-3" />
                            Besök
                          </a>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/organizers/${organizer.id}`}
                            className="text-blue-600 hover:bg-blue-50 p-1 rounded"
                            title="Visa"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <Link
                            href={`/organizers/${organizer.id}/edit`}
                            className="text-indigo-600 hover:bg-indigo-50 p-1 rounded"
                            title="Redigera"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => deleteOrganizer(organizer.id)}
                            className="text-red-600 hover:bg-red-50 p-1 rounded"
                            title="Ta bort"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  )
}
