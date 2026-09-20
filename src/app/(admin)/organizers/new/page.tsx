'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase'
import { organizerSchema, OrganizerFormData } from '@/lib/validations'
import ProtectedLayout from '@/components/ProtectedLayout'
import GooglePlacesAutocomplete from '@/components/GooglePlacesAutocomplete'
import { ArrowLeft, Save, X, Plus } from 'lucide-react'
import Link from 'next/link'

export default function NewOrganizerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [alternativeNames, setAlternativeNames] = useState<string[]>([])
  const [newAlternativeName, setNewAlternativeName] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<OrganizerFormData>({
    resolver: zodResolver(organizerSchema),
  })

  const onSubmit = async (data: OrganizerFormData) => {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('organizers')
        .insert([{
          ...data,
          location: data.location || null,
          phone: data.phone || null,
          email: data.email || null,
          website: data.website || null,
          alternative_names: alternativeNames.length > 0 ? alternativeNames : null,
        }])

      if (error) throw error

      router.push('/organizers')
    } catch (error) {
      console.error('Error creating organizer:', error)
      alert('Fel vid skapande av organizer: ' + (error instanceof Error ? error.message : 'Okänt fel'))
    } finally {
      setLoading(false)
    }
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
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Skapa ny organizer</h1>
          <p className="mt-1 text-sm text-gray-500">
            Fyll i informationen för den nya organizern
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
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <Link
              href="/organizers"
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
                  Spara organizer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </ProtectedLayout>
  )
}
