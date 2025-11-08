'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { OrganizerPage, ContactInfo, SocialLinks } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import { 
  Save, 
  Eye, 
  ArrowLeft,
  Upload,
  X,
  Plus,
  Link as LinkIcon,
  Mail,
  Phone,
  MapPin,
  Globe,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  ExternalLink,
  Star
} from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export default function EditOrganizerPage() {
  const router = useRouter()
  const params = useParams()
  const pageId = params.id as string
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState<OrganizerPage | null>(null)
  
  // Form data
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    title: '',
    description: '',
    content: '',
    hero_image_url: '',
    gallery_images: [] as string[],
    contact_info: {
      email: '',
      phone: '',
      website: '',
      address: ''
    } as ContactInfo,
    social_links: {
      facebook: '',
      instagram: '',
      twitter: '',
      linkedin: '',
      youtube: ''
    } as SocialLinks,
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
    is_published: false
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newGalleryImage, setNewGalleryImage] = useState('')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null)

  useEffect(() => {
    if (pageId) {
      fetchPage()
    }
  }, [pageId])

  useEffect(() => {
    // Check if we just created the page
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('created') === 'true') {
      setShowSuccessMessage(true)
      // Remove the parameter from URL
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }
  }, [])

  const fetchPage = async () => {
    try {
      const { data, error } = await supabase
        .from('organizer_pages')
        .select('*')
        .eq('id', pageId)
        .single()

      if (error) throw error

      setPage(data)
      setFormData({
        name: data.name || '',
        slug: data.slug || '',
        title: data.title || '',
        description: data.description || '',
        content: data.content || '',
        hero_image_url: data.hero_image_url || '',
        gallery_images: data.gallery_images || [],
        contact_info: data.contact_info || {
          email: '',
          phone: '',
          website: '',
          address: ''
        },
        social_links: data.social_links || {
          facebook: '',
          instagram: '',
          twitter: '',
          linkedin: '',
          youtube: ''
        },
        seo_title: data.seo_title || '',
        seo_description: data.seo_description || '',
        seo_keywords: data.seo_keywords || '',
        is_published: data.is_published || false
      })
    } catch (error) {
      console.error('Error fetching organizer page:', error)
      alert('Fel vid hämtning av arrangörssida')
      router.push('/organizer-pages')
    } finally {
      setLoading(false)
    }
  }

  // Auto-generate slug from name
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
  }

  const handleNameChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      name: value,
      slug: prev.slug || generateSlug(value)
    }))
  }

  const handleSlugChange = (value: string) => {
    // Validate slug format
    const slugRegex = /^[a-z0-9-]+$/
    if (value && !slugRegex.test(value)) {
      setErrors(prev => ({ ...prev, slug: 'Slug får bara innehålla små bokstäver, siffror och bindestreck' }))
    } else {
      setErrors(prev => ({ ...prev, slug: '' }))
    }
    
    setFormData(prev => ({ ...prev, slug: value }))
  }

  const addGalleryImage = () => {
    if (newGalleryImage.trim()) {
      setFormData(prev => ({
        ...prev,
        gallery_images: [...prev.gallery_images, newGalleryImage.trim()]
      }))
      setNewGalleryImage('')
    }
  }

  const removeGalleryImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      gallery_images: prev.gallery_images.filter((_, i) => i !== index)
    }))
  }

  const setAsHeroImage = (imageUrl: string) => {
    setFormData(prev => ({
      ...prev,
      hero_image_url: imageUrl
    }))
  }

  const moveImageToGallery = () => {
    if (formData.hero_image_url) {
      setFormData(prev => ({
        ...prev,
        gallery_images: [...prev.gallery_images, prev.hero_image_url],
        hero_image_url: ''
      }))
    }
  }

  const moveImageToHero = (index: number) => {
    const imageUrl = formData.gallery_images[index]
    if (imageUrl) {
      setFormData(prev => ({
        ...prev,
        hero_image_url: imageUrl,
        gallery_images: prev.gallery_images.filter((_, i) => i !== index)
      }))
    }
  }

  const reorderGalleryImages = (fromIndex: number, toIndex: number) => {
    const newImages = [...formData.gallery_images]
    const [movedImage] = newImages.splice(fromIndex, 1)
    newImages.splice(toIndex, 0, movedImage)
    
    setFormData(prev => ({
      ...prev,
      gallery_images: newImages
    }))
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedImageIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedImageIndex !== null && draggedImageIndex !== dropIndex) {
      reorderGalleryImages(draggedImageIndex, dropIndex)
    }
    setDraggedImageIndex(null)
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Namn är obligatoriskt'
    }

    if (!formData.slug.trim()) {
      newErrors.slug = 'Slug är obligatoriskt'
    } else if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      newErrors.slug = 'Slug får bara innehålla små bokstäver, siffror och bindestreck'
    }

    if (!formData.title.trim()) {
      newErrors.title = 'Titel är obligatoriskt'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Beskrivning är obligatoriskt'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async (publish: boolean = false) => {
    if (!validateForm()) {
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('organizer_pages')
        .update({
          ...formData,
          is_published: publish,
          updated_at: new Date().toISOString()
        })
        .eq('id', pageId)

      if (error) throw error

      // Update local state
      setPage(prev => prev ? { ...prev, ...formData, is_published: publish } : null)
      setShowSuccessMessage(true)
      
      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccessMessage(false), 3000)
    } catch (error) {
      console.error('Error updating organizer page:', error)
      if (error instanceof Error && error.message.includes('duplicate key')) {
        alert('En arrangörssida med denna slug finns redan')
      } else {
        alert('Fel vid uppdatering av arrangörssida')
      }
    } finally {
      setSaving(false)
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

  if (!page) {
    return (
      <ProtectedLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900">Arrangörssida hittades inte</h1>
          <p className="mt-2 text-gray-600">Sidan du letar efter finns inte.</p>
          <Link
            href="/organizer-pages"
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Tillbaka till listan
          </Link>
        </div>
      </ProtectedLayout>
    )
  }

  return (
    <ProtectedLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Success Message */}
        {showSuccessMessage && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800">
                  Arrangörssida sparad!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              href="/organizer-pages"
              className="text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Redigera Arrangörssida</h1>
              <p className="mt-1 text-sm text-gray-500">
                {page.name}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <a
              href={`${process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://ivarberg.nu'}/arrangor/${page.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Visa på webben
            </a>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Sparar...' : 'Spara utkast'}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Publicerar...' : 'Publicera'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Grundläggande information</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Namn <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                      errors.name ? 'border-red-300' : 'border-gray-300'
                    }`}
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="T.ex. Varbergs Teater"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Slug <span className="text-red-500">*</span>
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                      /
                    </span>
                    <input
                      type="text"
                      className={`flex-1 px-3 py-2 border rounded-r-md focus:ring-blue-500 focus:border-blue-500 ${
                        errors.slug ? 'border-red-300' : 'border-gray-300'
                      }`}
                      value={formData.slug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      placeholder="varbergs-teater"
                    />
                  </div>
                  {errors.slug && <p className="mt-1 text-sm text-red-600">{errors.slug}</p>}
                  <p className="mt-1 text-sm text-gray-500">
                    URL: {process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://ivarberg.nu'}/arrangor/{formData.slug || 'slug'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Titel <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                      errors.title ? 'border-red-300' : 'border-gray-300'
                    }`}
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="T.ex. Varbergs Teater - Kultur i hjärtat av Varberg"
                  />
                  {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Beskrivning <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                      errors.description ? 'border-red-300' : 'border-gray-300'
                    }`}
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Kort beskrivning som visas i förhandsvisningar..."
                  />
                  {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Huvudinnehåll
                  </label>
                  <textarea
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.content}
                    onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Detaljerat innehåll för sidan (Markdown stöds)..."
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Du kan använda Markdown för formatering
                  </p>
                </div>
              </div>
            </div>

            {/* Images */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Bilder</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hero-bild URL
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="url"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      value={formData.hero_image_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, hero_image_url: e.target.value }))}
                      placeholder="https://example.com/hero-image.jpg"
                    />
                    {formData.hero_image_url && (
                      <button
                        type="button"
                        onClick={moveImageToGallery}
                        className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
                        title="Flytta till galleri"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {formData.hero_image_url && (
                    <div className="mt-2 relative group">
                      <img
                        src={formData.hero_image_url}
                        alt="Hero preview"
                        className="h-32 w-full object-cover rounded-md bg-gray-100"
                        onError={(e) => {
                          console.log('Hero image failed to load:', formData.hero_image_url)
                          e.currentTarget.style.display = 'none'
                        }}
                        onLoad={() => {
                          console.log('Hero image loaded successfully:', formData.hero_image_url)
                        }}
                      />
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-600 text-white">
                          Hero-bild
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Galleri-bilder
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="url"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      value={newGalleryImage}
                      onChange={(e) => setNewGalleryImage(e.target.value)}
                      placeholder="https://example.com/gallery-image.jpg"
                    />
                    <button
                      onClick={addGalleryImage}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {formData.gallery_images.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm text-gray-500 mb-2">
                        Dra bilder för att ändra ordning. Klicka på "Välj som hero" för att göra en bild till huvudbild.
                      </p>
                      <div className="mb-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                        <strong>Debug - Bild URL:er:</strong>
                        {formData.gallery_images.map((url, index) => (
                          <div key={index} className="truncate">
                            {index + 1}: {url}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {formData.gallery_images.map((url, index) => (
                          <div 
                            key={index} 
                            className={`relative group cursor-move transition-all duration-200 ${
                              draggedImageIndex === index ? 'opacity-50 scale-95' : 'hover:scale-105'
                            }`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, index)}
                          >
                            <div className="h-32 w-full bg-white border-2 border-gray-200 rounded-md flex items-center justify-center relative overflow-hidden">
                              <img
                                src={url}
                                alt={`Gallery ${index + 1}`}
                                className="h-full w-full object-contain"
                                loading="lazy"
                                onError={(e) => {
                                  console.error('❌ Image failed to load:', url)
                                  const parent = e.currentTarget.parentElement
                                  if (parent && !parent.querySelector('.error-placeholder')) {
                                    e.currentTarget.style.display = 'none'
                                    const errorDiv = document.createElement('div')
                                    errorDiv.className = 'error-placeholder flex flex-col items-center justify-center h-full text-gray-400 p-2'
                                    errorDiv.innerHTML = `
                                      <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                      </svg>
                                      <span class="text-xs text-center">Kunde ej ladda</span>
                                    `
                                    parent.appendChild(errorDiv)
                                  }
                                }}
                                onLoad={(e) => {
                                  console.log('✅ Image loaded:', url)
                                  // Check if image has actual content
                                  const img = e.currentTarget
                                  if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                                    console.warn('⚠️ Image loaded but has no dimensions:', url)
                                  }
                                }}
                              />
                            </div>
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-md flex items-center justify-center">
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                                <button
                                  onClick={() => moveImageToHero(index)}
                                  className="bg-blue-600 text-white rounded-full p-1 hover:bg-blue-700"
                                  title="Välj som hero-bild"
                                >
                                  <Star className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => removeGalleryImage(index)}
                                  className="bg-red-600 text-white rounded-full p-1 hover:bg-red-700"
                                  title="Ta bort bild"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <div className="absolute top-1 left-1">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-800 text-white">
                                {index + 1}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Kontaktinformation</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Mail className="w-4 h-4 inline mr-1" />
                    E-post
                  </label>
                  <input
                    type="email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.contact_info.email}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      contact_info: { ...prev.contact_info, email: e.target.value }
                    }))}
                    placeholder="info@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Telefon
                  </label>
                  <input
                    type="tel"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.contact_info.phone}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      contact_info: { ...prev.contact_info, phone: e.target.value }
                    }))}
                    placeholder="0340-123 456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Globe className="w-4 h-4 inline mr-1" />
                    Webbplats
                  </label>
                  <input
                    type="url"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.contact_info.website}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      contact_info: { ...prev.contact_info, website: e.target.value }
                    }))}
                    placeholder="https://example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <MapPin className="w-4 h-4 inline mr-1" />
                    Adress
                  </label>
                  <textarea
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.contact_info.address}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      contact_info: { ...prev.contact_info, address: e.target.value }
                    }))}
                    placeholder="Storgatan 1, 432 40 Varberg"
                  />
                </div>
              </div>
            </div>

            {/* Social Media */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Sociala medier</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Facebook className="w-4 h-4 inline mr-1" />
                    Facebook
                  </label>
                  <input
                    type="url"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.social_links.facebook}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, facebook: e.target.value }
                    }))}
                    placeholder="https://facebook.com/example"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Instagram className="w-4 h-4 inline mr-1" />
                    Instagram
                  </label>
                  <input
                    type="url"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.social_links.instagram}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, instagram: e.target.value }
                    }))}
                    placeholder="https://instagram.com/example"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Twitter className="w-4 h-4 inline mr-1" />
                    Twitter
                  </label>
                  <input
                    type="url"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.social_links.twitter}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, twitter: e.target.value }
                    }))}
                    placeholder="https://twitter.com/example"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Linkedin className="w-4 h-4 inline mr-1" />
                    LinkedIn
                  </label>
                  <input
                    type="url"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.social_links.linkedin}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, linkedin: e.target.value }
                    }))}
                    placeholder="https://linkedin.com/company/example"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Youtube className="w-4 h-4 inline mr-1" />
                    YouTube
                  </label>
                  <input
                    type="url"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.social_links.youtube}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      social_links: { ...prev.social_links, youtube: e.target.value }
                    }))}
                    placeholder="https://youtube.com/c/example"
                  />
                </div>
              </div>
            </div>

            {/* SEO Settings */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">SEO-inställningar</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SEO-titel
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.seo_title}
                    onChange={(e) => setFormData(prev => ({ ...prev, seo_title: e.target.value }))}
                    placeholder="Lämna tom för att använda namn"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Fallback: {formData.name || 'Namn'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SEO-beskrivning
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.seo_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, seo_description: e.target.value }))}
                    placeholder="Lämna tom för att använda beskrivning"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Fallback: {formData.description || 'Beskrivning'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SEO-nyckelord
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={formData.seo_keywords}
                    onChange={(e) => setFormData(prev => ({ ...prev, seo_keywords: e.target.value }))}
                    placeholder="teater, kultur, varberg, evenemang"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Separera med komma
                  </p>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Status</h2>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_published"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  checked={formData.is_published}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_published: e.target.checked }))}
                />
                <label htmlFor="is_published" className="ml-2 block text-sm text-gray-700">
                  Publicerad
                </label>
              </div>
              
              <div className="mt-4 text-sm text-gray-500">
                <p>Skapad: {formatDate(page.created_at)}</p>
                <p>Uppdaterad: {formatDate(page.updated_at)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  )
}
