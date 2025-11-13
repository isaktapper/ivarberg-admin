'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedLayout from '@/components/ProtectedLayout'
import { AlertCircle, ExternalLink, Eye, Filter, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { Event } from '@/types/database'
import * as stringSimilarity from 'string-similarity'

interface DuplicateLog {
  id: number
  scraper_name: string
  scraped_event_name: string
  scraped_event_url: string
  existing_event_id: number
  existing_event_name: string
  existing_event_url: string
  similarity_score: number
  match_type: 'url' | 'fuzzy_name'
  scraped_at: string
}

interface PotentialDuplicate {
  event1: Event
  event2: Event
  similarity_score: number
  date_match: boolean
  venue_similarity: number
}

export default function DuplicatesPage() {
  const [activeTab, setActiveTab] = useState<'auto' | 'potential'>('auto')
  const [duplicates, setDuplicates] = useState<DuplicateLog[]>([])
  const [filteredDuplicates, setFilteredDuplicates] = useState<DuplicateLog[]>([])
  const [potentialDuplicates, setPotentialDuplicates] = useState<PotentialDuplicate[]>([])
  const [filteredPotentialDuplicates, setFilteredPotentialDuplicates] = useState<PotentialDuplicate[]>([])
  const [loading, setLoading] = useState(true)
  const [potentialLoading, setPotentialLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'fuzzy' | 'url'>('all')
  const [scraperFilter, setScraperFilter] = useState<string>('all')
  const [scrapers, setScrapers] = useState<string[]>([])
  const [minSimilarity, setMinSimilarity] = useState(65)

  useEffect(() => {
    loadDuplicates()
  }, [])

  useEffect(() => {
    if (activeTab === 'potential' && potentialDuplicates.length === 0) {
      loadPotentialDuplicates()
    }
  }, [activeTab])

  useEffect(() => {
    filterDuplicates()
  }, [filter, scraperFilter, duplicates])

  useEffect(() => {
    filterPotentialDuplicates()
  }, [minSimilarity, potentialDuplicates])

  async function loadDuplicates() {
    setLoading(true)
    
    const { data, error } = await supabase
      .from('duplicate_event_logs')
      .select('*')
      .order('scraped_at', { ascending: false })

    if (error) {
      console.error('Error loading duplicates:', error)
    } else {
      setDuplicates(data || [])
      
      // Extract unique scrapers
      const uniqueScrapers = Array.from(
        new Set(data?.map(d => d.scraper_name) || [])
      ).sort()
      setScrapers(uniqueScrapers)
    }

    setLoading(false)
  }

  function filterDuplicates() {
    let filtered = duplicates

    // Filter by match type
    if (filter !== 'all') {
      filtered = filtered.filter(d => 
        filter === 'fuzzy' ? d.match_type === 'fuzzy_name' : d.match_type === 'url'
      )
    }

    // Filter by scraper
    if (scraperFilter !== 'all') {
      filtered = filtered.filter(d => d.scraper_name === scraperFilter)
    }

    setFilteredDuplicates(filtered)
  }

  function filterPotentialDuplicates() {
    const filtered = potentialDuplicates.filter(
      d => d.similarity_score >= minSimilarity / 100
    )
    setFilteredPotentialDuplicates(filtered)
  }

  async function loadPotentialDuplicates() {
    setPotentialLoading(true)
    
    try {
      // Fetch all published events (we only care about duplicates in production)
      const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .order('date_time', { ascending: true })

      if (error) throw error

      const duplicatePairs: PotentialDuplicate[] = []
      const processedPairs = new Set<string>()

      // Compare events with each other
      for (let i = 0; i < (events || []).length; i++) {
        const event1 = events![i]
        const date1 = event1.date_time.split('T')[0]
        
        for (let j = i + 1; j < events!.length; j++) {
          const event2 = events![j]
          const date2 = event2.date_time.split('T')[0]
          
          // Only compare events on the same date
          if (date1 !== date2) continue
          
          // Check if we've already processed this pair
          const pairKey = [event1.id, event2.id].sort().join('-')
          if (processedPairs.has(pairKey)) continue
          
          // Calculate venue similarity
          const venueSimilarity = calculateVenueSimilarity(
            event1.venue_name || event1.location,
            event2.venue_name || event2.location
          )
          
          // Only consider if venues are similar
          if (venueSimilarity < 0.5) continue
          
          // Calculate name similarity
          const nameSimilarity = stringSimilarity.compareTwoStrings(
            normalizeEventName(event1.name),
            normalizeEventName(event2.name)
          )
          
          // Potential duplicates: 65-84% similarity (below auto-detection threshold of 85%)
          if (nameSimilarity >= 0.65 && nameSimilarity < 0.85) {
            duplicatePairs.push({
              event1,
              event2,
              similarity_score: nameSimilarity,
              date_match: date1 === date2,
              venue_similarity: venueSimilarity
            })
            processedPairs.add(pairKey)
          }
        }
      }

      // Sort by similarity score descending
      duplicatePairs.sort((a, b) => b.similarity_score - a.similarity_score)
      
      setPotentialDuplicates(duplicatePairs)
    } catch (error) {
      console.error('Error loading potential duplicates:', error)
    } finally {
      setPotentialLoading(false)
    }
  }

  function normalizeEventName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\wåäöÅÄÖ\s]/g, '') // Remove special chars, keep Swedish chars
      .replace(/\b(med|och|i|på|till|från|live|konsert|show|presenterar)\b/g, '') // Remove filler words
      .replace(/\s+/g, ' ')
      .trim()
  }

  function calculateVenueSimilarity(venue1: string, venue2: string): number {
    if (!venue1 || !venue2) return 0
    
    const keyword1 = extractVenueKeyword(venue1)
    const keyword2 = extractVenueKeyword(venue2)
    
    if (!keyword1 || !keyword2) return 0
    
    return stringSimilarity.compareTwoStrings(
      keyword1.toLowerCase(),
      keyword2.toLowerCase()
    )
  }

  function extractVenueKeyword(venue: string): string {
    // Extract first significant word
    const cleaned = venue.trim().split(/[,\-]/)[0].trim()
    return cleaned.split(/\s+/)[0] || cleaned
  }

  async function deleteEvent(eventId: number) {
    if (!confirm('Är du säker på att du vill radera detta event?')) return
    
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)

      if (error) throw error

      // Reload potential duplicates
      await loadPotentialDuplicates()
      alert('Event raderat!')
    } catch (error) {
      console.error('Error deleting event:', error)
      alert('Kunde inte radera eventet')
    }
  }

  function getSimilarityColor(score: number): string {
    if (score >= 0.95) return 'text-red-600 font-bold'
    if (score >= 0.90) return 'text-orange-600 font-semibold'
    return 'text-yellow-600'
  }

  function getSimilarityBadge(score: number): string {
    if (score >= 0.95) return 'bg-red-100 text-red-800'
    if (score >= 0.90) return 'bg-orange-100 text-orange-800'
    return 'bg-yellow-100 text-yellow-800'
  }

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold">Dubbletthantering</h1>
          <p className="text-sm text-gray-600">
            Hantera automatiskt detekterade och potentiella dublettevents
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-4 border-b border-gray-200">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('auto')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'auto'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              Automatiskt detekterade ({duplicates.length})
            </button>
            <button
              onClick={() => setActiveTab('potential')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'potential'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              Potentiella dubletter ({potentialDuplicates.length})
            </button>
          </div>
        </div>

        {/* Filters - Auto Tab */}
        {activeTab === 'auto' && (
          <div className="mb-4 bg-white rounded-lg shadow p-3">
            <div className="grid md:grid-cols-2 gap-3">
              {/* Match Type Filter */}
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    filter === 'all' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Alla ({duplicates.length})
                </button>
                <button
                  onClick={() => setFilter('fuzzy')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    filter === 'fuzzy' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Fuzzy ({duplicates.filter(d => d.match_type === 'fuzzy_name').length})
                </button>
                <button
                  onClick={() => setFilter('url')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    filter === 'url' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  URL ({duplicates.filter(d => d.match_type === 'url').length})
                </button>
              </div>

              {/* Scraper Filter */}
              <select
                value={scraperFilter}
                onChange={(e) => setScraperFilter(e.target.value)}
                className="px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Alla scrapers</option>
                {scrapers.map(scraper => (
                  <option key={scraper} value={scraper}>{scraper}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Filters - Potential Tab */}
        {activeTab === 'potential' && (
          <div className="mb-4 bg-white rounded-lg shadow p-3">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">
                Min likhet:
              </label>
              <input
                type="range"
                min="50"
                max="84"
                value={minSimilarity}
                onChange={(e) => setMinSimilarity(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm font-bold text-gray-900 min-w-[60px]">
                {minSimilarity}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Visar events med likhet mellan {minSimilarity}% och 84% (under automatisk tröskelvärde på 85%)
            </p>
          </div>
        )}

        {/* Loading */}
        {activeTab === 'auto' && loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        )}

        {activeTab === 'potential' && potentialLoading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-sm text-gray-600 mt-2">Analyserar events...</p>
          </div>
        )}

        {/* Empty State - Auto */}
        {activeTab === 'auto' && !loading && filteredDuplicates.length === 0 && (
          <div className="text-center py-8 bg-white rounded-lg shadow">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">
              Inga dubbletter 🎉
            </h3>
            <p className="text-sm text-gray-600">
              {filter !== 'all' || scraperFilter !== 'all' 
                ? 'Ändra filtren för att se fler.' 
                : 'Inga dubbletter detekterade.'}
            </p>
          </div>
        )}

        {/* Empty State - Potential */}
        {activeTab === 'potential' && !potentialLoading && filteredPotentialDuplicates.length === 0 && (
          <div className="text-center py-8 bg-white rounded-lg shadow">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">
              Inga potentiella dubletter 🎉
            </h3>
            <p className="text-sm text-gray-600">
              Inga events med likhet mellan {minSimilarity}% och 84% hittades.
            </p>
          </div>
        )}

        {/* Auto Duplicate List - Kompakt */}
        {activeTab === 'auto' && !loading && filteredDuplicates.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-gray-600 mb-2">
              Visar {filteredDuplicates.length} av {duplicates.length} automatiskt detekterade dubletter
            </div>

            {filteredDuplicates.map((dup) => (
              <div key={dup.id} className="border rounded p-3 bg-white shadow-sm hover:shadow transition-shadow">
                {/* Header - Kompakt */}
                <div className="flex justify-between items-center mb-2">
                  <div className="flex gap-1.5">
                    <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                      {dup.scraper_name}
                    </span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      dup.match_type === 'url' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {dup.match_type === 'url' ? 'URL' : 'Fuzzy'}
                    </span>
                  </div>
                  <div className={`text-xl font-bold ${getSimilarityColor(dup.similarity_score)}`}>
                    {(dup.similarity_score * 100).toFixed(0)}%
                  </div>
                </div>

                {/* Content - Kompakt */}
                <div className="grid md:grid-cols-2 gap-3">
                  {/* Scraped Event (Skipped) - Kompakt */}
                  <div className="border-l-2 border-red-500 pl-2 bg-red-50 p-2 rounded">
                    <div className="text-xs font-medium text-red-700 mb-1">
                      ❌ Skippat
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {dup.scraped_event_name}
                    </p>
                    {dup.scraped_event_url && (
                      <a
                        href={dup.scraped_event_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 mt-1"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        <span className="truncate">Källa</span>
                      </a>
                    )}
                  </div>

                  {/* Existing Event (Kept) - Kompakt */}
                  <div className="border-l-2 border-green-500 pl-2 bg-green-50 p-2 rounded">
                    <div className="text-xs font-medium text-green-700 mb-1">
                      ✅ Behållet
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {dup.existing_event_name}
                    </p>
                    <div className="flex gap-2 text-xs mt-1">
                      {dup.existing_event_url && (
                        <a
                          href={dup.existing_event_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Original
                        </a>
                      )}
                      <Link
                        href={`/events/${dup.existing_event_id}`}
                        className="text-blue-600 hover:underline flex items-center gap-0.5"
                      >
                        <Eye className="w-2.5 h-2.5" />
                        Admin
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Footer - Kompakt */}
                <div className="mt-2 pt-2 border-t text-xs text-gray-500">
                  {new Date(dup.scraped_at).toLocaleDateString('sv-SE', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Potential Duplicate List */}
        {activeTab === 'potential' && !potentialLoading && filteredPotentialDuplicates.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-gray-600 mb-2">
              Visar {filteredPotentialDuplicates.length} av {potentialDuplicates.length} potentiella dubletter
            </div>

            {filteredPotentialDuplicates.map((dup, idx) => (
              <div key={`${dup.event1.id}-${dup.event2.id}`} className="border rounded p-3 bg-white shadow-sm hover:shadow transition-shadow">
                {/* Header - Kompakt */}
                <div className="flex justify-between items-center mb-2">
                  <div className="flex gap-1.5">
                    <span className="inline-block px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-xs font-medium">
                      Potentiell dublett
                    </span>
                    <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                      Samma datum
                    </span>
                  </div>
                  <div className={`text-xl font-bold ${getSimilarityColor(dup.similarity_score)}`}>
                    {(dup.similarity_score * 100).toFixed(0)}%
                  </div>
                </div>

                {/* Content - Kompakt */}
                <div className="grid md:grid-cols-2 gap-3">
                  {/* Event 1 */}
                  <div className="border-l-2 border-orange-500 pl-2 bg-orange-50 p-2 rounded">
                    <div className="text-xs font-medium text-orange-700 mb-1 flex justify-between items-center">
                      <span>Event 1</span>
                      <button
                        onClick={() => deleteEvent(dup.event1.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Radera detta event"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      {dup.event1.name}
                    </p>
                    <p className="text-xs text-gray-600 mb-1">
                      📍 {dup.event1.venue_name || dup.event1.location}
                    </p>
                    <p className="text-xs text-gray-600 mb-1">
                      📅 {new Date(dup.event1.date_time).toLocaleDateString('sv-SE', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    <div className="flex gap-2 text-xs mt-1">
                      {dup.event1.organizer_event_url && (
                        <a
                          href={dup.event1.organizer_event_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-0.5"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          Källa
                        </a>
                      )}
                      <Link
                        href={`/events/${dup.event1.id}`}
                        className="text-blue-600 hover:underline flex items-center gap-0.5"
                      >
                        <Eye className="w-2.5 h-2.5" />
                        Admin
                      </Link>
                    </div>
                  </div>

                  {/* Event 2 */}
                  <div className="border-l-2 border-orange-500 pl-2 bg-orange-50 p-2 rounded">
                    <div className="text-xs font-medium text-orange-700 mb-1 flex justify-between items-center">
                      <span>Event 2</span>
                      <button
                        onClick={() => deleteEvent(dup.event2.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Radera detta event"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      {dup.event2.name}
                    </p>
                    <p className="text-xs text-gray-600 mb-1">
                      📍 {dup.event2.venue_name || dup.event2.location}
                    </p>
                    <p className="text-xs text-gray-600 mb-1">
                      📅 {new Date(dup.event2.date_time).toLocaleDateString('sv-SE', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    <div className="flex gap-2 text-xs mt-1">
                      {dup.event2.organizer_event_url && (
                        <a
                          href={dup.event2.organizer_event_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-0.5"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          Källa
                        </a>
                      )}
                      <Link
                        href={`/events/${dup.event2.id}`}
                        className="text-blue-600 hover:underline flex items-center gap-0.5"
                      >
                        <Eye className="w-2.5 h-2.5" />
                        Admin
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Footer - Kompakt */}
                <div className="mt-2 pt-2 border-t text-xs text-gray-500">
                  Venue-likhet: {(dup.venue_similarity * 100).toFixed(0)}% | Namn-likhet: {(dup.similarity_score * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedLayout>
  )
}


