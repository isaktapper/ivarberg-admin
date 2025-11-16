'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Organizer, OrganizerStatus } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import GooglePlacesAutocomplete from '@/components/GooglePlacesAutocomplete'
import OrganizerSearchableDropdown from '@/components/OrganizerSearchableDropdown'
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
  Users,
  AlertCircle,
  Sparkles,
  GitMerge,
  FileText
} from 'lucide-react'
import Link from 'next/link'

// Global CSS för Google Places dropdown
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = `
    .pac-container {
      z-index: 9999 !important;
      min-width: 400px !important;
      margin-top: 2px !important;
    }
  `
  if (!document.head.querySelector('[data-pac-styles]')) {
    style.setAttribute('data-pac-styles', 'true')
    document.head.appendChild(style)
  }
}

export default function OrganizersPage() {
  const [organizers, setOrganizers] = useState<(Organizer & { has_page?: boolean })[]>([])
  const [filteredOrganizers, setFilteredOrganizers] = useState<(Organizer & { has_page?: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrganizerStatus | 'all'>('all')
  
  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  
  // Merge organizers state
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [organizerToMerge, setOrganizerToMerge] = useState<Organizer | null>(null)
  const [targetOrganizerId, setTargetOrganizerId] = useState<number | null>(null)
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    fetchOrganizers()
  }, [])

  useEffect(() => {
    filterOrganizers()
  }, [organizers, searchTerm, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrganizers = async () => {
    try {
      const { data, error } = await supabase
        .from('organizers')
        .select('*')
        .order('needs_review', { ascending: false }) // Pending först
        .order('name')

      if (error) throw error
      
      // Fetch organizer pages to check which organizers have pages
      const { data: pages } = await supabase
        .from('organizer_pages')
        .select('organizer_id')
      
      const organizerIdsWithPages = new Set(
        (pages || []).map(p => p.organizer_id).filter(Boolean)
      )
      
      // Add has_page flag to each organizer
      const organizersWithPageFlag = (data || []).map(org => ({
        ...org,
        has_page: organizerIdsWithPages.has(org.id)
      }))
      
      setOrganizers(organizersWithPageFlag)
    } catch (error) {
      console.error('Error fetching organizers:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterOrganizers = () => {
    let filtered = organizers

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(organizer => organizer.status === statusFilter)
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(organizer =>
        organizer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        organizer.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        organizer.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    setFilteredOrganizers(filtered)
  }

  const pendingCount = organizers.filter(o => o.status === 'pending').length
  const activeCount = organizers.filter(o => o.status === 'active').length
  const archivedCount = organizers.filter(o => o.status === 'archived').length

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

  // Inline editing functions
  const startEditing = (id: number, field: string, currentValue: string) => {
    setEditingCell({ id, field })
    setEditValue(currentValue || '')
  }

  const cancelEditing = () => {
    setEditingCell(null)
    setEditValue('')
  }

  const saveEdit = async (organizerId: number, field: string, valueToSave?: string) => {
    const finalValue = valueToSave !== undefined ? valueToSave : editValue
    
    if (!finalValue && field !== 'location' && field !== 'email' && field !== 'phone' && field !== 'website') {
      // Namn och vissa fält är required
      if (field === 'name') {
        alert('Namn är obligatoriskt')
        return
      }
    }

    try {
      const updateData: any = {
        [field]: finalValue || null,
        updated_at: new Date().toISOString(),
      }

      // Om vi ändrar status till active från pending, sätt needs_review till false
      if (field === 'status') {
        updateData.needs_review = finalValue === 'pending'
      }

      const { error } = await supabase
        .from('organizers')
        .update(updateData)
        .eq('id', organizerId)

      if (error) throw error

      // Uppdatera lokal state
      setOrganizers(organizers.map(org => 
        org.id === organizerId 
          ? { ...org, ...updateData }
          : org
      ))

      cancelEditing()
    } catch (error) {
      console.error('Error updating organizer:', error)
      alert('Fel vid uppdatering: ' + (error instanceof Error ? error.message : 'Okänt fel'))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, organizerId: number, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit(organizerId, field)
    } else if (e.key === 'Escape') {
      cancelEditing()
    }
  }

  // Merge organizers function
  const startMerge = (organizer: Organizer) => {
    setOrganizerToMerge(organizer)
    setTargetOrganizerId(null)
    setShowMergeModal(true)
  }

  const mergeOrganizers = async () => {
    if (!organizerToMerge || !targetOrganizerId) return

    const confirmed = confirm(
      `Är du säker på att du vill merga "${organizerToMerge.name}" in i den valda organizern?\n\n` +
      `Detta kommer att:\n` +
      `- Flytta alla events från "${organizerToMerge.name}" till den valda organizern\n` +
      `- Ta bort "${organizerToMerge.name}"\n\n` +
      `Denna åtgärd kan inte ångras!`
    )

    if (!confirmed) return

    setMerging(true)
    try {
      // 1. Hämta antal events som ska flyttas
      const { count: eventCount } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('organizer_id', organizerToMerge.id)

      console.log(`Flyttar ${eventCount} events från organizer ${organizerToMerge.id} till ${targetOrganizerId}`)

      // 2. Flytta alla events till den nya organizern
      const { error: updateError } = await supabase
        .from('events')
        .update({ organizer_id: targetOrganizerId })
        .eq('organizer_id', organizerToMerge.id)

      if (updateError) throw updateError

      // 3. Hantera organizer pages med UNIQUE constraint
      // Kolla om source organizer har en page
      const { data: sourcePage } = await supabase
        .from('organizer_pages')
        .select('*')
        .eq('organizer_id', organizerToMerge.id)
        .maybeSingle()

      // Kolla om target organizer redan har en page
      const { data: targetPage } = await supabase
        .from('organizer_pages')
        .select('*')
        .eq('organizer_id', targetOrganizerId)
        .maybeSingle()

      if (sourcePage) {
        if (targetPage) {
          // Target har redan en page, ta bort source's page
          console.log(`Target organizer har redan en page. Tar bort source organizer's page (${sourcePage.id})`)
          const { error: deletePageError } = await supabase
            .from('organizer_pages')
            .delete()
            .eq('id', sourcePage.id)
          
          if (deletePageError) throw deletePageError
        } else {
          // Target har ingen page, flytta source's page till target
          console.log(`Flyttar organizer page från organizer ${organizerToMerge.id} till ${targetOrganizerId}`)
          const { error: pagesUpdateError } = await supabase
            .from('organizer_pages')
            .update({ organizer_id: targetOrganizerId })
            .eq('id', sourcePage.id)

          if (pagesUpdateError) throw pagesUpdateError
        }
      }

      // 4. Ta bort den gamla organizern
      const { error: deleteError } = await supabase
        .from('organizers')
        .delete()
        .eq('id', organizerToMerge.id)

      if (deleteError) throw deleteError

      // 5. Uppdatera lokal state
      setOrganizers(organizers.filter(org => org.id !== organizerToMerge.id))

      const summary = pageCount && pageCount > 0 
        ? `Merge lyckades! ${eventCount} events och ${pageCount} organizer pages flyttades.`
        : `Merge lyckades! ${eventCount} events flyttades.`
      
      alert(summary)
      setShowMergeModal(false)
      setOrganizerToMerge(null)
      setTargetOrganizerId(null)

    } catch (error) {
      console.error('Error merging organizers:', error)
      alert('Fel vid merge: ' + (error instanceof Error ? error.message : 'Okänt fel'))
    } finally {
      setMerging(false)
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

        {/* Filters & Search */}
        <div className="bg-white p-4 rounded-lg shadow space-y-4">
          {/* Status Filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Alla ({organizers.length})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                statusFilter === 'pending'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <AlertCircle className="w-4 h-4" />
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === 'active'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-50 text-green-700 hover:bg-green-100'
              }`}
            >
              Aktiva ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('archived')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === 'archived'
                  ? 'bg-gray-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Arkiverade ({archivedCount})
            </button>
          </div>

          {/* Search */}
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
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-48">
                      Kontakt
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
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
                    <tr 
                      key={organizer.id} 
                      className={`hover:bg-gray-50 ${organizer.needs_review ? 'bg-amber-50' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {editingCell?.id === organizer.id && editingCell?.field === 'name' ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(organizer.id, 'name')}
                              onKeyDown={(e) => handleKeyDown(e, organizer.id, 'name')}
                              className="text-sm font-medium border border-blue-500 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                          ) : (
                            <div 
                              className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:bg-gray-100 px-2 py-1 rounded flex-1"
                              onClick={() => startEditing(organizer.id, 'name', organizer.name)}
                              title="Klicka för att redigera"
                            >
                              {organizer.name}
                            </div>
                          )}
                          {organizer.has_page && (
                            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" title="Har arrangörssida" />
                          )}
                          {organizer.created_from_scraper && (
                            <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0" title="Auto-skapad från scraper" />
                          )}
                        </div>
                        {organizer.scraper_source && (
                          <div className="text-xs text-gray-500">
                            Från: {organizer.scraper_source}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editingCell?.id === organizer.id && editingCell?.field === 'status' ? (
                          <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(organizer.id, 'status')}
                            onKeyDown={(e) => handleKeyDown(e, organizer.id, 'status')}
                            className="text-xs border border-blue-500 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          >
                            <option value="pending">Pending</option>
                            <option value="active">Aktiv</option>
                            <option value="archived">Arkiverad</option>
                          </select>
                        ) : (
                          <span 
                            onClick={() => startEditing(organizer.id, 'status', organizer.status)}
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 ${
                              organizer.status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : organizer.status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                            title="Klicka för att ändra status"
                          >
                            {organizer.status === 'pending' && <AlertCircle className="w-3 h-3 mr-1" />}
                            {organizer.status === 'pending' ? 'Pending' : 
                             organizer.status === 'active' ? 'Aktiv' : 'Arkiverad'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-gray-900 space-y-0.5">
                          {/* Email */}
                          {editingCell?.id === organizer.id && editingCell?.field === 'email' ? (
                            <input
                              type="email"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(organizer.id, 'email')}
                              onKeyDown={(e) => handleKeyDown(e, organizer.id, 'email')}
                              className="text-xs border border-blue-500 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="email@example.com"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => startEditing(organizer.id, 'email', organizer.email || '')}
                              className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded -ml-2"
                              title="Klicka för att redigera email"
                            >
                              {organizer.email ? (
                                <span className="text-blue-600">{organizer.email}</span>
                              ) : (
                                <span className="text-gray-400">Lägg till email</span>
                              )}
                            </div>
                          )}
                          
                          {/* Phone */}
                          {editingCell?.id === organizer.id && editingCell?.field === 'phone' ? (
                            <input
                              type="tel"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(organizer.id, 'phone')}
                              onKeyDown={(e) => handleKeyDown(e, organizer.id, 'phone')}
                              className="text-xs border border-blue-500 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="+46 70 123 45 67"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={() => startEditing(organizer.id, 'phone', organizer.phone || '')}
                              className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded -ml-2"
                              title="Klicka för att redigera telefon"
                            >
                              {organizer.phone ? (
                                <span className="text-blue-600">{organizer.phone}</span>
                              ) : (
                                <span className="text-gray-400">Lägg till telefon</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 relative">
                        {editingCell?.id === organizer.id && editingCell?.field === 'location' ? (
                          <div 
                            className="relative z-50"
                            onBlur={(e) => {
                              // Kontrollera om focus går till ett element utanför denna cell
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                saveEdit(organizer.id, 'location')
                              }
                            }}
                            onKeyDown={(e) => handleKeyDown(e, organizer.id, 'location')}
                          >
                            <GooglePlacesAutocomplete
                              value={editValue}
                              onChange={setEditValue}
                              onPlaceSelected={(address) => {
                                // Spara direkt när en plats väljs från dropdown
                                saveEdit(organizer.id, 'location', address)
                              }}
                              placeholder="Sök plats..."
                              className="text-sm border border-blue-500 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[300px]"
                            />
                            <div className="text-xs text-gray-500 mt-1">
                              Välj från dropdown eller Enter = spara • Esc = avbryt
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => startEditing(organizer.id, 'location', organizer.location || '')}
                            className="text-sm text-gray-500 truncate cursor-pointer hover:bg-gray-100 px-2 py-1 rounded -ml-2"
                            title="Klicka för att redigera plats (Google Places)"
                          >
                            {organizer.location || <span className="text-gray-400">Lägg till plats</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editingCell?.id === organizer.id && editingCell?.field === 'website' ? (
                          <input
                            type="url"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(organizer.id, 'website')}
                            onKeyDown={(e) => handleKeyDown(e, organizer.id, 'website')}
                            className="text-sm border border-blue-500 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="https://example.com"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            {organizer.website ? (
                              <>
                                <div
                                  onClick={() => startEditing(organizer.id, 'website', organizer.website || '')}
                                  className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded flex-1 truncate text-xs text-blue-600"
                                  title="Klicka för att redigera"
                                >
                                  {organizer.website}
                                </div>
                                <a
                                  href={organizer.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:bg-blue-50 p-1 rounded flex-shrink-0"
                                  title="Öppna hemsida i ny flik"
                                >
                                  <Globe className="w-3 h-3" />
                                </a>
                              </>
                            ) : (
                              <div
                                onClick={() => startEditing(organizer.id, 'website', '')}
                                className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded -ml-2 text-gray-400 text-sm"
                                title="Klicka för att lägga till hemsida"
                              >
                                Lägg till hemsida
                              </div>
                            )}
                          </div>
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
                            onClick={() => startMerge(organizer)}
                            className="text-purple-600 hover:bg-purple-50 p-1 rounded"
                            title="Merga organizer"
                          >
                            <GitMerge className="w-4 h-4" />
                          </button>
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

        {/* Merge Modal */}
        {showMergeModal && organizerToMerge && (
          <div className="fixed inset-0 z-[9999] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:p-0">
              {/* Background overlay */}
              <div 
                className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
                aria-hidden="true"
                onClick={() => setShowMergeModal(false)}
              ></div>

              {/* Center modal */}
              <div className="relative inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-visible shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
                <div>
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-purple-100">
                    <GitMerge className="h-6 w-6 text-purple-600" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-5">
                    <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                      Merga Organizer
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Du håller på att merga <strong className="text-gray-900">"{organizerToMerge.name}"</strong> in i en annan organizer.
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        Alla events kommer att flyttas över och <strong>"{organizerToMerge.name}"</strong> kommer att tas bort.
                      </p>
                    </div>

                    {/* Organizer selector */}
                    <div className="mt-4">
                      <label htmlFor="target-organizer" className="block text-sm font-medium text-gray-700 text-left mb-2">
                        Välj organizer att merga in i:
                      </label>
                      <OrganizerSearchableDropdown
                        organizers={organizers}
                        value={targetOrganizerId}
                        onChange={setTargetOrganizerId}
                        placeholder="Sök och välj organizer..."
                        excludeIds={[organizerToMerge.id]}
                        showStatus={true}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                  <button
                    type="button"
                    disabled={!targetOrganizerId || merging}
                    onClick={mergeOrganizers}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-purple-600 text-base font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 sm:col-start-2 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {merging ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Mergear...
                      </>
                    ) : (
                      'Merga organizers'
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={merging}
                    onClick={() => setShowMergeModal(false)}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 sm:mt-0 sm:col-start-1 sm:text-sm disabled:opacity-50"
                  >
                    Avbryt
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
