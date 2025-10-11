'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase'
import { organizerSchema, OrganizerFormData } from '@/lib/validations'
import { Organizer } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import GooglePlacesAutocomplete from '@/components/GooglePlacesAutocomplete'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

export default function EditOrganizerPage() {
  const params = useParams()
  const router = useRouter()
  const [organizer, setOrganizer] = useState<Organizer | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<OrganizerFormData>({
    resolver: zodResolver(organizerSchema),
  })

  useEffect(() => {
    if (params.id) {
      fetchOrganizer(parseInt(params.id as string))
    }
  }, [params.id])

  useEffect(() => {
    if (organizer) {
      // Reset form with organizer data
      reset({
        name: organizer.name,
        location: organizer.location || '',
        phone: organizer.phone || '',
        email: organizer.email || '',
        website: organizer.website || '',
      })
    }
  }, [organizer, reset])

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
      setInitialLoading(false)
    }
  }

  const onSubmit = async (data: OrganizerFormData) => {
    if (!organizer) return

    setLoading(true)
    try {
      const updateData = {
        name: data.name,
        location: data.location || null,
        phone: data.phone || null,
        email: data.email || null,
        website: data.website || null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('organizers')
        .update(updateData)
        .eq('id', organizer.id)

      if (error) throw error

      router.push(`/organizers/${organizer.id}`)
    } catch (error) {
      console.error('Error updating organizer:', error)
      alert('Fel vid uppdatering av organizer: ' + (error instanceof Error ? error.message : 'Okänt fel'))
    } finally {
      setLoading(false)
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

  if (!organizer) {
    return (
      <ProtectedLayout>
        <div className="text-center py-12">
          <h3 className="mt-2 text-sm font-medium text-gray-900">Organizer hittades inte</h3>
          <p className="mt-1 text-sm text-gray-500">
            Den organizer du försöker redigera existerar inte eller har tagits bort.
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
              href={`/organizers/${organizer.id}`}
              className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Tillbaka till organizer
            </Link>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Redigera organizer</h1>
          <p className="mt-1 text-sm text-gray-500">
            Uppdatera informationen för {organizer.name}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {/* Name */}
                <div className="sm:col-span-2">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Namn *
                  </label>
                  <input
                    type="text"
                    {...register('name')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Namn på organizer"
                  />
                  {errors.name && (
                    <p className="mt-2 text-sm text-red-600">{errors.name.message}</p>
                  )}
                </div>

                {/* Location */}
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                    Plats
                  </label>
                  <GooglePlacesAutocomplete
                    value={watch('location') || ''}
                    onChange={(value) => setValue('location', value)}
                    placeholder="Sök efter plats..."
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    name="location"
                  />
                  {errors.location && (
                    <p className="mt-2 text-sm text-red-600">{errors.location.message}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                    Telefon
                  </label>
                  <input
                    type="tel"
                    {...register('phone')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="+46 70 123 45 67"
                  />
                  {errors.phone && (
                    <p className="mt-2 text-sm text-red-600">{errors.phone.message}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    E-post
                  </label>
                  <input
                    type="email"
                    {...register('email')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="kontakt@example.com"
                  />
                  {errors.email && (
                    <p className="mt-2 text-sm text-red-600">{errors.email.message}</p>
                  )}
                </div>

                {/* Website */}
                <div>
                  <label htmlFor="website" className="block text-sm font-medium text-gray-700">
                    Webbsida
                  </label>
                  <input
                    type="url"
                    {...register('website')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="https://example.com"
                  />
                  {errors.website && (
                    <p className="mt-2 text-sm text-red-600">{errors.website.message}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <Link
              href={`/organizers/${organizer.id}`}
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
