'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase'
import { eventSchema, EventFormData, eventCategories, eventStatuses } from '@/lib/validations'
import { Event, Organizer } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import GooglePlacesAutocomplete from '@/components/GooglePlacesAutocomplete'
import { ArrowLeft, Save, X } from 'lucide-react'
import Link from 'next/link'

export default function EditEventPage() {
  const params = useParams()
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)
  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    reset,
    watch,
  } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
  })

  useEffect(() => {
    if (params.id) {
      fetchEvent(parseInt(params.id as string))
      fetchOrganizers()
    }
  }, [params.id])

  useEffect(() => {
    if (event) {
      // Reset form with event data
      reset({
        event_id: event.event_id,
        name: event.name,
        description: event.description || '',
        date_time: event.date_time.slice(0, 16), // Format for datetime-local input
        location: event.location,
        venue_name: event.venue_name || '',
        price: event.price || '',
        image_url: event.image_url || '',
        organizer_event_url: event.organizer_event_url || '',
        category: event.category,
        organizer_id: event.organizer_id || undefined,
        featured: event.featured,
        status: event.status,
        max_participants: event.max_participants || undefined,
        tags: event.tags || [],
      })
      setTags(event.tags || [])
    }
  }, [event, reset])

  useEffect(() => {
    setValue('tags', tags)
  }, [tags, setValue])

  const fetchEvent = async (id: number) => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      setEvent(data)
    } catch (error) {
      console.error('Error fetching event:', error)
    } finally {
      setInitialLoading(false)
    }
  }

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
    }
  }

  const onSubmit = async (data: EventFormData) => {
    if (!event) return

    setLoading(true)
    try {
      const updateData = {
        event_id: data.event_id,
        name: data.name,
        description: data.description || null,
        date_time: data.date_time,
        location: data.location,
        venue_name: data.venue_name || null,
        price: data.price || null,
        image_url: data.image_url || null,
        organizer_event_url: data.organizer_event_url || null,
        category: data.category,
        organizer_id: data.organizer_id || null,
        featured: data.featured,
        status: data.status,
        max_participants: data.max_participants || null,
        tags: data.tags,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', event.id)

      if (error) throw error

      router.push(`/events/${event.id}`)
    } catch (error) {
      console.error('Error updating event:', error)
      alert('Fel vid uppdatering av event: ' + (error instanceof Error ? error.message : 'Okänt fel'))
    } finally {
      setLoading(false)
    }
  }

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  if (initialLoading) {
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
            Det event du försöker redigera existerar inte eller har tagits bort.
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
              href={`/events/${event.id}`}
              className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Tillbaka till event
            </Link>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Redigera event</h1>
          <p className="mt-1 text-sm text-gray-500">
            Uppdatera informationen för {event.name}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {/* Event ID */}
                <div className="sm:col-span-2">
                  <label htmlFor="event_id" className="block text-sm font-medium text-gray-700">
                    Event ID
                  </label>
                  <input
                    type="text"
                    {...register('event_id')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  {errors.event_id && (
                    <p className="mt-2 text-sm text-red-600">{errors.event_id.message}</p>
                  )}
                </div>

                {/* Name */}
                <div className="sm:col-span-2">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Namn *
                  </label>
                  <input
                    type="text"
                    {...register('name')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  {errors.name && (
                    <p className="mt-2 text-sm text-red-600">{errors.name.message}</p>
                  )}
                </div>

                {/* Description */}
                <div className="sm:col-span-2">
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Beskrivning
                  </label>
                  <textarea
                    rows={4}
                    {...register('description')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  {errors.description && (
                    <p className="mt-2 text-sm text-red-600">{errors.description.message}</p>
                  )}
                </div>

                {/* Date Time */}
                <div>
                  <label htmlFor="date_time" className="block text-sm font-medium text-gray-700">
                    Datum och tid *
                  </label>
                  <input
                    type="datetime-local"
                    {...register('date_time')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  {errors.date_time && (
                    <p className="mt-2 text-sm text-red-600">{errors.date_time.message}</p>
                  )}
                </div>

                {/* Venue Name */}
                <div>
                  <label htmlFor="venue_name" className="block text-sm font-medium text-gray-700">
                    Platsnamn
                  </label>
                  <input
                    type="text"
                    {...register('venue_name')}
                    placeholder="t.ex. Varbergs Teater"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  {errors.venue_name && (
                    <p className="mt-2 text-sm text-red-600">{errors.venue_name.message}</p>
                  )}
                </div>

                {/* Location */}
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                    Adress *
                  </label>
                  <GooglePlacesAutocomplete
                    value={watch('location') || ''}
                    onChange={(value) => setValue('location', value)}
                    onVenueNameChange={(venueName) => setValue('venue_name', venueName)}
                    placeholder="Sök efter plats..."
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    name="location"
                  />
                  {errors.location && (
                    <p className="mt-2 text-sm text-red-600">{errors.location.message}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    När du väljer en plats fylls både platsnamn och adress i automatiskt
                  </p>
                </div>

                {/* Price */}
                <div>
                  <label htmlFor="price" className="block text-sm font-medium text-gray-700">
                    Pris
                  </label>
                  <input
                    type="text"
                    placeholder="t.ex. Gratis, 100 kr, 50-150 kr"
                    {...register('price')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  {errors.price && (
                    <p className="mt-2 text-sm text-red-600">{errors.price.message}</p>
                  )}
                </div>

                {/* Max Participants */}
                <div>
                  <label htmlFor="max_participants" className="block text-sm font-medium text-gray-700">
                    Max antal deltagare
                  </label>
                  <input
                    type="number"
                    min="1"
                    {...register('max_participants', { 
                      setValueAs: (value) => value === '' ? undefined : Number(value)
                    })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  {errors.max_participants && (
                    <p className="mt-2 text-sm text-red-600">{errors.max_participants.message}</p>
                  )}
                </div>

                {/* Category */}
                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700">
                    Kategori *
                  </label>
                  <select
                    {...register('category')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="">Välj kategori</option>
                    {eventCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  {errors.category && (
                    <p className="mt-2 text-sm text-red-600">{errors.category.message}</p>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    {...register('status')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    {eventStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status === 'draft' && 'Utkast'}
                        {status === 'pending_approval' && 'Väntar godkännande'}
                        {status === 'published' && 'Publicerad'}
                        {status === 'cancelled' && 'Avbruten'}
                      </option>
                    ))}
                  </select>
                  {errors.status && (
                    <p className="mt-2 text-sm text-red-600">{errors.status.message}</p>
                  )}
                </div>

                {/* Organizer */}
                <div>
                  <label htmlFor="organizer_id" className="block text-sm font-medium text-gray-700">
                    Organizer
                  </label>
                  <select
                    {...register('organizer_id', { valueAsNumber: true })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="">Välj organizer</option>
                    {organizers.map((organizer) => (
                      <option key={organizer.id} value={organizer.id}>
                        {organizer.name}
                      </option>
                    ))}
                  </select>
                  {errors.organizer_id && (
                    <p className="mt-2 text-sm text-red-600">{errors.organizer_id.message}</p>
                  )}
                </div>

                {/* Image URL */}
                <div>
                  <label htmlFor="image_url" className="block text-sm font-medium text-gray-700">
                    Bild URL
                  </label>
                  <input
                    type="url"
                    {...register('image_url')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  {errors.image_url && (
                    <p className="mt-2 text-sm text-red-600">{errors.image_url.message}</p>
                  )}
                </div>

                {/* Organizer Event URL */}
                <div>
                  <label htmlFor="organizer_event_url" className="block text-sm font-medium text-gray-700">
                    Organizer Event URL
                  </label>
                  <input
                    type="url"
                    {...register('organizer_event_url')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  {errors.organizer_event_url && (
                    <p className="mt-2 text-sm text-red-600">{errors.organizer_event_url.message}</p>
                  )}
                </div>

                {/* Tags */}
                <div className="sm:col-span-2">
                  <label htmlFor="tags" className="block text-sm font-medium text-gray-700">
                    Taggar
                  </label>
                  <div className="mt-1">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="ml-1 text-blue-600 hover:text-blue-800"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyPress={handleTagKeyPress}
                        placeholder="Lägg till tagg..."
                        className="flex-1 border-gray-300 rounded-l-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={addTag}
                        className="px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Lägg till
                      </button>
                    </div>
                  </div>
                </div>

                {/* Is Featured */}
                <div className="sm:col-span-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      {...register('featured')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="featured" className="ml-2 block text-sm text-gray-900">
                      Markera som featured event
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <Link
              href={`/events/${event.id}`}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Avbryt
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Sparar...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Spara ändringar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </ProtectedLayout>
  )
}
