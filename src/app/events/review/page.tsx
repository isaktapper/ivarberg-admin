'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Event, EventCategory } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import { 
  CheckCircle, 
  XCircle, 
  Edit,
  Calendar,
  MapPin,
  Tag,
  ExternalLink,
  AlertCircle,
  ChevronRight,
  Save
} from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'

const CATEGORIES: EventCategory[] = [
  'Scen', 'Nattliv', 'Sport', 'Konst', 'Föreläsningar', 
  'Barn & Familj', 'Mat & Dryck', 'Jul', 'Film & bio', 
  'Djur & Natur', 'Guidade visningar', 'Okategoriserad'
]

export default function EventReviewPage() {
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [editedEvent, setEditedEvent] = useState<Partial<Event>>({})
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    fetchPendingEvents()
  }, [])

  useEffect(() => {
    // Reset edited event when current event changes
    setEditedEvent({})
    setHasChanges(false)
  }, [currentIndex])

  const fetchPendingEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          organizer:organizers(name)
        `)
        .in('status', ['draft', 'pending_approval'])
        .order('created_at', { ascending: false })

      if (error) throw error
      setEvents(data || [])
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setLoading(false)
    }
  }

  const currentEvent = events[currentIndex]

  const updateField = (field: keyof Event, value: any) => {
    setEditedEvent(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }

  const getFieldValue = (field: keyof Event) => {
    return editedEvent[field] !== undefined ? editedEvent[field] : currentEvent?.[field]
  }

  const saveChanges = async () => {
    if (!currentEvent || !hasChanges) return
    
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('events')
        .update({
          ...editedEvent,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentEvent.id)

      if (error) {
        console.error('Supabase error details:', error)
        throw error
      }

      // Update local state
      setEvents(prev => prev.map((e, i) => 
        i === currentIndex ? { ...e, ...editedEvent } : e
      ))
      setEditedEvent({})
      setHasChanges(false)
      alert('Ändringar sparade!')
    } catch (error: any) {
      console.error('Error saving changes:', error)
      const errorMessage = error?.message || error?.hint || 'Okänt fel'
      alert(`Fel vid sparande av ändringar: ${errorMessage}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleApprove = async () => {
    if (!currentEvent) return
    
    // Save any pending changes first
    if (hasChanges) {
      await saveChanges()
    }
    
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('events')
        .update({ 
          status: 'published',
          updated_at: new Date().toISOString()
        })
        .eq('id', currentEvent.id)

      if (error) {
        console.error('Error approving event:', error)
        throw error
      }
      
      moveToNext()
    } catch (error: any) {
      console.error('Error approving event:', error)
      const errorMessage = error?.message || error?.hint || error?.details || 'Okänt fel'
      alert(`Fel vid godkännande av event: ${errorMessage}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!currentEvent) return
    
    if (!confirm('Är du säker på att du vill avböja detta event?')) {
      return
    }
    
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('events')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', currentEvent.id)

      if (error) {
        console.error('Supabase error details:', error)
        throw error
      }
      
      moveToNext()
    } catch (error: any) {
      console.error('Error rejecting event:', error)
      const errorMessage = error?.message || error?.hint || 'Okänt fel'
      alert(`Fel vid avböjande av event: ${errorMessage}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleEdit = () => {
    if (!currentEvent) return
    router.push(`/events/${currentEvent.id}/edit`)
  }

  const moveToNext = () => {
    if (currentIndex < events.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      // Alla events granskade
      setEvents([])
      setCurrentIndex(0)
    }
  }

  const skip = () => {
    moveToNext()
  }

  const handleApproveAll = async () => {
    if (!confirm(`Är du säker på att du vill godkänna alla ${events.length} events?`)) {
      return
    }

    setProcessing(true)
    try {
      const eventIds = events.map(e => e.id)
      
      const { error } = await supabase
        .from('events')
        .update({ 
          status: 'published',
          updated_at: new Date().toISOString()
        })
        .in('id', eventIds)

      if (error) {
        console.error('Supabase error details:', error)
        throw error
      }

      alert(`${events.length} events har godkänts!`)
      
      // Töm listan
      setEvents([])
      setCurrentIndex(0)
    } catch (error: any) {
      console.error('Error approving all events:', error)
      const errorMessage = error?.message || error?.hint || 'Okänt fel'
      alert(`Fel vid godkännande av alla events: ${errorMessage}`)
    } finally {
      setProcessing(false)
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

  if (events.length === 0) {
    return (
      <ProtectedLayout>
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Alla events granskade! 🎉
            </h2>
            <p className="text-gray-600 mb-6">
              Det finns inga events som väntar på granskning.
            </p>
            <Link
              href="/events"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Tillbaka till events
            </Link>
          </div>
        </div>
      </ProtectedLayout>
    )
  }

  return (
    <ProtectedLayout>
      <div className="max-w-6xl mx-auto h-[calc(100vh-6rem)]">
        {/* Header - Fixed */}
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Granska Events</h1>
            <p className="text-sm text-gray-500">
              Event {currentIndex + 1} av {events.length}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleApproveAll}
              disabled={processing || events.length === 0}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="w-4 h-4 mr-1.5" />
              Godkänn alla ({events.length})
            </button>
            <Link
              href="/events"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← Tillbaka
            </Link>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / events.length) * 100}%` }}
          />
        </div>

        {/* Event Card - Flex container with more height */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden h-[calc(100%-5rem)] flex flex-col">
          {/* Status Badge & Quality Info - Fixed height */}
          <div className="px-4 py-3 bg-gray-50 border-b flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                currentEvent.status === 'pending_approval'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {currentEvent.status === 'pending_approval' ? (
                  <>
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Väntar godkännande
                  </>
                ) : (
                  'Utkast - Saknar data'
                )}
              </span>
              <span className="text-xs text-gray-500">
                {currentEvent.organizer?.name || 'Ingen organizer'}
              </span>
            </div>
            
            {/* Quality Score & Issues - Always show for debugging */}
            <div className="space-y-1">
              {currentEvent.quality_score !== undefined && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-medium text-gray-600">Kvalitetspoäng:</span>
                  <span className={`font-bold ${
                    currentEvent.quality_score >= 80 ? 'text-green-600' :
                    currentEvent.quality_score >= 50 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {currentEvent.quality_score}/100
                  </span>
                  {currentEvent.quality_score < 80 && (
                    <span className="text-xs text-gray-500">
                      (behöver granskas)
                    </span>
                  )}
                </div>
              )}
              {/* Show if quality_issues exists and has content */}
              {currentEvent.quality_issues && (
                <div className="flex items-start gap-1.5 text-xs">
                  <span className="font-medium text-gray-600">Anledning:</span>
                  <span className="text-orange-600 font-medium">
                    {currentEvent.quality_issues}
                  </span>
                </div>
              )}
              {/* Debug: Show if no quality_issues */}
              {currentEvent.quality_score !== undefined && !currentEvent.quality_issues && (
                <div className="flex items-start gap-1.5 text-xs">
                  <span className="font-medium text-gray-600">Anledning:</span>
                  <span className="text-gray-400 italic text-xs">
                    (Ingen kvalitetsdata tillgänglig - kör ny scrape)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Content Area - No scrolling needed */}
          <div className="flex-1 overflow-hidden p-6">
            <div className="flex gap-6 h-full">
              {/* Image - Small left side with URL input */}
              <div className="w-64 flex-shrink-0 space-y-2">
                <div className="relative bg-gray-200 rounded-lg overflow-hidden h-64">
                  {(getFieldValue('image_url') || currentEvent.image_url) ? (
                    <img
                      src={getFieldValue('image_url') || currentEvent.image_url}
                      alt={currentEvent.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '';
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-gray-400 text-sm text-center px-4">Ingen bild<br/>Lägg till URL nedan</p>
                    </div>
                  )}
                </div>
                
                {/* Image URL input */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Bild-URL</label>
                  <input
                    type="url"
                    value={getFieldValue('image_url') || ''}
                    onChange={(e) => updateField('image_url', e.target.value)}
                    placeholder="https://example.com/bild.jpg"
                    className="w-full text-xs text-gray-900 border-2 border-gray-300 hover:border-blue-400 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded transition-colors"
                  />
                  {!currentEvent.image_url && (
                    <p className="text-xs text-orange-600 mt-1">⚠️ Bild saknas</p>
                  )}
                </div>
              </div>

              {/* Content - Takes most space - Editable */}
              <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                {/* Title - Editable */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-0.5 block">Namn</label>
                  <input
                    type="text"
                    value={getFieldValue('name') || ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="w-full text-base font-bold text-gray-900 border-b-2 border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5 transition-colors"
                  />
                </div>

                {/* Date & Time - Editable */}
                <div className="flex items-start space-x-2">
                  <Calendar className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-700 mb-0.5 block">Datum & Tid</label>
                    <input
                      type="datetime-local"
                      value={getFieldValue('date_time') ? new Date(getFieldValue('date_time') as string).toISOString().slice(0, 16) : ''}
                      onChange={(e) => updateField('date_time', new Date(e.target.value).toISOString())}
                      className="w-full text-sm text-gray-900 border-b-2 border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5 transition-colors"
                    />
                  </div>
                </div>

                {/* Venue - Editable */}
                <div className="flex items-start space-x-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-700 mb-0.5 block">Plats</label>
                    <input
                      type="text"
                      value={getFieldValue('venue_name') || getFieldValue('location') || ''}
                      onChange={(e) => updateField('venue_name', e.target.value)}
                      className="w-full text-sm text-gray-900 border-b-2 border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5 transition-colors"
                    />
                  </div>
                </div>

                {/* Category - Editable (Always shown) */}
                <div className="flex items-start space-x-2">
                  <Tag className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-700 mb-0.5 block">Kategori</label>
                    <select
                      value={getFieldValue('category') || ''}
                      onChange={(e) => updateField('category', e.target.value)}
                      className="w-full text-sm text-gray-900 border-b-2 border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5 transition-colors bg-transparent cursor-pointer"
                    >
                      <option value="">Välj kategori</option>
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description - Editable with flexible space */}
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-700 mb-0.5 block">Beskrivning</label>
                  <textarea
                    value={getFieldValue('description') || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    className="w-full h-[calc(100%-1.5rem)] min-h-[200px] text-sm text-gray-600 border-2 border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-2 py-2 transition-colors rounded resize-none"
                    placeholder="Ingen beskrivning..."
                  />
                </div>

                {/* External Link */}
                {currentEvent.organizer_event_url && (
                  <div className="pt-2">
                    <a
                      href={currentEvent.organizer_event_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Visa originalevent
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions - Fixed at bottom */}
          <div className="px-4 py-3 bg-gray-50 border-t flex-shrink-0">
            {hasChanges && (
              <div className="mb-2">
                <button
                  onClick={saveChanges}
                  disabled={processing}
                  className="w-full inline-flex items-center justify-center px-3 py-2 border border-blue-300 text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  Spara ändringar
                </button>
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-2 mb-2">
              <button
                onClick={handleReject}
                disabled={processing}
                className="inline-flex items-center justify-center px-3 py-2.5 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Avböj
              </button>

              <button
                onClick={handleEdit}
                disabled={processing}
                className="inline-flex items-center justify-center px-3 py-2.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <Edit className="w-4 h-4 mr-1.5" />
                Redigera
              </button>

              <button
                onClick={handleApprove}
                disabled={processing}
                className="inline-flex items-center justify-center px-3 py-2.5 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                {processing ? (
                  'Sparar...'
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    Godkänn
                  </>
                )}
              </button>
            </div>

            {/* Skip button */}
            <button
              onClick={skip}
              disabled={processing}
              className="w-full inline-flex items-center justify-center px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              Hoppa över
              <ChevronRight className="w-3 h-3 ml-1" />
            </button>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  )
}
