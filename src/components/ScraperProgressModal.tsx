'use client'

import { useEffect, useState } from 'react'
import { ScraperProgressLog, ProgressStep } from '@/types/database'
import { X, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'

interface ScraperProgressModalProps {
  logId: number
  scraperName: string
  onClose: () => void
}

interface ProgressData {
  scraperLog: {
    id: number
    scraper_name: string
    status: string
    started_at: string
    completed_at?: string
    duration_ms?: number
  }
  progressLogs: ScraperProgressLog[]
  totalProgress: {
    current: number
    total: number
    percentage: number
  } | null
  isRunning: boolean
  estimatedTimeRemaining: number | null
}

const stepLabels: Record<ProgressStep, string> = {
  starting: 'Startar',
  scraping: 'Scrapar',
  deduplicating: 'Rensar dubletter',
  categorizing: 'Kategoriserar',
  matching_organizers: 'Matchar arrangörer',
  importing: 'Sparar',
  completed: 'Klar',
  failed: 'Misslyckades',
}

const stepIcons: Record<ProgressStep, React.ReactNode> = {
  starting: <Loader2 className="w-4 h-4 animate-spin" />,
  scraping: <Loader2 className="w-4 h-4 animate-spin" />,
  deduplicating: <Loader2 className="w-4 h-4 animate-spin" />,
  categorizing: <Loader2 className="w-4 h-4 animate-spin" />,
  matching_organizers: <Loader2 className="w-4 h-4 animate-spin" />,
  importing: <Loader2 className="w-4 h-4 animate-spin" />,
  completed: <CheckCircle className="w-4 h-4 text-green-600" />,
  failed: <XCircle className="w-4 h-4 text-red-600" />,
}

export default function ScraperProgressModal({
  logId,
  scraperName,
  onClose,
}: ScraperProgressModalProps) {
  const [data, setData] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProgress()

    // Poll varje sekund om scraper fortfarande kör
    const interval = setInterval(() => {
      if (data?.isRunning) {
        fetchProgress()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [logId, data?.isRunning])

  const fetchProgress = async () => {
    try {
      const response = await fetch(`/api/scrape/${logId}/progress`)

      if (!response.ok) {
        throw new Error('Failed to fetch progress')
      }

      const progressData = await response.json()
      setData(progressData)
      setLoading(false)

      // Sluta polla när scraper är klar
      if (!progressData.isRunning) {
        setError(null)
      }
    } catch (err) {
      console.error('Error fetching progress:', err)
      setError('Kunde inte hämta progress')
      setLoading(false)
    }
  }

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  const formatTime = (dateStr: string): string => {
    return new Date(dateStr).toLocaleTimeString('sv-SE')
  }

  const formatEstimatedTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)

    if (minutes > 0) {
      return `~${minutes}m ${seconds % 60}s kvar`
    } else {
      return `~${seconds}s kvar`
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
          <div className="flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-lg">Laddar progress...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-red-600">Fel</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-gray-700">{error}</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Stäng
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const currentLog = data.progressLogs[data.progressLogs.length - 1]
  const isCompleted = data.scraperLog.status !== 'running'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{scraperName}</h2>
              <p className="text-sm text-gray-500 mt-1">
                Startad: {formatTime(data.scraperLog.started_at)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Status badge */}
          <div className="mt-4">
            {data.isRunning ? (
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span className="text-sm font-medium">Pågår...</span>
              </div>
            ) : data.scraperLog.status === 'success' ? (
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800">
                <CheckCircle className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">Klar</span>
              </div>
            ) : (
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-red-100 text-red-800">
                <XCircle className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">Misslyckades</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {data.totalProgress && (
          <div className="px-6 pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700 font-medium">
                  {currentLog?.message || 'Bearbetar...'}
                </span>
                <span className="text-gray-500">
                  {data.totalProgress.percentage}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${data.totalProgress.percentage}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>
                  {data.totalProgress.current} / {data.totalProgress.total}
                </span>
                {data.estimatedTimeRemaining && data.isRunning && (
                  <span className="flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatEstimatedTime(data.estimatedTimeRemaining)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Progress logs */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {data.progressLogs.map((log, index) => (
              <div
                key={log.id}
                className={`flex items-start space-x-3 p-3 rounded-lg transition-all ${
                  index === data.progressLogs.length - 1 && data.isRunning
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-gray-50'
                }`}
              >
                <div className="mt-0.5">{stepIcons[log.step]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">
                      {stepLabels[log.step]}
                    </p>
                    <span className="text-xs text-gray-500">
                      {formatTime(log.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{log.message}</p>

                  {log.progress_total && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">
                        {log.progress_current} / {log.progress_total}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1">
                        <div
                          className="bg-blue-500 h-1 rounded-full transition-all"
                          style={{
                            width: `${
                              ((log.progress_current || 0) /
                                log.progress_total) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      {JSON.stringify(log.metadata)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        {isCompleted && data.scraperLog.duration_ms && (
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Total tid:</span>
              <span className="font-medium text-gray-900">
                {formatDuration(data.scraperLog.duration_ms)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
