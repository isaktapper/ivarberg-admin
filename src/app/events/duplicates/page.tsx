'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedLayout from '@/components/ProtectedLayout'
import { AlertCircle, ExternalLink, Eye, Filter } from 'lucide-react'
import Link from 'next/link'

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

export default function DuplicatesPage() {
  const [duplicates, setDuplicates] = useState<DuplicateLog[]>([])
  const [filteredDuplicates, setFilteredDuplicates] = useState<DuplicateLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'fuzzy' | 'url'>('all')
  const [scraperFilter, setScraperFilter] = useState<string>('all')
  const [scrapers, setScrapers] = useState<string[]>([])

  useEffect(() => {
    loadDuplicates()
  }, [])

  useEffect(() => {
    filterDuplicates()
  }, [filter, scraperFilter, duplicates])

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
          <h1 className="text-xl font-bold">Duplicate Detection Logs</h1>
          <p className="text-sm text-gray-600">
            Events som skipades under scraping pga dubblettdetektering. Review för att verifiera att rätt events behållits.
          </p>
        </div>

        {/* Filters */}
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

        {/* Loading */}
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredDuplicates.length === 0 && (
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

        {/* Duplicate List - Kompakt */}
        {!loading && filteredDuplicates.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-gray-600 mb-2">
              Visar {filteredDuplicates.length} av {duplicates.length} duplicates
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
      </div>
    </ProtectedLayout>
  )
}

