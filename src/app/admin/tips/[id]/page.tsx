'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { EventTip } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import { ArrowLeft, XCircle, CheckCircle, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import Image from 'next/image'

export default function AdminTipDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [tip, setTip] = useState<EventTip | null>(null)
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  useEffect(() => {
    fetchTip()
  }, [params.id])

  const fetchTip = async () => {
    try {
      const response = await fetch(`/api/admin/tips/${params.id}`)
      const data = await response.json()

      if (data.error) throw new Error(data.error)
      setTip(data.data)
    } catch (error) {
      console.error('Error fetching tip:', error)
      alert('Fel vid hämtning av tips')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    const reason = prompt('Varför avböjer du detta tips? (Valfritt)')
    
    setRejecting(true)
    try {
      const response = await fetch(`/api/admin/tips/${params.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || '' })
      })

      const data = await response.json()

      if (data.error) throw new Error(data.error)

      alert('Tips avböjt!')
      router.push('/admin/tips')
    } catch (error) {
      console.error('Error rejecting tip:', error)
      alert('Fel vid avböjning av tips')
    } finally {
      setRejecting(false)
    }
  }

  const handleConvert = async () => {
    if (!confirm(
      `Är du säker på att du vill konvertera detta tips till ett event?\n\n` +
      `Eventet kommer att skapas och du kommer att tas till redigeringssidan för att komplettera information.`
    )) {
      return
    }

    setConverting(true)
    try {
      // Skapa event direkt i databasen (client-side)
      const { generateUniqueEventId } = await import('@/lib/event-id-generator')
      const { supabase } = await import('@/lib/supabase')
      
      // Generera unikt event ID
      const eventId = await generateUniqueEventId(
        tip.event_name,
        `tip-${tip.id}`,
        supabase
      )

      // Förbered categories
      const categories = tip.categories && tip.categories.length > 0
        ? tip.categories
        : tip.category
          ? [tip.category]
          : ['Okategoriserad']

      const mainCategory = categories[0]

      // Helper function för category scores
      const generateCategoryScores = (cats: string[]) => {
        return cats.reduce((scores, cat, index) => {
          scores[cat] = 1.0 - (index * 0.1)
          return scores
        }, {} as Record<string, number>)
      }

      // Skapa event
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert([{
          event_id: eventId,
          name: tip.event_name,
          date_time: tip.date_time || tip.event_date,
          location: tip.event_location || '',
          venue_name: tip.venue_name,
          description: tip.event_description,
          description_format: 'plaintext',
          category: mainCategory,
          categories: categories,
          category_scores: generateCategoryScores(categories),
          image_url: tip.image_url,
          organizer_event_url: tip.website_url,
          status: 'draft',
          tags: ['tips', 'user-submitted'],
          price: null,
          organizer_id: null,
          is_featured: false,
          featured: false,
          max_participants: null,
          quality_score: null,
          quality_issues: null,
          auto_published: false
        }])
        .select()
        .single()

      if (eventError) throw eventError

      // Uppdatera tip status
      await supabase
        .from('event_tips')
        .update({
          status: 'converted',
          updated_at: new Date().toISOString()
        })
        .eq('id', tip.id)

      alert('✅ Tips konverterat till event! Du kommer att tas till redigeringssidan.')
      router.push(`/events/${event.id}/edit`)
    } catch (error) {
      console.error('Error converting tip:', error)
      alert(`Fel vid konvertering av tips: ${error instanceof Error ? error.message : 'Okänt fel'}`)
    } finally {
      setConverting(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'reviewed':
        return 'bg-blue-100 text-blue-800'
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      case 'converted':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Väntar'
      case 'reviewed':
        return 'Granskad'
      case 'approved':
        return 'Godkänd'
      case 'rejected':
        return 'Avböjd'
      case 'converted':
        return 'Konverterad'
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

  if (!tip) {
    return (
      <ProtectedLayout>
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg">Tips hittades inte</div>
          <Link href="/admin/tips" className="text-blue-600 hover:text-blue-800 mt-4 inline-block">
            Tillbaka till tips
          </Link>
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
              href="/admin/tips"
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{tip.event_name}</h1>
              <p className="text-gray-600 mt-1">
                Granska och hantera tips
              </p>
            </div>
          </div>

          {/* Status */}
          <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(tip.status)}`}>
            {getStatusText(tip.status)}
          </span>
        </div>

        {/* Actions */}
        {tip.status !== 'converted' && tip.status !== 'rejected' && (
          <div className="bg-white p-6 rounded-lg border flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Åtgärder</h3>
              <p className="text-sm text-gray-600">
                Välj hur du vill hantera detta tips
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleReject}
                disabled={rejecting}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                <span>{rejecting ? 'Avböjer...' : 'Avböj'}</span>
              </button>
              <button
                onClick={handleConvert}
                disabled={converting}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                <span>{converting ? 'Konverterar...' : 'Konvertera till Event'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Event Information */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Event Information</h2>
          </div>
          
          <div className="p-6 space-y-6">
            {/* Image */}
            {tip.image_url && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bild
                </label>
                <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={tip.image_url}
                    alt={tip.event_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Event Namn
              </label>
              <div className="text-lg font-medium text-gray-900">{tip.event_name}</div>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Datum och Tid
                </label>
                <div className="text-gray-900">
                  {tip.date_time ? formatDate(tip.date_time) : tip.event_date || '-'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(tip.status)}`}>
                  {getStatusText(tip.status)}
                </span>
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Plats
              </label>
              <div className="text-gray-900">{tip.event_location || '-'}</div>
              {tip.venue_name && (
                <div className="text-sm text-gray-600 mt-1">
                  Platsnamn: {tip.venue_name}
                </div>
              )}
            </div>

            {/* Categories */}
            {tip.categories && tip.categories.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kategorier
                </label>
                <div className="flex flex-wrap gap-2">
                  {tip.categories.map((category, index) => (
                    <span
                      key={index}
                      className="inline-flex px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            {tip.event_description && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Beskrivning
                </label>
                <div className="text-gray-900 whitespace-pre-wrap">{tip.event_description}</div>
              </div>
            )}

            {/* Website */}
            {tip.website_url && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Webbplats
                </label>
                <a
                  href={tip.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-blue-600 hover:text-blue-800"
                >
                  <span>{tip.website_url}</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Submitter Information */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Inlämnare</h2>
          </div>
          
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                E-post
              </label>
              <div className="text-gray-900">{tip.submitter_email}</div>
            </div>
            {tip.submitter_name && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Namn
                </label>
                <div className="text-gray-900">{tip.submitter_name}</div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Inlämnad
              </label>
              <div className="text-gray-900">{formatDate(tip.created_at)}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Uppdaterad
              </label>
              <div className="text-gray-900">{formatDate(tip.updated_at)}</div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  )
}
