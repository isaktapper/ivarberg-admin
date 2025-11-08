'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Event, EventStatus, EventCategory, Organizer } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import OrganizerSearchableDropdown from '@/components/OrganizerSearchableDropdown'
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
  Square,
  Settings,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'events' | 'tips'>('events')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | 'all'>('all')
  const [organizerFilter, setOrganizerFilter] = useState<number | 'all'>('all')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [dateAddedFromFilter, setDateAddedFromFilter] = useState('')
  const [dateAddedToFilter, setDateAddedToFilter] = useState('')
  const [featuredFilter, setFeaturedFilter] = useState<'all' | 'featured' | 'not-featured'>('all')
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<EventStatus>('published')
  const [bulkUpdating, setBulkUpdating] = useState(false)
  
  // Bulk edit modal state
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [bulkEditCategory, setBulkEditCategory] = useState<EventCategory | ''>('')
  const [bulkEditStatus, setBulkEditStatus] = useState<EventStatus | ''>('')
  const [bulkEditOrganizer, setBulkEditOrganizer] = useState<number | ''>('')
  const [organizers, setOrganizers] = useState<Organizer[]>([])

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    event: true,
    date: true,
    venue: true,
    category: true,
    status: true,
    organizer: true,
    created: true,
    actions: true
  })
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  
  // Filter visibility state
  const [showFilters, setShowFilters] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50

  useEffect(() => {
    fetchEvents()
    fetchOrganizers()
  }, [])

  useEffect(() => {
    filterEvents()
    setCurrentPage(1) // Reset till första sidan vid filtrering
  }, [events, searchTerm, statusFilter, categoryFilter, organizerFilter, dateFromFilter, dateToFilter, dateAddedFromFilter, dateAddedToFilter, featuredFilter, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const fetchOrganizers = async () => {
    try {
      const { data, error } = await supabase
        .from('organizers')
        .select('*')
        .in('status', ['active', 'pending']) // Visa endast aktiva och pending arrangörer
        .order('name')

      if (error) throw error
      setOrganizers(data || [])
    } catch (error) {
      console.error('Error fetching organizers:', error)
    }
  }

  const filterEvents = () => {
    let filtered = events

    // Tab-baserad filtrering
    if (activeTab === 'tips') {
      // Tips-fliken: visa endast draft events
      filtered = filtered.filter(event => event.status === 'draft')
    } else {
      // Events-fliken: visa alla utom draft
      filtered = filtered.filter(event => event.status !== 'draft')
    }

    if (searchTerm) {
      filtered = filtered.filter(event =>
        event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.venue_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (statusFilter !== 'all' && activeTab === 'events') {
      filtered = filtered.filter(event => event.status === statusFilter)
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(event => {
        // Kolla nya multi-category systemet först
        if (event.categories && event.categories.length > 0) {
          return event.categories.includes(categoryFilter);
        }
        // Fallback till gamla systemet
        return event.category === categoryFilter;
      })
    }

    // Organizer filter
    if (organizerFilter !== 'all') {
      filtered = filtered.filter(event => event.organizer_id === organizerFilter)
    }

    // Event datum-filter (date_time)
    if (dateFromFilter) {
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.date_time)
        const fromDate = new Date(dateFromFilter)
        return eventDate >= fromDate
      })
    }

    if (dateToFilter) {
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.date_time)
        const toDate = new Date(dateToFilter)
        // Lägg till 23:59:59 på toDate för att inkludera hela dagen
        toDate.setHours(23, 59, 59, 999)
        return eventDate <= toDate
      })
    }

    // Date Added filter (created_at)
    if (dateAddedFromFilter) {
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.created_at)
        const fromDate = new Date(dateAddedFromFilter)
        return eventDate >= fromDate
      })
    }

    if (dateAddedToFilter) {
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.created_at)
        const toDate = new Date(dateAddedToFilter)
        // Lägg till 23:59:59 på toDate för att inkludera hela dagen
        toDate.setHours(23, 59, 59, 999)
        return eventDate <= toDate
      })
    }

    // Featured filter
    if (featuredFilter === 'featured') {
      filtered = filtered.filter(event => event.featured === true)
    } else if (featuredFilter === 'not-featured') {
      filtered = filtered.filter(event => event.featured === false)
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

  // Bulk edit functions
  const bulkDeleteEvents = async () => {
    if (selectedEvents.size === 0) {
      alert('Välj minst ett event')
      return
    }

    const count = selectedEvents.size
    if (!confirm(`Är du säker på att du vill ta bort ${count} event${count > 1 ? 's' : ''}? Detta går inte att ångra.`)) {
      return
    }

    setBulkUpdating(true)
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .in('id', Array.from(selectedEvents))

      if (error) throw error
      
      // Ta bort från lokalt state
      setEvents(events.filter(event => !selectedEvents.has(event.id)))
      
      setSelectedEvents(new Set())
      alert(`${count} event${count > 1 ? 's' : ''} borttagna!`)
    } catch (error) {
      console.error('Error bulk deleting events:', error)
      alert('Fel vid borttagning av events')
    } finally {
      setBulkUpdating(false)
    }
  }

  const handleBulkEdit = () => {
    if (selectedEvents.size === 0) {
      alert('Välj events att redigera')
      return
    }
    setShowBulkEditModal(true)
  }

  const handleBulkEditSubmit = async () => {
    if (selectedEvents.size === 0) return

    setBulkUpdating(true)
    try {
      const updateData: any = {}
      
      if (bulkEditCategory) {
        updateData.category = bulkEditCategory; // Behåll första kategorin som huvudkategori
        updateData.categories = [bulkEditCategory]; // Sätt som array för nya systemet
      }
      if (bulkEditStatus) updateData.status = bulkEditStatus
      if (bulkEditOrganizer) updateData.organizer_id = bulkEditOrganizer

      if (Object.keys(updateData).length === 0) {
        alert('Välj minst ett fält att uppdatera')
        return
      }

      const { error } = await supabase
        .from('events')
        .update(updateData)
        .in('id', Array.from(selectedEvents))

      if (error) throw error
      
      // Uppdatera lokalt state
      setEvents(events.map(event => 
        selectedEvents.has(event.id)
          ? { ...event, ...updateData }
          : event
      ))
      
      setSelectedEvents(new Set())
      setShowBulkEditModal(false)
      setBulkEditCategory('')
      setBulkEditStatus('')
      setBulkEditOrganizer('')
      alert(`${selectedEvents.size} events uppdaterade!`)
    } catch (error) {
      console.error('Error bulk updating events:', error)
      alert('Fel vid uppdatering av events')
    } finally {
      setBulkUpdating(false)
    }
  }

  const closeBulkEditModal = () => {
    setShowBulkEditModal(false)
    setBulkEditCategory('')
    setBulkEditStatus('')
    setBulkEditOrganizer('')
  }

  // Column selector functions
  const toggleColumn = (column: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }))
  }

  const toggleAllColumns = () => {
    const allVisible = Object.values(visibleColumns).every(v => v)
    setVisibleColumns({
      event: !allVisible,
      date: !allVisible,
      venue: !allVisible,
      category: !allVisible,
      status: !allVisible,
      organizer: !allVisible,
      created: !allVisible,
      actions: !allVisible
    })
  }

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setCategoryFilter('all')
    setOrganizerFilter('all')
    setDateFromFilter('')
    setDateToFilter('')
    setDateAddedFromFilter('')
    setDateAddedToFilter('')
    setFeaturedFilter('all')
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
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowColumnSelector(!showColumnSelector)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Settings className="w-4 h-4 mr-2" />
              Kolumner
            </button>
            <Link
              href="/events/new"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nytt Event
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('events')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'events'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Events ({events.filter(e => e.status !== 'draft').length})
            </button>
            <button
              onClick={() => setActiveTab('tips')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'tips'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Tips ({events.filter(e => e.status === 'draft').length})
            </button>
          </nav>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow">
          {/* Filter Header */}
          <div 
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 rounded-t-lg"
            onClick={() => setShowFilters(!showFilters)}
          >
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-medium text-gray-900">Filter</h3>
              {/* Show active filter count */}
              {(() => {
                const activeFilters = [
                  searchTerm,
                  statusFilter !== 'all',
                  categoryFilter !== 'all',
                  organizerFilter !== 'all',
                  featuredFilter !== 'all',
                  dateFromFilter,
                  dateToFilter,
                  dateAddedFromFilter,
                  dateAddedToFilter
                ].filter(Boolean).length;
                
                return activeFilters > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {activeFilters} aktiv{activeFilters > 1 ? 'a' : ''}
                  </span>
                );
              })()}
            </div>
            
            <div className="flex items-center space-x-2">
              {showFilters && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAllFilters();
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Rensa alla
                </button>
              )}
              {showFilters ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </div>
          </div>

          {/* Collapsible Filter Content */}
          {showFilters && (
            <div className="px-4 pb-4 border-t border-gray-200">
              {/* Row 1: Search, Status, Category, Featured, Organizer */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 mt-4">
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

                {activeTab === 'events' && (
                  <select
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as EventStatus | 'all')}
                  >
                    <option value="all">Alla statusar</option>
                    <option value="pending_approval">Väntar godkännande</option>
                    <option value="published">Publicerad</option>
                    <option value="cancelled">Avbruten</option>
                  </select>
                )}

                <select
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as EventCategory | 'all')}
                >
                  <option value="all">Alla kategorier</option>
                  <option value="Scen">Scen</option>
                  <option value="Nattliv">Nattliv</option>
                  <option value="Sport">Sport</option>
                  <option value="Utställningar">Utställningar</option>
                  <option value="Konst">Konst</option>
                  <option value="Föreläsningar">Föreläsningar</option>
                  <option value="Barn & Familj">Barn & Familj</option>
                  <option value="Mat & Dryck">Mat & Dryck</option>
                  <option value="Jul">Jul</option>
                  <option value="Film & bio">Film & bio</option>
                  <option value="Djur & Natur">Djur & Natur</option>
                  <option value="Guidade visningar">Guidade visningar</option>
                  <option value="Marknader">Marknader</option>
                </select>

                <select
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={featuredFilter}
                  onChange={(e) => setFeaturedFilter(e.target.value as 'all' | 'featured' | 'not-featured')}
                >
                  <option value="all">Alla events</option>
                  <option value="featured">Endast featured</option>
                  <option value="not-featured">Ej featured</option>
                </select>

                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Arrangör
                  </label>
                  <OrganizerSearchableDropdown
                    organizers={organizers}
                    value={organizerFilter === 'all' ? null : organizerFilter}
                    onChange={(id) => setOrganizerFilter(id || 'all')}
                    placeholder="Alla arrangörer"
                    showStatus={true}
                  />
                </div>
              </div>

              {/* Row 2: Event Date Range */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event datum från
                  </label>
                  <input
                    type="date"
                    className="px-3 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={dateFromFilter}
                    onChange={(e) => setDateFromFilter(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event datum till
                  </label>
                  <input
                    type="date"
                    className="px-3 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={dateToFilter}
                    onChange={(e) => setDateToFilter(e.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setDateFromFilter('')
                      setDateToFilter('')
                    }}
                    className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Rensa datum
                  </button>
                </div>
              </div>

              {/* Row 3: Date Added Range */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Datum tillagt från
                  </label>
                  <input
                    type="date"
                    className="px-3 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={dateAddedFromFilter}
                    onChange={(e) => setDateAddedFromFilter(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Datum tillagt till
                  </label>
                  <input
                    type="date"
                    className="px-3 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={dateAddedToFilter}
                    onChange={(e) => setDateAddedToFilter(e.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setDateAddedFromFilter('')
                      setDateAddedToFilter('')
                    }}
                    className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Rensa datum tillagt
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Column Selector */}
        {showColumnSelector && (
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Välj synliga kolumner</h3>
              <button
                onClick={() => setShowColumnSelector(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visibleColumns.event}
                  onChange={() => toggleColumn('event')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Event</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visibleColumns.date}
                  onChange={() => toggleColumn('date')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Datum</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visibleColumns.venue}
                  onChange={() => toggleColumn('venue')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Plats</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visibleColumns.category}
                  onChange={() => toggleColumn('category')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Kategori</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visibleColumns.status}
                  onChange={() => toggleColumn('status')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Status</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visibleColumns.organizer}
                  onChange={() => toggleColumn('organizer')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Organizer</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visibleColumns.created}
                  onChange={() => toggleColumn('created')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Datum tillagt</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visibleColumns.actions}
                  onChange={() => toggleColumn('actions')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Åtgärder</span>
              </label>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={toggleAllColumns}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {Object.values(visibleColumns).every(v => v) ? 'Dölj alla' : 'Visa alla'}
              </button>
            </div>
          </div>
        )}

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
                <button
                  onClick={handleBulkEdit}
                  className="inline-flex items-center px-3 py-1.5 border border-blue-300 text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Settings className="w-4 h-4 mr-1" />
                  Bulk Edit
                </button>
                <button
                  onClick={bulkDeleteEvents}
                  disabled={bulkUpdating}
                  className="inline-flex items-center px-3 py-1.5 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Ta bort
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
                    {visibleColumns.event && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-1/4">
                        Event
                      </th>
                    )}
                    {visibleColumns.date && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                        Datum
                      </th>
                    )}
                    {visibleColumns.venue && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-40">
                        Plats
                      </th>
                    )}
                    {visibleColumns.category && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-28">
                        Kategori
                      </th>
                    )}
                    {visibleColumns.status && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                        Status
                      </th>
                    )}
                    {visibleColumns.organizer && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                        Organizer
                      </th>
                    )}
                    {visibleColumns.created && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                        Datum tillagt
                      </th>
                    )}
                    {visibleColumns.actions && (
                      <th className="px-2 py-2 text-right w-36">
                        <span className="sr-only">Åtgärder</span>
                      </th>
                    )}
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
                      {visibleColumns.event && (
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
                      )}
                      
                      {/* Datum */}
                      {visibleColumns.date && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {formatDate(event.date_time)}
                          </div>
                        </td>
                      )}
                      
                      {/* Plats */}
                      {visibleColumns.venue && (
                        <td className="px-3 py-2">
                          <div className="text-sm text-gray-900 truncate">
                            {event.venue_name || event.location}
                          </div>
                        </td>
                      )}
                      
                      {/* Kategori */}
                      {visibleColumns.category && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          {(() => {
                            // Visa nya multi-category systemet om det finns
                            if (event.categories && event.categories.length > 0) {
                              const mainCategory = event.categories[0];
                              const additionalCount = event.categories.length - 1;
                              return (
                                <div className="flex items-center space-x-1">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {mainCategory}
                                  </span>
                                  {additionalCount > 0 && (
                                    <span className="text-xs text-gray-500 font-medium">
                                      +{additionalCount}
                                    </span>
                                  )}
                                </div>
                              );
                            }
                            // Fallback till gamla systemet
                            return (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {event.category || 'Okategoriserad'}
                              </span>
                            );
                          })()}
                        </td>
                      )}
                      
                      {/* Status */}
                      {visibleColumns.status && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(event.status)}`}>
                            {getStatusText(event.status)}
                          </span>
                        </td>
                      )}
                      
                      {/* Organizer */}
                      {visibleColumns.organizer && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="text-sm text-gray-500 truncate">
                            {event.organizer?.name || '-'}
                          </div>
                        </td>
                      )}
                      
                      {/* Datum tillagt */}
                      {visibleColumns.created && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {formatDate(event.created_at)}
                          </div>
                        </td>
                      )}
                      
                      {/* Actions */}
                      {visibleColumns.actions && (
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
                              href={`${process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://ivarberg.nu/'}/event/${event.event_id}`}
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
                      )}
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

        {/* Bulk Edit Modal */}
        {showBulkEditModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Bulk Edit ({selectedEvents.size} events)
                  </h3>
                  <button
                    onClick={closeBulkEditModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  {/* Kategorier - Multi-select */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Kategorier (1-3 kategorier)
                    </label>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {[
                        'Scen', 'Nattliv', 'Sport', 'Utställningar', 'Konst', 'Föreläsningar', 
                        'Barn & Familj', 'Mat & Dryck', 'Jul', 'Film & bio', 
                        'Djur & Natur', 'Guidade visningar', 'Marknader', 'Okategoriserad'
                      ].map((category) => (
                        <label key={category} className="flex items-center">
                          <input
                            type="checkbox"
                            value={category}
                            onChange={(e) => {
                              const currentCategories = bulkEditCategory ? [bulkEditCategory] : [];
                              if (e.target.checked) {
                                if (!currentCategories.includes(category as EventCategory)) {
                                  const newCategories = [...currentCategories, category as EventCategory];
                                  setBulkEditCategory(newCategories[0]); // Behåll första som huvudkategori
                                }
                              } else {
                                const newCategories = currentCategories.filter(cat => cat !== category);
                                setBulkEditCategory(newCategories[0] || '');
                              }
                            }}
                            checked={bulkEditCategory === category}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{category}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Bulk edit stöder för närvarande endast en kategori per event
                    </p>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      value={bulkEditStatus}
                      onChange={(e) => setBulkEditStatus(e.target.value as EventStatus | '')}
                    >
                      <option value="">Välj status...</option>
                      <option value="draft">Utkast</option>
                      <option value="pending_approval">Väntar godkännande</option>
                      <option value="published">Publicerad</option>
                      <option value="cancelled">Avbruten</option>
                    </select>
                  </div>

                  {/* Organizer */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Organizer
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      value={bulkEditOrganizer}
                      onChange={(e) => setBulkEditOrganizer(e.target.value ? parseInt(e.target.value) : '')}
                    >
                      <option value="">Välj organizer...</option>
                      {organizers.map((organizer) => (
                        <option key={organizer.id} value={organizer.id}>
                          {organizer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={closeBulkEditModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={handleBulkEditSubmit}
                    disabled={bulkUpdating}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {bulkUpdating ? 'Uppdaterar...' : 'Uppdatera events'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  )
}
