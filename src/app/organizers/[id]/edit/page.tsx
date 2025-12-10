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
import { ArrowLeft, Save, AlertCircle, X, Plus } from 'lucide-react'
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

  const [selectedStatus, setSelectedStatus] = useState<'active' | 'pending' | 'archived'>('active')
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [draftEventCount, setDraftEventCount] = useState(0)
  const [alternativeNames, setAlternativeNames] = useState<string[]>([])
  const [newAlternativeName, setNewAlternativeName] = useState('')

  useEffect(() => {
    if (organizer) {
      // Reset form with organizer data
      reset({
        name: organizer.name,
        location: organizer.location || '',
        phone: organizer.phone || '',
        email: organizer.email || '',
        website: organizer.website || '',
        alternative_names: organizer.alternative_names || [],
      })
      setSelectedStatus(organizer.status)
      setAlternativeNames(organizer.alternative_names || [])
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

    // Om status ändras från pending → active, kolla om det finns draft-events
    if (organizer.status === 'pending' && selectedStatus === 'active') {
      // Hämta antal draft-events för denna organizer
      const { data: draftEvents, error } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organizer_id', organizer.id)
        .eq('status', 'draft')

      if (!error && draftEvents) {
        const count = (draftEvents as any).count || 0
        if (count > 0) {
          setDraftEventCount(count)
          setShowPublishModal(true)
          return // Vänta på användarens beslut i modalen
        }
      }
    }

    // Fortsätt med normal uppdatering
    await saveOrganizer(data, false)
  }

  const saveOrganizer = async (data: OrganizerFormData, publishEvents: boolean) => {
    if (!organizer) return

    setLoading(true)
    try {
      const updateData = {
        name: data.name,
        location: data.location || null,
        phone: data.phone || null,
        email: data.email || null,
        website: data.website || null,
        alternative_names: alternativeNames.length > 0 ? alternativeNames : null,
        status: selectedStatus,
        needs_review: selectedStatus === 'pending', // Endast pending behöver review
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('organizers')
        .update(updateData)
        .eq('id', organizer.id)

      if (error) throw error

      // Om användaren vill publicera events också
      if (publishEvents && selectedStatus === 'active') {
        const { error: eventsError } = await supabase
          .from('events')
          .update({ status: 'published' })
          .eq('organizer_id', organizer.id)
          .eq('status', 'draft')

        if (eventsError) {
          console.error('Error publishing events:', eventsError)
          alert('Organizer uppdaterad, men kunde inte publicera alla events.')
        }
      }

      router.push(`/organizers/${organizer.id}`)
    } catch (error) {
      console.error('Error updating organizer:', error)
      alert('Fel vid uppdatering av organizer: ' + (error instanceof Error ? error.message : 'Okänt fel'))
    } finally {
      setLoading(false)
      setShowPublishModal(false)
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

                {/* Alternative Names */}
                <div className="sm:col-span-2">
                  <label htmlFor="alternative_names" className="block text-sm font-medium text-gray-700">
                    Alternativa namn
                  </label>
                  <p className="text-sm text-gray-500 mb-2">
                    Lägg till alternativa namn som används vid matchning (ex: Sparbankshallen, Rotundan för Arena Varberg). Syns inte publikt.
                  </p>
                  
                  {/* Lista med alternativa namn */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {alternativeNames.map((name, index) => (
                      <div
                        key={index}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                      >
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newNames = alternativeNames.filter((_, i) => i !== index)
                            setAlternativeNames(newNames)
                          }}
                          className="ml-2 text-blue-600 hover:text-blue-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Input för att lägga till nytt alternativt namn */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAlternativeName}
                      onChange={(e) => setNewAlternativeName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const trimmed = newAlternativeName.trim()
                          if (trimmed && !alternativeNames.includes(trimmed)) {
                            setAlternativeNames([...alternativeNames, trimmed])
                            setNewAlternativeName('')
                          }
                        }
                      }}
                      className="flex-1 block border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Skriv ett alternativt namn och tryck Enter"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = newAlternativeName.trim()
                        if (trimmed && !alternativeNames.includes(trimmed)) {
                          setAlternativeNames([...alternativeNames, trimmed])
                          setNewAlternativeName('')
                        }
                      }}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Status */}
                <div className="sm:col-span-2">
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    id="status"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as 'active' | 'pending' | 'archived')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="pending">Pending - Behöver granskas</option>
                    <option value="active">Aktiv - Publicerad</option>
                    <option value="archived">Arkiverad</option>
                  </select>
                  <p className="mt-2 text-sm text-gray-500">
                    {selectedStatus === 'pending' && '⚠️ Events från pending-organizers hamnar automatiskt i draft'}
                    {selectedStatus === 'active' && '✓ Organizer är aktiv och kan publicera events'}
                    {selectedStatus === 'archived' && '📦 Organizer är arkiverad'}
                  </p>
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

        {/* Publish Events Modal */}
        {showPublishModal && (
          <div className="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              {/* Background overlay */}
              <div 
                className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
                aria-hidden="true"
                onClick={() => setShowPublishModal(false)}
              ></div>

              {/* Center modal */}
              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

              <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
                <div>
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                    <AlertCircle className="h-6 w-6 text-blue-600" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-5">
                    <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                      Publicera events också?
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Det finns <strong>{draftEventCount}</strong> events i draft-status kopplade till denna organizer.
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        Vill du publicera dessa events samtidigt som du aktiverar organizern?
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      const formData = watch()
                      saveOrganizer(formData, true)
                    }}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:col-start-2 sm:text-sm disabled:opacity-50"
                  >
                    Ja, publicera events
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      const formData = watch()
                      saveOrganizer(formData, false)
                    }}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:col-start-1 sm:text-sm disabled:opacity-50"
                  >
                    Nej, behåll som draft
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
