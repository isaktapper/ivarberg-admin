'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Event } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Calendar, 
  MapPin, 
  User, 
  Star,
  ExternalLink,
  Image as ImageIcon,
  Users,
  Tag,
  Clock
} from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetchEvent(parseInt(params.id as string))
    }
  }, [params.id])

  const fetchEvent = async (id: number) => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          organizer:organizers(*)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setEvent(data)
    } catch (error) {
      console.error('Error fetching event:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteEvent = async () => {
    if (!event || !confirm('Är du säker på att du vill ta bort detta event?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', event.id)

      if (error) throw error
      
      router.push('/events')
    } catch (error) {
      console.error('Error deleting event:', error)
      alert('Fel vid borttagning av event')
    }
  }

  const toggleFeatured = async () => {
    if (!event) return

    try {
      const { error } = await supabase
        .from('events')
        .update({ featured: !event.featured })
        .eq('id', event.id)

      if (error) throw error
      
      setEvent({ ...event, featured: !event.featured })
    } catch (error) {
      console.error('Error updating featured status:', error)
      alert('Fel vid uppdatering av featured status')
    }
  }

  const getStatusColor = (status: string) => {
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

  const getStatusText = (status: string) => {
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

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </ProtectedLayout>
    )
  }

  if (!event) {
    return (
      <ProtectedLayout>
        <div className="text-center py-12">
          <h3 className="mt-2 text-sm font-medium text-gray-900">Event hittades inte</h3>
          <p className="mt-1 text-sm text-gray-500">
            Det event du letar efter existerar inte eller har tagits bort.
          </p>
          <div className="mt-6">
            <Link
              href="/events"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tillbaka till events
            </Link>
          </div>
        </div>
      </ProtectedLayout>
    )
  }

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              href="/events"
              className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Tillbaka till events
            </Link>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={toggleFeatured}
              className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                event.featured
                  ? 'text-yellow-700 bg-yellow-100 hover:bg-yellow-200'
                  : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <Star className={`w-4 h-4 mr-1 ${event.featured ? 'fill-current' : ''}`} />
              {event.featured ? 'Ta bort featured' : 'Lägg till featured'}
            </button>
            <Link
              href={`/events/${event.id}/edit`}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Edit className="w-4 h-4 mr-2" />
              Redigera
            </Link>
            <button
              onClick={deleteEvent}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Ta bort
            </button>
          </div>
        </div>

        {/* Event Details */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
                <p className="mt-1 text-sm text-gray-500">ID: {event.event_id}</p>
              </div>
              <div className="flex items-center space-x-2">
                {event.featured && (
                  <Star className="h-6 w-6 text-yellow-400 fill-current" />
                )}
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(event.status)}`}>
                  {getStatusText(event.status)}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              {/* Date and Time */}
              <div>
                <dt className="text-sm font-medium text-gray-500 flex items-center">
                  <Calendar className="w-4 h-4 mr-2" />
                  Datum och tid
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDate(event.date_time)}
                </dd>
              </div>

              {/* Location */}
              <div>
                <dt className="text-sm font-medium text-gray-500 flex items-center">
                  <MapPin className="w-4 h-4 mr-2" />
                  Plats
                </dt>
                <dd className="mt-1 text-sm text-gray-900">{event.location}</dd>
              </div>

              {/* Category */}
              <div>
                <dt className="text-sm font-medium text-gray-500">Kategori</dt>
                <dd className="mt-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {event.category}
                  </span>
                </dd>
              </div>

              {/* Price */}
              {event.price && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Pris</dt>
                  <dd className="mt-1 text-sm text-gray-900">{event.price}</dd>
                </div>
              )}

              {/* Max Participants */}
              {event.max_participants && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <Users className="w-4 h-4 mr-2" />
                    Max antal deltagare
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">{event.max_participants}</dd>
                </div>
              )}

              {/* Organizer */}
              {event.organizer && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    Organizer
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    <Link
                      href={`/organizers/${event.organizer.id}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {event.organizer.name}
                    </Link>
                  </dd>
                </div>
              )}

              {/* Created */}
              <div>
                <dt className="text-sm font-medium text-gray-500 flex items-center">
                  <Clock className="w-4 h-4 mr-2" />
                  Skapad
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDate(event.created_at)}
                </dd>
              </div>

              {/* Updated */}
              <div>
                <dt className="text-sm font-medium text-gray-500 flex items-center">
                  <Clock className="w-4 h-4 mr-2" />
                  Uppdaterad
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDate(event.updated_at)}
                </dd>
              </div>

              {/* Description */}
              {event.description && (
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">Beskrivning</dt>
                  <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                    {event.description}
                  </dd>
                </div>
              )}

              {/* Tags */}
              {event.tags && event.tags.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <Tag className="w-4 h-4 mr-2" />
                    Taggar
                  </dt>
                  <dd className="mt-1">
                    <div className="flex flex-wrap gap-2">
                      {event.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </dd>
                </div>
              )}

              {/* Image URL */}
              {event.image_url && (
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <ImageIcon className="w-4 h-4 mr-2" />
                    Bild
                  </dt>
                  <dd className="mt-1">
                    <div className="flex items-center space-x-3">
                      <a
                        href={event.image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 flex items-center"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Visa bild
                      </a>
                    </div>
                    <div className="mt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={event.image_url}
                        alt={event.name}
                        className="h-48 w-auto rounded-lg shadow-sm"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    </div>
                  </dd>
                </div>
              )}

              {/* Organizer Event URL */}
              {event.organizer_event_url && (
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">Organizer Event URL</dt>
                  <dd className="mt-1">
                    <a
                      href={event.organizer_event_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Öppna i ny flik
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  )
}
