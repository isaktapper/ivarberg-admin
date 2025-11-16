'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Organizer, Event, OrganizerPage } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Mail, 
  Phone, 
  MapPin, 
  Globe,
  Calendar,
  Clock,
  FileText,
  Plus,
  ExternalLink
} from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export default function OrganizerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [organizer, setOrganizer] = useState<Organizer | null>(null)
  const [organizerPage, setOrganizerPage] = useState<OrganizerPage | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingPage, setCreatingPage] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchOrganizer(parseInt(params.id as string))
      fetchOrganizerEvents(parseInt(params.id as string))
      fetchOrganizerPage(parseInt(params.id as string))
    }
  }, [params.id])

  const fetchOrganizer = async (id: number) => {
    try {
      const { data, error } = await supabase
        .from('organizers')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      setOrganizer(data)
    } catch (error) {
      console.error('Error fetching organizer:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchOrganizerEvents = async (organizerId: number) => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('organizer_id', organizerId)
        .order('date_time', { ascending: false })

      if (error) throw error
      setEvents(data || [])
    } catch (error) {
      console.error('Error fetching organizer events:', error)
    }
  }

  const fetchOrganizerPage = async (organizerId: number) => {
    try {
      const { data, error } = await supabase
        .from('organizer_pages')
        .select('*')
        .eq('organizer_id', organizerId)
        .maybeSingle()

      if (error) throw error
      setOrganizerPage(data)
    } catch (error) {
      console.error('Error fetching organizer page:', error)
    }
  }

  const createOrganizerPage = async () => {
    if (!organizer) return

    // Kontrollera att organizern har en website
    if (!organizer.website) {
      alert('Arrangören måste ha en webbplats-URL för att kunna skapa en arrangörssida. Lägg till en webbplats först.')
      router.push(`/organizers/${organizer.id}/edit`)
      return
    }

    const confirmed = confirm(
      `Vill du skapa en arrangörssida för "${organizer.name}"?\n\n` +
      `Detta kommer att:\n` +
      `- Scrapa webbplatsen: ${organizer.website}\n` +
      `- Generera innehåll med AI\n` +
      `- Klassificera bilder\n\n` +
      `Detta kan ta 10-30 sekunder.`
    )

    if (!confirmed) return

    setCreatingPage(true)
    try {
      const response = await fetch(`/api/organizers/${organizer.id}/create-page`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        if (response.status === 409 && result.pageId) {
          // Page already exists, navigate to it
          router.push(`/organizer-pages/${result.pageId}/edit`)
          return
        }
        
        // Hantera olika typer av fel
        if (result.type === 'rate_limit') {
          alert(`⏰ Rate limit nådd\n\n${result.details}`)
        } else if (result.type === 'auth_error') {
          alert(`🔑 Autentiseringsfel\n\n${result.details}`)
        } else if (result.type === 'scrape_error') {
          alert(`🚫 Scraping misslyckades\n\n${result.details}\n\nKontrollera att webbplatsen är tillgänglig och försök igen.`)
        } else {
          alert(`❌ ${result.error}\n\n${result.details || ''}`)
        }
        return
      }

      if (result.page) {
        alert(
          `✅ Arrangörssida skapad!\n\n` +
          `${result.metadata.imagesFound} bilder hittades\n` +
          `${result.metadata.galleryImagesCount} bilder i galleri\n\n` +
          `Sidan har sparats som utkast.`
        )
        router.push(`/organizer-pages/${result.page.id}/edit`)
      }
    } catch (error) {
      console.error('Error creating organizer page:', error)
      alert(
        `❌ Oväntat fel vid skapande av arrangörssida\n\n` +
        `${error instanceof Error ? error.message : 'Okänt fel'}\n\n` +
        `Kontrollera konsolen för mer information.`
      )
    } finally {
      setCreatingPage(false)
    }
  }

  const deleteOrganizer = async () => {
    if (!organizer || !confirm('Är du säker på att du vill ta bort denna organizer?')) {
      return
    }

    if (events.length > 0) {
      alert('Kan inte ta bort organizer som har events kopplade till sig. Ta bort eller uppdatera events först.')
      return
    }

    try {
      const { error } = await supabase
        .from('organizers')
        .delete()
        .eq('id', organizer.id)

      if (error) throw error
      
      router.push('/organizers')
    } catch (error) {
      console.error('Error deleting organizer:', error)
      alert('Fel vid borttagning av organizer')
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

  if (!organizer) {
    return (
      <ProtectedLayout>
        <div className="text-center py-12">
          <h3 className="mt-2 text-sm font-medium text-gray-900">Organizer hittades inte</h3>
          <p className="mt-1 text-sm text-gray-500">
            Den organizer du letar efter existerar inte eller har tagits bort.
          </p>
          <div className="mt-6">
            <Link
              href="/organizers"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tillbaka till organizers
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
              href="/organizers"
              className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Tillbaka till organizers
            </Link>
          </div>
          <div className="flex items-center space-x-3">
            <Link
              href={`/organizers/${organizer.id}/edit`}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Edit className="w-4 h-4 mr-2" />
              Redigera
            </Link>
            <button
              onClick={deleteOrganizer}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Ta bort
            </button>
          </div>
        </div>

        {/* Organizer Details */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:px-6">
            <h1 className="text-2xl font-bold text-gray-900">{organizer.name}</h1>
          </div>

          <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              {/* Location */}
              {organizer.location && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <MapPin className="w-4 h-4 mr-2" />
                    Plats
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">{organizer.location}</dd>
                </div>
              )}

              {/* Phone */}
              {organizer.phone && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <Phone className="w-4 h-4 mr-2" />
                    Telefon
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    <a 
                      href={`tel:${organizer.phone}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {organizer.phone}
                    </a>
                  </dd>
                </div>
              )}

              {/* Email */}
              {organizer.email && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <Mail className="w-4 h-4 mr-2" />
                    E-post
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    <a 
                      href={`mailto:${organizer.email}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {organizer.email}
                    </a>
                  </dd>
                </div>
              )}

              {/* Website */}
              {organizer.website && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <Globe className="w-4 h-4 mr-2" />
                    Webbsida
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    <a
                      href={organizer.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {organizer.website}
                    </a>
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
                  {formatDate(organizer.created_at)}
                </dd>
              </div>

              {/* Updated */}
              <div>
                <dt className="text-sm font-medium text-gray-500 flex items-center">
                  <Clock className="w-4 h-4 mr-2" />
                  Uppdaterad
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDate(organizer.updated_at)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Organizer Page */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  Arrangörssida
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  SEO-optimerad sida för denna arrangör
                </p>
              </div>
              {!organizerPage && (
                <button
                  onClick={createOrganizerPage}
                  disabled={creatingPage || !organizer.website}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!organizer.website ? 'Arrangören måste ha en webbplats för att skapa en arrangörssida' : ''}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {creatingPage ? 'Skapar (kan ta 10-30 sek)...' : 'Skapa arrangörssida'}
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
            {organizerPage ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h4 className="text-base font-medium text-gray-900">
                        {organizerPage.name}
                      </h4>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          organizerPage.is_published
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {organizerPage.is_published ? 'Publicerad' : 'Utkast'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      /{organizerPage.slug}
                    </p>
                    <p className="mt-2 text-sm text-gray-700">
                      {organizerPage.description}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <Link
                      href={`/organizer-pages/${organizerPage.id}/edit`}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Redigera
                    </Link>
                    {organizerPage.is_published && (
                      <a
                        href={`${process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://ivarberg.se'}/arrangor/${organizerPage.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Visa
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">
                  Denna arrangör har ingen arrangörssida ännu
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {organizer.website 
                    ? 'Klicka på "Skapa arrangörssida" för att automatiskt scrapa webbplatsen och generera innehåll med AI'
                    : 'Lägg till en webbplats på arrangören för att kunna skapa en arrangörssida'
                  }
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Events */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Events ({events.length})
              </h3>
              <Link
                href={`/events/new?organizer_id=${organizer.id}`}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                Skapa nytt event
              </Link>
            </div>
          </div>
          
          {events.length === 0 ? (
            <div className="text-center py-8 border-t border-gray-200">
              <Calendar className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">
                Inga events hittades för denna organizer
              </p>
            </div>
          ) : (
            <div className="border-t border-gray-200">
              <ul className="divide-y divide-gray-200">
                {events.map((event) => (
                  <li key={event.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/events/${event.id}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                          {event.name}
                        </Link>
                        <div className="mt-1 flex items-center text-sm text-gray-500">
                          <Calendar className="w-4 h-4 mr-1" />
                          {formatDate(event.date_time)}
                          <span className="mx-2">•</span>
                          <MapPin className="w-4 h-4 mr-1" />
                          {event.location}
                        </div>
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {event.category}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(event.status)}`}>
                          {getStatusText(event.status)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  )
}
