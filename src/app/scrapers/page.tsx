'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ScraperLog, ScraperSchedule } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import { useAuth } from '@/contexts/AuthContext'
import ScraperProgressModal from '@/components/ScraperProgressModal'
import {
  Play,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Calendar,
  TrendingUp,
  Download,
  ExternalLink,
  Eye,
  Square,
  ChevronDown,
  ChevronUp,
  Github,
  User
} from 'lucide-react'

interface ScraperInfo {
  name: string
  url: string
  enabled: boolean
  organizerId: number
}

export default function ScrapersPage() {
  const { user } = useAuth()
  const [scrapers, setScrapers] = useState<ScraperInfo[]>([])
  const [schedules, setSchedules] = useState<ScraperSchedule[]>([])
  const [logs, setLogs] = useState<ScraperLog[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [selectedScraper, setSelectedScraper] = useState<string>('all')
  const [selectedScrapers, setSelectedScrapers] = useState<Set<string>>(new Set())
  const [showScraperSelection, setShowScraperSelection] = useState(false)
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null)
  const [selectedLogName, setSelectedLogName] = useState<string>('')
  const [cancelling, setCancelling] = useState(false)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [confirmationText, setConfirmationText] = useState('')
  const [historyCollapsed, setHistoryCollapsed] = useState(true)

  const checkRunningProcesses = async () => {
    try {
      const response = await fetch('/api/scrape/cancel')
      const data = await response.json()
      if (data.runningCount > 0) {
        setRunning(true)
      } else {
        setRunning(false)
      }
    } catch (error) {
      console.error('Error checking running processes:', error)
    }
  }

  useEffect(() => {
    fetchData()
    checkRunningProcesses()
    
    // Realtime subscription för logs
    const subscription = supabase
      .channel('scraper-logs-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'scraper_logs' },
        () => {
          fetchLogs()
          checkRunningProcesses()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])


  useEffect(() => {
    fetchLogs()
  }, [selectedScraper])

  useEffect(() => {
    // Stäng dropdown när man klickar utanför
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (showScraperSelection && !target.closest('.scraper-selection-dropdown')) {
        setShowScraperSelection(false)
      }
    }

    if (showScraperSelection) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showScraperSelection])

  const fetchData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchScrapers(),
        fetchSchedules(),
        fetchLogs()
      ])
    } finally {
      setLoading(false)
    }
  }

  const fetchScrapers = async () => {
    try {
      const response = await fetch('/api/scrape')
      const data = await response.json()
      setScrapers(data.scrapers || [])
    } catch (error) {
      console.error('Error fetching scrapers:', error)
    }
  }

  const fetchSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('scraper_schedules')
        .select('*')
        .order('scraper_name')

      if (error) throw error
      setSchedules(data || [])
    } catch (error) {
      console.error('Error fetching schedules:', error)
    }
  }

  const fetchLogs = async () => {
    try {
      let query = supabase
        .from('scraper_logs')
        .select(`
          *,
          organizer:organizers(name)
        `)
        .order('started_at', { ascending: false })
        .limit(50)

      if (selectedScraper !== 'all') {
        query = query.eq('scraper_name', selectedScraper)
      }

      const { data, error } = await query

      if (error) throw error
      setLogs(data || [])
      
      // Kontrollera om det finns pågående scrapers i databasen
      const hasRunningScrapers = (data || []).some(log => log.status === 'running')
      setRunning(hasRunningScrapers)
    } catch (error) {
      console.error('Error fetching logs:', error)
    }
  }

  const toggleScraperSelection = (scraperName: string) => {
    setSelectedScrapers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(scraperName)) {
        newSet.delete(scraperName)
      } else {
        newSet.add(scraperName)
      }
      return newSet
    })
  }

  const toggleAllScrapers = () => {
    if (selectedScrapers.size === scrapers.length) {
      setSelectedScrapers(new Set())
    } else {
      setSelectedScrapers(new Set(scrapers.map(s => s.name)))
    }
  }

  const openConfirmationModal = () => {
    setShowScraperSelection(false)
    setShowConfirmationModal(true)
    setConfirmationText('')
  }

  const runScraper = async () => {
    const scrapersToRun = selectedScrapers.size > 0 
      ? Array.from(selectedScrapers)
      : scrapers.map(s => s.name)

    setRunning(true)
    setShowConfirmationModal(false)
    setConfirmationText('')
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userEmail: user?.email,
          scraperNames: scrapersToRun
        })
      })

      const result = await response.json()
      
      if (response.ok) {
        alert(`Scraping klar!\n\nHittade: ${result.totalFound}\nImporterade: ${result.totalImported}\nDubbletter: ${result.totalDuplicates}`)
        await fetchData()
      } else {
        throw new Error(result.error || 'Unknown error')
      }
    } catch (error) {
      console.error('Error running scraper:', error)
      alert('Fel vid scraping: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setRunning(false)
      setSelectedScrapers(new Set())
    }
  }

  const cancelRunningProcesses = async () => {
    if (!running) {
      alert('Inga pågående scraping processer att avbryta')
      return
    }

    if (!confirm('Är du säker på att du vill avbryta den pågående scraping processen?')) {
      return
    }

    setCancelling(true)
    
    try {
      const response = await fetch('/api/scrape/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()
      
      if (response.ok) {
        alert(`Avbröt ${result.cancelledCount} scraping process(er)`)
        await fetchData() // Refresh all data
        await checkRunningProcesses() // Uppdatera running state
      } else {
        const errorDetails = result.details ? `\n\nDetaljer: ${result.details}` : ''
        const errorHint = result.hint ? `\n\nTips: ${result.hint}` : ''
        throw new Error(`${result.error || 'Unknown error'}${errorDetails}${errorHint}`)
      }
    } catch (error) {
      console.error('Error cancelling processes:', error)
      alert('Fel vid avbrytning: ' + (error instanceof Error ? error.message : 'Unknown error'))
      // Kontrollera igen om det fortfarande finns pågående processer
      await checkRunningProcesses()
    } finally {
      setCancelling(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'partial':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />
      case 'cancelled':
        return <Square className="w-4 h-4 text-gray-600" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'success':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'partial':
        return 'bg-yellow-100 text-yellow-800'
      case 'cancelled':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return '-'
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTimeUntilNext = (nextRun?: string) => {
    if (!nextRun) return null
    const now = new Date()
    const next = new Date(nextRun)
    const diff = next.getTime() - now.getTime()
    
    if (diff < 0) return 'Försenad'
    
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `${days} dag${days > 1 ? 'ar' : ''}`
    }
    
    return `${hours}h ${minutes}m`
  }

  const getSourceBadge = (triggeredBy?: string) => {
    if (triggeredBy?.includes('github')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-900 text-white">
          <Github className="w-3 h-3 mr-1" />
          GitHub Actions
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        <User className="w-3 h-3 mr-1" />
        Manuell
      </span>
    )
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

  return (
    <ProtectedLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scrapers</h1>
            <p className="mt-1 text-sm text-gray-500">
              Hantera och övervaka event-scrapers
            </p>
          </div>
          <div className="flex gap-3">
            {/* Cancel button */}
            {running && (
              <button
                onClick={cancelRunningProcesses}
                disabled={cancelling}
                className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md shadow-sm text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
              >
                {cancelling ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Avbryter...
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    Avbryt pågående
                  </>
                )}
              </button>
            )}
            
            {/* Run button */}
            <div className="relative">
              <button
                onClick={() => setShowScraperSelection(!showScraperSelection)}
                disabled={running}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {running ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Kör scraping...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Kör scraping nu
                    {selectedScrapers.size > 0 && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-800">
                        {selectedScrapers.size}
                      </span>
                    )}
                  </>
                )}
              </button>

              {/* Dropdown för scraper-val */}
              {showScraperSelection && !running && (
                <div className="scraper-selection-dropdown absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-10">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">Välj scrapers</h3>
                      <button
                        onClick={toggleAllScrapers}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {selectedScrapers.size === scrapers.length ? 'Avmarkera alla' : 'Markera alla'}
                      </button>
                    </div>
                    
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {scrapers.map((scraper) => (
                        <label
                          key={scraper.name}
                          className="flex items-start p-2 hover:bg-gray-50 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedScrapers.has(scraper.name)}
                            onChange={() => toggleScraperSelection(scraper.name)}
                            className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <div className="ml-3 flex-1">
                            <div className="text-sm font-medium text-gray-900">{scraper.name}</div>
                            <div className="text-xs text-gray-500 truncate">{scraper.url}</div>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-200 flex gap-2">
                      <button
                        onClick={() => setShowScraperSelection(false)}
                        className="flex-1 px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Avbryt
                      </button>
                      <button
                        onClick={openConfirmationModal}
                        className="flex-1 px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                      >
                        Kör {selectedScrapers.size > 0 ? `(${selectedScrapers.size})` : 'alla'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrapers Overview Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Scraper
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Senaste körning
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Källa
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resultat
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nästa körning
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {scrapers.map((scraper) => {
                  const schedule = schedules.find(s => s.scraper_name === scraper.name)
                  const lastLog = logs.find(l => l.scraper_name === scraper.name)
                  const timeUntil = getTimeUntilNext(schedule?.next_run_at)

                  return (
                    <tr key={scraper.name} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <div className="text-sm font-medium text-gray-900">
                            {scraper.name}
                          </div>
                          <a
                            href={scraper.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center mt-1"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            {new URL(scraper.url).hostname}
                          </a>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {lastLog ? (
                            <>
                              {getStatusIcon(lastLog.status)}
                              <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(lastLog.status)}`}>
                                {lastLog.status}
                              </span>
                            </>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Aldrig körd
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {lastLog ? (
                          <div className="text-sm text-gray-900">
                            <div className="font-medium">{formatDateTime(lastLog.started_at)}</div>
                            <div className="text-xs text-gray-500">
                              {formatDuration(lastLog.duration_ms)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {lastLog ? getSourceBadge(lastLog.triggered_by) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {lastLog ? (
                          <div className="text-sm">
                            <div className="flex items-center space-x-3 text-xs">
                              <span className="text-green-600 font-medium">
                                +{lastLog.events_imported}
                              </span>
                              <span className="text-gray-500">
                                {lastLog.events_found} funna
                              </span>
                              {lastLog.duplicates_skipped > 0 && (
                                <span className="text-yellow-600">
                                  {lastLog.duplicates_skipped} dupl.
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {schedule && schedule.enabled ? (
                          <div className="text-sm">
                            <div className="flex items-center text-gray-900 font-medium">
                              <Clock className="w-4 h-4 mr-1.5 text-blue-500" />
                              {timeUntil || formatDateTime(schedule.next_run_at)}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5 ml-5">
                              {formatDateTime(schedule.next_run_at)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Inte schemalagd</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Totalt hittade</p>
                <p className="text-xl font-semibold text-gray-900">
                  {logs.reduce((sum, log) => sum + log.events_found, 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Totalt importerade</p>
                <p className="text-xl font-semibold text-gray-900">
                  {logs.reduce((sum, log) => sum + log.events_imported, 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Download className="h-6 w-6 text-gray-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Dubbletter</p>
                <p className="text-xl font-semibold text-gray-900">
                  {logs.reduce((sum, log) => sum + log.duplicates_skipped, 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Totalt körningar</p>
                <p className="text-xl font-semibold text-gray-900">
                  {logs.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Logs */}
        <div className="bg-white shadow rounded-lg">
          <button
            onClick={() => setHistoryCollapsed(!historyCollapsed)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-medium text-gray-900">Fullständig körningshistorik</h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {logs.length} körningar
              </span>
            </div>
            {historyCollapsed ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {!historyCollapsed && (
            <>
              <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
                <select
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
                  value={selectedScraper}
                  onChange={(e) => setSelectedScraper(e.target.value)}
                >
                  <option value="all">Alla scrapers</option>
                  {scrapers.map((scraper) => (
                    <option key={scraper.name} value={scraper.name}>
                      {scraper.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Scraper
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Starttid
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tid
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resultat
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Triggad av
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Detaljer
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                      Ingen körningshistorik än. Kör din första scraping!
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getStatusIcon(log.status)}
                          <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(log.status)}`}>
                            {log.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {log.scraper_name}
                        </div>
                        {log.organizer && (
                          <div className="text-xs text-gray-500">
                            {log.organizer.name}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDateTime(log.started_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDuration(log.duration_ms)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          <div className="flex items-center space-x-3 text-xs">
                            <span className="text-green-600 font-medium">
                              +{log.events_imported}
                            </span>
                            <span className="text-gray-500">
                              {log.events_found} funna
                            </span>
                            {log.duplicates_skipped > 0 && (
                              <span className="text-yellow-600">
                                {log.duplicates_skipped} dupl.
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs text-gray-900">
                          {log.triggered_by || 'manual'}
                        </div>
                        {log.trigger_user_email && (
                          <div className="text-xs text-gray-500">
                            {log.trigger_user_email}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          {/* View progress button */}
                          <button
                            onClick={() => {
                              setSelectedLogId(log.id)
                              setSelectedLogName(log.scraper_name)
                            }}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
                            title="Visa progress"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Progress
                          </button>

                          {/* Errors */}
                          {log.errors && log.errors.length > 0 && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-red-600 hover:text-red-800">
                                {log.errors.length} fel
                              </summary>
                              <div className="mt-2 space-y-1 max-w-xs">
                                {log.errors.slice(0, 3).map((error, idx) => (
                                  <p key={idx} className="text-gray-600 truncate">
                                    • {error}
                                  </p>
                                ))}
                                {log.errors.length > 3 && (
                                  <p className="text-gray-500 italic">
                                    ...och {log.errors.length - 3} fler
                                  </p>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmationModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-semibold text-gray-900">
                  Varning: Manuell scraping
                </h3>
                <div className="mt-2 text-sm text-gray-600 space-y-2">
                  <p className="font-medium text-red-600">
                    Att köra scrapers manuellt kan orsaka problem!
                  </p>
                  <p>
                    • Scrapers körs automatiskt varje dag kl 06:00
                  </p>
                  <p>
                    • Manuell körning kan skapa dubbletter och konflikter
                  </p>
                  <p>
                    • Kör endast om du vet vad du gör
                  </p>
                  <p className="mt-3 font-medium">
                    Valda scrapers: {selectedScrapers.size > 0 
                      ? Array.from(selectedScrapers).join(', ')
                      : 'Alla scrapers'
                    }
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Skriv <span className="font-bold text-red-600">"kör"</span> för att bekräfta:
              </label>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder="Skriv: kör"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                autoFocus
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmationModal(false)
                  setConfirmationText('')
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Avbryt
              </button>
              <button
                onClick={runScraper}
                disabled={confirmationText.toLowerCase() !== 'kör'}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md text-white ${
                  confirmationText.toLowerCase() === 'kör'
                    ? 'bg-red-600 hover:bg-red-700 cursor-pointer'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                Kör scraping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Modal */}
      {selectedLogId && (
        <ScraperProgressModal
          logId={selectedLogId}
          scraperName={selectedLogName}
          onClose={() => {
            setSelectedLogId(null)
            setSelectedLogName('')
          }}
        />
      )}
    </ProtectedLayout>
  )
}
