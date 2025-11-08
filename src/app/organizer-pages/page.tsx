'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { OrganizerPage } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye,
  Copy,
  ExternalLink,
  Settings,
  X,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Users,
  Calendar,
  Globe,
  Download,
  Link as LinkIcon
} from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export default function OrganizerPagesPage() {
  const [organizerPages, setOrganizerPages] = useState<OrganizerPage[]>([])
  const [filteredPages, setFilteredPages] = useState<OrganizerPage[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all')
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)
  
  // Import functionality
  const [showImportModal, setShowImportModal] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState(false)
  
  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    slug: true,
    status: true,
    events: true,
    created: true,
    updated: true,
    actions: true
  })
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  
  // Filter visibility state
  const [showFilters, setShowFilters] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50

  useEffect(() => {
    fetchOrganizerPages()
  }, [])

  useEffect(() => {
    filterPages()
    setCurrentPage(1) // Reset till första sidan vid filtrering
  }, [organizerPages, searchTerm, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrganizerPages = async () => {
    try {
      console.log('🔍 Fetching organizer pages...')
      
      // Först testa en enkel query utan relationer
      const { data, error } = await supabase
        .from('organizer_pages')
        .select('*')
        .order('created_at', { ascending: false })

      console.log('📊 Supabase response:', { data, error })

      if (error) {
        console.error('❌ Supabase error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }
      
      // Lägg till event_count separat
      const pagesWithEventCount = await Promise.all(
        (data || []).map(async (page) => {
          const { count } = await supabase
            .from('events')
            .select('*', { count: 'exact', head: true })
            .eq('organizer_id', page.id) // Antag att det finns en relation
          
          return {
            ...page,
            event_count: count || 0
          }
        })
      )
      
      console.log('✅ Transformed data:', pagesWithEventCount)
      setOrganizerPages(pagesWithEventCount)
    } catch (error) {
      console.error('❌ Error fetching organizer pages:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      })
      alert('Fel vid hämtning av arrangörssidor: ' + (error instanceof Error ? error.message : 'Okänt fel'))
    } finally {
      setLoading(false)
    }
  }

  const filterPages = () => {
    let filtered = organizerPages

    if (searchTerm) {
      filtered = filtered.filter(page =>
        page.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        page.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
        page.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        page.description.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(page => 
        statusFilter === 'published' ? page.is_published : !page.is_published
      )
    }

    setFilteredPages(filtered)
  }

  const deletePage = async (id: number) => {
    if (!confirm('Är du säker på att du vill ta bort denna arrangörssida?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('organizer_pages')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      setOrganizerPages(organizerPages.filter(page => page.id !== id))
    } catch (error) {
      console.error('Error deleting organizer page:', error)
      alert('Fel vid borttagning av arrangörssida')
    }
  }

  const togglePublished = async (id: number, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('organizer_pages')
        .update({ is_published: !currentStatus })
        .eq('id', id)

      if (error) throw error
      
      setOrganizerPages(organizerPages.map(page => 
        page.id === id 
          ? { ...page, is_published: !currentStatus }
          : page
      ))
    } catch (error) {
      console.error('Error updating published status:', error)
      alert('Fel vid uppdatering av publiceringsstatus')
    }
  }

  const duplicatePage = async (id: number) => {
    const page = organizerPages.find(p => p.id === id)
    if (!page) return

    try {
      const duplicateData = {
        ...page,
        name: `${page.name} (Kopia)`,
        slug: `${page.slug}-kopia-${Date.now()}`,
        title: `${page.title} (Kopia)`,
        is_published: false
      }

      // Remove id, created_at, updated_at from duplicate
      const { id: _, created_at, updated_at, ...duplicateWithoutMeta } = duplicateData

      const { data, error } = await supabase
        .from('organizer_pages')
        .insert(duplicateWithoutMeta)
        .select()

      if (error) throw error
      
      if (data && data[0]) {
        setOrganizerPages([data[0], ...organizerPages])
        alert('Arrangörssida duplicerad!')
      }
    } catch (error) {
      console.error('Error duplicating page:', error)
      alert('Fel vid duplicering av arrangörssida')
    }
  }

  const toggleSelectAll = () => {
    if (selectedPages.size === filteredPages.length) {
      setSelectedPages(new Set())
    } else {
      setSelectedPages(new Set(filteredPages.map(p => p.id)))
    }
  }

  const toggleSelectPage = (id: number) => {
    const newSelected = new Set(selectedPages)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedPages(newSelected)
  }

  const bulkUpdateStatus = async (newStatus: boolean) => {
    if (selectedPages.size === 0) {
      alert('Välj minst en arrangörssida')
      return
    }

    if (!confirm(`Är du säker på att du vill ${newStatus ? 'publicera' : 'avpublicera'} ${selectedPages.size} arrangörssidor?`)) {
      return
    }

    setBulkUpdating(true)
    try {
      const { error } = await supabase
        .from('organizer_pages')
        .update({ is_published: newStatus })
        .in('id', Array.from(selectedPages))

      if (error) throw error
      
      // Uppdatera lokalt state
      setOrganizerPages(organizerPages.map(page => 
        selectedPages.has(page.id)
          ? { ...page, is_published: newStatus }
          : page
      ))
      
      setSelectedPages(new Set())
      alert(`${selectedPages.size} arrangörssidor uppdaterade!`)
    } catch (error) {
      console.error('Error bulk updating pages:', error)
      alert('Fel vid uppdatering av arrangörssidor')
    } finally {
      setBulkUpdating(false)
    }
  }

  const getStatusColor = (isPublished: boolean) => {
    return isPublished 
      ? 'bg-green-100 text-green-800'
      : 'bg-gray-100 text-gray-800'
  }

  const getStatusText = (isPublished: boolean) => {
    return isPublished ? 'Publicerad' : 'Utkast'
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
      name: !allVisible,
      slug: !allVisible,
      status: !allVisible,
      events: !allVisible,
      created: !allVisible,
      updated: !allVisible,
      actions: !allVisible
    })
  }

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
  }

  // Import functions
  const handleImport = async () => {
    if (!importUrl.trim()) {
      setImportError('Vänligen ange en URL')
      return
    }

    setImporting(true)
    setImportError('')
    setImportSuccess(false)

    try {
      const response = await fetch('/api/organizer-pages/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: importUrl.trim() })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Import misslyckades')
      }

      // Add the new page to the list
      setOrganizerPages(prev => [result.page, ...prev])
      setImportSuccess(true)
      setImportUrl('')
      
      // Close modal after 2 seconds
      setTimeout(() => {
        setShowImportModal(false)
        setImportSuccess(false)
      }, 2000)

    } catch (error) {
      console.error('Import error:', error)
      setImportError(error instanceof Error ? error.message : 'Okänt fel vid import')
    } finally {
      setImporting(false)
    }
  }

  const closeImportModal = () => {
    setShowImportModal(false)
    setImportUrl('')
    setImportError('')
    setImportSuccess(false)
  }
  
  // Pagination calculations
  const totalPages = Math.ceil(filteredPages.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedPages = filteredPages.slice(startIndex, endIndex)

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
            <h1 className="text-2xl font-bold text-gray-900">Arrangörssidor</h1>
            <p className="mt-1 text-sm text-gray-500">
              Hantera SEO-sidor för arrangörer
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
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Download className="w-4 h-4 mr-2" />
              Importera från URL
            </button>
            <Link
              href="/organizer-pages/new"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ny Arrangörssida
            </Link>
          </div>
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
                  statusFilter !== 'all'
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
              {/* Row 1: Search and Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 mt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Sök arrangörssidor..."
                    className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <select
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'published' | 'draft')}
                >
                  <option value="all">Alla statusar</option>
                  <option value="published">Publicerade</option>
                  <option value="draft">Utkast</option>
                </select>
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
                  checked={visibleColumns.name}
                  onChange={() => toggleColumn('name')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Namn</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visibleColumns.slug}
                  onChange={() => toggleColumn('slug')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Slug</span>
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
                  checked={visibleColumns.events}
                  onChange={() => toggleColumn('events')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Evenemang</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visibleColumns.created}
                  onChange={() => toggleColumn('created')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Skapad</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visibleColumns.updated}
                  onChange={() => toggleColumn('updated')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Uppdaterad</span>
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
        {selectedPages.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-blue-900">
                  {selectedPages.size} arrangörssida{selectedPages.size > 1 ? 'r' : ''} valda
                </span>
                <button
                  onClick={() => bulkUpdateStatus(true)}
                  disabled={bulkUpdating}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                  {bulkUpdating ? 'Uppdaterar...' : 'Publicera'}
                </button>
                <button
                  onClick={() => bulkUpdateStatus(false)}
                  disabled={bulkUpdating}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                >
                  {bulkUpdating ? 'Uppdaterar...' : 'Avpublicera'}
                </button>
              </div>
              <button
                onClick={() => setSelectedPages(new Set())}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Rensa val
              </button>
            </div>
          </div>
        )}

        {/* Organizer Pages List */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {filteredPages.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Inga arrangörssidor</h3>
              <p className="mt-1 text-sm text-gray-500">
                Kom igång genom att skapa din första arrangörssida.
              </p>
              <div className="mt-6">
                <Link
                  href="/organizer-pages/new"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ny Arrangörssida
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
                        title={selectedPages.size === filteredPages.length ? 'Avmarkera alla' : 'Markera alla'}
                      >
                        {selectedPages.size === filteredPages.length && filteredPages.length > 0 ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    {visibleColumns.name && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-1/4">
                        Namn
                      </th>
                    )}
                    {visibleColumns.slug && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-40">
                        Slug
                      </th>
                    )}
                    {visibleColumns.status && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-28">
                        Status
                      </th>
                    )}
                    {visibleColumns.events && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">
                        Evenemang
                      </th>
                    )}
                    {visibleColumns.created && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                        Skapad
                      </th>
                    )}
                    {visibleColumns.updated && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-32">
                        Uppdaterad
                      </th>
                    )}
                    {visibleColumns.actions && (
                      <th className="px-2 py-2 text-right w-40">
                        <span className="sr-only">Åtgärder</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedPages.map((page) => (
                    <tr key={page.id} className={`hover:bg-gray-50 ${selectedPages.has(page.id) ? 'bg-blue-50' : ''}`}>
                      {/* Checkbox */}
                      <td className="px-2 py-2 whitespace-nowrap">
                        <button
                          onClick={() => toggleSelectPage(page.id)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          {selectedPages.has(page.id) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      
                      {/* Namn */}
                      {visibleColumns.name && (
                        <td className="px-3 py-2">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {page.name}
                          </div>
                          <div className="text-sm text-gray-500 truncate">
                            {page.title}
                          </div>
                        </td>
                      )}
                      
                      {/* Slug */}
                      {visibleColumns.slug && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="text-sm text-gray-500 font-mono">
                            /{page.slug}
                          </div>
                        </td>
                      )}
                      
                      {/* Status */}
                      {visibleColumns.status && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(page.is_published)}`}>
                            {getStatusText(page.is_published)}
                          </span>
                        </td>
                      )}
                      
                      {/* Evenemang */}
                      {visibleColumns.events && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center text-sm text-gray-500">
                            <Calendar className="w-4 h-4 mr-1" />
                            {page.event_count || 0}
                          </div>
                        </td>
                      )}
                      
                      {/* Skapad */}
                      {visibleColumns.created && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {formatDate(page.created_at)}
                          </div>
                        </td>
                      )}
                      
                      {/* Uppdaterad */}
                      {visibleColumns.updated && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {formatDate(page.updated_at)}
                          </div>
                        </td>
                      )}
                      
                      {/* Actions */}
                      {visibleColumns.actions && (
                        <td className="px-2 py-2 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => togglePublished(page.id, page.is_published)}
                              className={`p-1 rounded hover:bg-gray-100 ${
                                page.is_published ? 'text-green-600' : 'text-gray-400'
                              }`}
                              title={page.is_published ? 'Avpublicera' : 'Publicera'}
                            >
                              <Globe className="w-4 h-4" />
                            </button>
                            <a
                              href={`${process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://ivarberg.nu/'}/arrangor/${page.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:bg-blue-50 p-1 rounded"
                              title="Visa på publika sidan"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => duplicatePage(page.id)}
                              className="text-indigo-600 hover:bg-indigo-50 p-1 rounded"
                              title="Duplicera"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <Link
                              href={`/organizer-pages/${page.id}/edit`}
                              className="text-indigo-600 hover:bg-indigo-50 p-1 rounded"
                              title="Redigera"
                            >
                              <Edit className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => deletePage(page.id)}
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
              Visar <span className="font-medium">{startIndex + 1}</span> till <span className="font-medium">{Math.min(endIndex, filteredPages.length)}</span> av{' '}
              <span className="font-medium">{filteredPages.length}</span> arrangörssidor
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

        {/* Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Importera arrangörssida från URL
                  </h3>
                  <button
                    onClick={closeImportModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Webbplats-URL
                    </label>
                    <input
                      type="url"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder="https://example.com"
                      disabled={importing}
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      Systemet kommer att extrahera innehåll, bilder och generera SEO-text automatiskt.
                    </p>
                  </div>

                  {importError && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3">
                      <p className="text-sm text-red-600">{importError}</p>
                    </div>
                  )}

                  {importSuccess && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-3">
                      <p className="text-sm text-green-600">
                        ✅ Arrangörssida importerad framgångsrikt! Den sparas som utkast för granskning.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={closeImportModal}
                    disabled={importing}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing || !importUrl.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {importing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Importerar...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Importera
                      </>
                    )}
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
