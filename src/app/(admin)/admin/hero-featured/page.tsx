'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Event, HeroFeaturedEvent } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import { Star, X, Plus, Search, Calendar, MapPin, ChevronUp, ChevronDown } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export default function HeroFeaturedPage() {
  const [mainFeatured, setMainFeatured] = useState<(HeroFeaturedEvent & { event?: Event }) | null>(null)
  const [secondaryFeatured, setSecondaryFeatured] = useState<(HeroFeaturedEvent & { event?: Event })[]>([])
  const [loading, setLoading] = useState(true)
  const [showEventSelector, setShowEventSelector] = useState<'main' | 'secondary' | null>(null)
  const [availableEvents, setAvailableEvents] = useState<Event[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetchFeaturedEvents()
  }, [])

  const fetchFeaturedEvents = async () => {
    try {
      // Hämta main featured
      const { data: mainData, error: mainError } = await supabase
        .from('hero_featured_events')
        .select(`
          *,
          event:events(*)
        `)
        .eq('position', 'main')
        .single()

      if (mainError && mainError.code !== 'PGRST116') throw mainError
      setMainFeatured(mainData || null)

      // Hämta secondary featured
      const { data: secondaryData, error: secondaryError } = await supabase
        .from('hero_featured_events')
        .select(`
          *,
          event:events(*)
        `)
        .eq('position', 'secondary')
        .order('priority', { ascending: true })

      if (secondaryError) throw secondaryError
      setSecondaryFeatured(secondaryData || [])
    } catch (error) {
      console.error('Error fetching featured events:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAvailableEvents = async () => {
    try {
      // Hämta endast published events som är framtida
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .gte('date_time', new Date().toISOString())
        .order('date_time', { ascending: true })
        .limit(100)

      if (error) throw error
      setAvailableEvents(data || [])
    } catch (error) {
      console.error('Error fetching events:', error)
    }
  }

  const setMainFeaturedEvent = async (eventId: number) => {
    setUpdating(true)
    try {
      // Ta bort befintlig main featured
      if (mainFeatured) {
        await supabase
          .from('hero_featured_events')
          .delete()
          .eq('id', mainFeatured.id)
      }

      // Lägg till ny main featured
      const { error } = await supabase
        .from('hero_featured_events')
        .insert({
          event_id: eventId,
          position: 'main',
          priority: null
        })

      if (error) throw error
      
      await fetchFeaturedEvents()
      setShowEventSelector(null)
      alert('Main featured event uppdaterad!')
    } catch (error) {
      console.error('Error setting main featured:', error)
      alert('Fel vid uppdatering')
    } finally {
      setUpdating(false)
    }
  }

  const removeMainFeaturedEvent = async () => {
    if (!mainFeatured) return
    
    if (!confirm('Är du säker på att du vill ta bort main featured event?')) {
      return
    }

    setUpdating(true)
    try {
      const { error } = await supabase
        .from('hero_featured_events')
        .delete()
        .eq('id', mainFeatured.id)

      if (error) throw error
      
      await fetchFeaturedEvents()
      alert('Main featured event borttagen!')
    } catch (error) {
      console.error('Error removing main featured:', error)
      alert('Fel vid borttagning')
    } finally {
      setUpdating(false)
    }
  }

  const addSecondaryFeaturedEvent = async (eventId: number) => {
    setUpdating(true)
    try {
      if (secondaryFeatured.length >= 5) {
        alert('Maximum 5 secondary featured events!')
        return
      }

      // Beräkna ny prioritet
      const newPriority = secondaryFeatured.length + 1

      const { error } = await supabase
        .from('hero_featured_events')
        .insert({
          event_id: eventId,
          position: 'secondary',
          priority: newPriority
        })

      if (error) throw error
      
      await fetchFeaturedEvents()
      setShowEventSelector(null)
      alert('Secondary featured event tillagd!')
    } catch (error) {
      console.error('Error adding secondary featured:', error)
      alert('Fel vid tillägg')
    } finally {
      setUpdating(false)
    }
  }

  const removeSecondaryFeaturedEvent = async (id: number) => {
    if (!confirm('Är du säker på att du vill ta bort detta secondary featured event?')) {
      return
    }

    setUpdating(true)
    try {
      const { error } = await supabase
        .from('hero_featured_events')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      // Uppdatera prioriteter för återstående events
      const remaining = secondaryFeatured.filter(e => e.id !== id)
      for (let i = 0; i < remaining.length; i++) {
        await supabase
          .from('hero_featured_events')
          .update({ priority: i + 1 })
          .eq('id', remaining[i].id)
      }
      
      await fetchFeaturedEvents()
      alert('Secondary featured event borttagen!')
    } catch (error) {
      console.error('Error removing secondary featured:', error)
      alert('Fel vid borttagning')
    } finally {
      setUpdating(false)
    }
  }

  const moveSecondaryEvent = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === secondaryFeatured.length - 1) return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    const newOrder = [...secondaryFeatured]
    const temp = newOrder[index]
    newOrder[index] = newOrder[newIndex]
    newOrder[newIndex] = temp

    setUpdating(true)
    try {
      // Uppdatera prioriteter
      for (let i = 0; i < newOrder.length; i++) {
        await supabase
          .from('hero_featured_events')
          .update({ priority: i + 1 })
          .eq('id', newOrder[i].id)
      }
      
      await fetchFeaturedEvents()
    } catch (error) {
      console.error('Error reordering:', error)
      alert('Fel vid omsortering')
    } finally {
      setUpdating(false)
    }
  }

  const filteredEvents = availableEvents.filter(event => {
    const matchesSearch = event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.venue_name?.toLowerCase().includes(searchTerm.toLowerCase())
    
    // Filtrera bort events som redan är featured
    const isAlreadyFeatured = 
      mainFeatured?.event_id === event.id ||
      secondaryFeatured.some(f => f.event_id === event.id)
    
    return matchesSearch && !isAlreadyFeatured
  })

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hero Featured Events</h1>
          <p className="mt-1 text-sm text-gray-500">
            Hantera featured events som visas på startsidans hero-sektion. Ett main featured event och upp till 5 secondary featured events.
          </p>
        </div>

        {/* Main Featured Event */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Star className="w-5 h-5 mr-2 text-yellow-500" />
            Main Featured Event
          </h2>
          
          {mainFeatured?.event ? (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start gap-4">
                {mainFeatured.event.image_url && (
                  <img 
                    src={mainFeatured.event.image_url} 
                    alt={mainFeatured.event.name}
                    className="w-32 h-32 object-cover rounded-lg flex-shrink-0"
                  />
                )}
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {mainFeatured.event.name}
                  </h3>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      {formatDate(mainFeatured.event.date_time)}
                    </div>
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 mr-2" />
                      {mainFeatured.event.venue_name || mainFeatured.event.location}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => {
                        fetchAvailableEvents()
                        setShowEventSelector('main')
                      }}
                      disabled={updating}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      Byt event
                    </button>
                    <button
                      onClick={removeMainFeaturedEvent}
                      disabled={updating}
                      className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50"
                    >
                      Ta bort
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
              <Star className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">Inget main featured event valt</p>
              <button
                onClick={() => {
                  fetchAvailableEvents()
                  setShowEventSelector('main')
                }}
                disabled={updating}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Välj event
              </button>
            </div>
          )}
        </div>

        {/* Secondary Featured Events */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Secondary Featured Events ({secondaryFeatured.length}/5)
            </h2>
            {secondaryFeatured.length < 5 && (
              <button
                onClick={() => {
                  fetchAvailableEvents()
                  setShowEventSelector('secondary')
                }}
                disabled={updating}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Lägg till
              </button>
            )}
          </div>

          {secondaryFeatured.length > 0 ? (
            <div className="space-y-3">
              {secondaryFeatured.map((featured, index) => (
                <div
                  key={featured.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Priority indicator & move buttons */}
                    <div className="flex flex-col items-center gap-1">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-800 text-sm font-bold">
                        {index + 1}
                      </span>
                      <button
                        onClick={() => moveSecondaryEvent(index, 'up')}
                        disabled={index === 0 || updating}
                        className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Flytta upp"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveSecondaryEvent(index, 'down')}
                        disabled={index === secondaryFeatured.length - 1 || updating}
                        className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Flytta ner"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    
                    {/* Event image */}
                    {featured.event?.image_url && (
                      <img 
                        src={featured.event.image_url} 
                        alt={featured.event?.name}
                        className="w-24 h-24 object-cover rounded flex-shrink-0"
                      />
                    )}
                    
                    {/* Event info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {featured.event?.name}
                      </h3>
                      <div className="mt-2 space-y-1 text-sm text-gray-600">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                          <span className="truncate">{formatDate(featured.event?.date_time || '')}</span>
                        </div>
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                          <span className="truncate">{featured.event?.venue_name || featured.event?.location}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Remove button */}
                    <button
                      onClick={() => removeSecondaryFeaturedEvent(featured.id)}
                      disabled={updating}
                      className="text-red-600 hover:bg-red-50 p-2 rounded disabled:opacity-50"
                      title="Ta bort"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
              <p className="text-sm text-gray-600">Inga secondary featured events</p>
              <button
                onClick={() => {
                  fetchAvailableEvents()
                  setShowEventSelector('secondary')
                }}
                disabled={updating}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Lägg till event
              </button>
            </div>
          )}
        </div>

        {/* Event Selector Modal */}
        {showEventSelector && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" onClick={() => setShowEventSelector(null)}>
            <div className="relative top-10 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white mb-10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Välj Event för {showEventSelector === 'main' ? 'Main' : 'Secondary'} Featured
                </h3>
                <button
                  onClick={() => setShowEventSelector(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                Visar endast publicerade events som inte redan är featured
              </p>

              {/* Search */}
              <div className="mb-4">
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
              </div>

              {/* Events List */}
              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredEvents.length > 0 ? (
                  filteredEvents.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => {
                        if (showEventSelector === 'main') {
                          setMainFeaturedEvent(event.id)
                        } else {
                          addSecondaryFeaturedEvent(event.id)
                        }
                      }}
                      disabled={updating}
                      className="w-full text-left p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-start gap-4">
                        {event.image_url && (
                          <img 
                            src={event.image_url} 
                            alt={event.name}
                            className="w-20 h-20 object-cover rounded flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900 truncate">{event.name}</h4>
                          <div className="mt-1 space-y-1 text-sm text-gray-600">
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="truncate">{formatDate(event.date_time)}</span>
                            </div>
                            <div className="flex items-center">
                              <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="truncate">{event.venue_name || event.location}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p>Inga events hittades</p>
                    <p className="text-sm mt-1">Prova att ändra sökfilter</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  )
}


