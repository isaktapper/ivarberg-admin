'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Event, EventStatus, EventCategory } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye,
  Star,
  Calendar,
  MapPin,
  User,
  CheckSquare,
  Square
} from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | 'all'>('all')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<EventStatus>('published')
  const [bulkUpdating, setBulkUpdating] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50

  useEffect(() => {
    fetchEvents()
  }, [])

  useEffect(() => {
    filterEvents()
    setCurrentPage(1) // Reset till första sidan vid filtrering
  }, [events, searchTerm, statusFilter, categoryFilter, dateFromFilter, dateToFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          organizer:organizers(name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setEvents(data || [])
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterEvents = () => {
    let filtered = events

    if (searchTerm) {
      filtered = filtered.filter(event =>
        event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.venue_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(event => event.status === statusFilter)
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(event => event.category === categoryFilter)
    }

    // Datum-filter (created_at)
    if (dateFromFilter) {
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.created_at)
        const fromDate = new Date(dateFromFilter)
        return eventDate >= fromDate
      })
    }

    if (dateToFilter) {
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.created_at)
        const toDate = new Date(dateToFilter)
        // Lägg till 23:59:59 på toDate för att inkludera hela dagen
        toDate.setHours(23, 59, 59, 999)
        return eventDate <= toDate
      })
    }

    setFilteredEvents(filtered)
  }

  const deleteEvent = async (id: number) => {
    if (!confirm('Är du säker på att du vill ta bort detta event?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      setEvents(events.filter(event => event.id !== id))
    } catch (error) {
      console.error('Error deleting event:', error)
      alert('Fel vid borttagning av event')
    }
  }

  const toggleFeatured = async (id: number, currentFeatured: boolean) => {
    try {
      const { error } = await supabase
        .from('events')
        .update({ featured: !currentFeatured })
        .eq('id', id)

      if (error) throw error
      
      setEvents(events.map(event => 
        event.id === id 
          ? { ...event, featured: !currentFeatured }
          : event
      ))
    } catch (error) {
      console.error('Error updating featured status:', error)
      alert('Fel vid uppdatering av featured status')
    }
  }

  const toggleSelectAll = () => {
    if (selectedEvents.size === filteredEvents.length) {
      setSelectedEvents(new Set())
    } else {
      setSelectedEvents(new Set(filteredEvents.map(e => e.id)))
    }
  }

  const toggleSelectEvent = (id: number) => {
    const newSelected = new Set(selectedEvents)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedEvents(newSelected)
  }

  const bulkUpdateStatus = async () => {
    if (selectedEvents.size === 0) {
      alert('Välj minst ett event')
      return
    }

    if (!confirm(`Är du säker på att du vill ändra status till "${getStatusText(bulkStatus)}" för ${selectedEvents.size} events?`)) {
      return
    }

    setBulkUpdating(true)
    try {
      const { error } = await supabase
        .from('events')
        .update({ status: bulkStatus })
        .in('id', Array.from(selectedEvents))

      if (error) throw error
      
      // Uppdatera lokalt state
      setEvents(events.map(event => 
        selectedEvents.has(event.id)
          ? { ...event, status: bulkStatus }
          : event
      ))
      
      setSelectedEvents(new Set())
      alert(`${selectedEvents.size} events uppdaterade!`)
    } catch (error) {
      console.error('Error bulk updating events:', error)
      alert('Fel vid uppdatering av events')
    } finally {
      setBulkUpdating(false)
    }
  }

  const getStatusColor = (status: EventStatus) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-800'
      case 'draft':
        return 'bg-gray-100 text-gray-800'
      case 'pending_approval':
        return 'bg-yellow-100 text-yellow-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: EventStatus) => {
    switch (status) {
      case 'published':
        return 'Publicerad'
      case 'draft':
        return 'Utkast'
      case 'pending_approval':
        return 'Väntar godkännande'
      case 'cancelled':
        return 'Avbruten'
      default:
        return status
    }
  }
  
  // Pagination calculations
  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedEvents = filteredEvents.slice(startIndex, endIndex)

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
            <h1 className="text-2xl font-bold text-gray-900">Events</h1>
            <p className="mt-1 text-sm text-gray-500">
              Hantera alla dina events
            </p>
          </div>
          <Link
            href="/events/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nytt Event
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Sök events..."
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as EventStatus | 'all')}
            >
              <option value="all">Alla statusar</option>
              <option value="draft">Utkast</option>
              <option value="pending_approval">Väntar godkännande</option>
              <option value="published">Publicerad</option>
              <option value="cancelled">Avbruten</option>
            </select>

            <select
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as EventCategory | 'all')}
            >
              <option value="all">Alla kategorier</option>
              <option value="Scen">Scen</option>
              <option value="Nattliv">Nattliv</option>
              <option value="Sport">Sport</option>
              <option value="Konst">Konst</option>
              <option value="Föreläsningar">Föreläsningar</option>
              <option value="Barn & Familj">Barn & Familj</option>
              <option value="Mat & Dryck">Mat & Dryck</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedEvents.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-blue-900">
                  {selectedEvents.size} event{selectedEvents.size > 1 ? 's' : ''} valda
                </span>
                <select
                  className="px-3 py-1.5 text-sm border border-blue-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as EventStatus)}
                >
                  <option value="draft">Utkast</option>
                  <option value="pending_approval">Väntar godkännande</option>
                  <option value="published">Publicerad</option>
                  <option value="cancelled">Avbruten</option>
                </select>
                <button
                  onClick={bulkUpdateStatus}
                  disabled={bulkUpdating}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {bulkUpdating ? 'Uppdaterar...' : 'Uppdatera status'}
                </button>
              </div>
              <button
                onClick={() => setSelectedEvents(new Set())}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Rensa val
              </button>
            </div>
          </div>
        )}

        {/* Events List */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Inga events</h3>
              <p className="mt-1 text-sm text-gray-500">
                Kom igång genom att skapa ditt första event.
              </p>
              <div className="mt-6">
                <Link
                  href="/events/new"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nytt Event
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left w-10">
                      <button
                        onClick={toggleSelectAll}
                        className="text-gray-600 hover:text-gray-900"
                        title={selectedEvents.size === filteredEvents.length ? 'Avmarkera alla' : 'Markera alla'}
                      >
                        {selectedEvents.size === filteredEvents.length && filteredEvents.length > 0 ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-1/4">
                      Event
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                      Datum
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-40">
                      Plats
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-28">
                      Kategori
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                      Organizer
                    </th>
                    <th className="px-2 py-2 text-right w-36">
                      <span className="sr-only">Åtgärder</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedEvents.map((event) => (
                    <tr key={event.id} className={`hover:bg-gray-50 ${selectedEvents.has(event.id) ? 'bg-blue-50' : ''}`}>
                      {/* Checkbox */}
                      <td className="px-2 py-2 whitespace-nowrap">
                        <button
                          onClick={() => toggleSelectEvent(event.id)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          {selectedEvents.has(event.id) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      
                      {/* Event namn */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 min-w-0">
                          {event.featured && (
                            <Star className="h-3 w-3 text-yellow-400 fill-current flex-shrink-0" />
                          )}
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {event.name}
                          </div>
                        </div>
                      </td>
                      
                      {/* Datum */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(event.date_time)}
                        </div>
                      </td>
                      
                      {/* Plats */}
                      <td className="px-3 py-2">
                        <div className="text-sm text-gray-900 truncate">
                          {event.venue_name || event.location}
                        </div>
                      </td>
                      
                      {/* Kategori */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {event.category}
                        </span>
                      </td>
                      
                      {/* Status */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(event.status)}`}>
                          {getStatusText(event.status)}
                        </span>
                      </td>
                      
                      {/* Organizer */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-500 truncate">
                          {event.organizer?.name || '-'}
                        </div>
                      </td>
                      
                      {/* Actions */}
                      <td className="px-2 py-2 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggleFeatured(event.id, event.featured)}
                            className={`p-1 rounded hover:bg-gray-100 ${
                              event.featured ? 'text-yellow-600' : 'text-gray-400'
                            }`}
                            title={event.featured ? 'Ta bort från featured' : 'Lägg till i featured'}
                          >
                            <Star className={`w-4 h-4 ${event.featured ? 'fill-current' : ''}`} />
                          </button>
                          <a
                            href={`${process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://ivarberg-events-hub-iwnp.vercel.app/'}/event/${event.event_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:bg-blue-50 p-1 rounded"
                            title="Visa på publika sidan"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                          <Link
                            href={`/events/${event.id}/edit`}
                            className="text-indigo-600 hover:bg-indigo-50 p-1 rounded"
                            title="Redigera"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => deleteEvent(event.id)}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between bg-white px-4 py-3 rounded-lg shadow">
            <div className="text-sm text-gray-700">
              Visar <span className="font-medium">{startIndex + 1}</span> till <span className="font-medium">{Math.min(endIndex, filteredEvents.length)}</span> av{' '}
              <span className="font-medium">{filteredEvents.length}</span> events
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Föregående
              </button>
              
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  // Visa bara 7 sidor: första, sista, och 5 runt nuvarande
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 2 && page <= currentPage + 2)
                  ) {
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1 text-sm rounded ${
                          currentPage === page
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    )
                  } else if (
                    page === currentPage - 3 ||
                    page === currentPage + 3
                  ) {
                    return <span key={page} className="px-2 text-gray-500">...</span>
                  }
                  return null
                })}
              </div>
              
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Nästa
              </button>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  )
}
