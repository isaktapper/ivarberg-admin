'use client'

import { useEffect, useState } from 'react'
import { EventTip, EventTipStatus } from '@/types/database'
import ProtectedLayout from '@/components/ProtectedLayout'
import { Search, Eye, X, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export default function AdminTipsPage() {
  const [tips, setTips] = useState<EventTip[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<EventTipStatus | 'all'>('pending')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const limit = 20

  useEffect(() => {
    fetchTips()
  }, [page, statusFilter])

  const fetchTips = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        status: statusFilter === 'all' ? '' : statusFilter
      })

      const response = await fetch(`/api/admin/tips?${params}`)
      const data = await response.json()

      if (data.error) throw new Error(data.error)

      setTips(data.tips || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 0)
    } catch (error) {
      console.error('Error fetching tips:', error)
      alert('Fel vid hämtning av tips')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: EventTipStatus) => {
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

  const getStatusText = (status: EventTipStatus) => {
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

  const filteredTips = tips.filter(tip =>
    tip.event_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tip.event_location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tip.submitter_email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Event Tips</h1>
            <p className="text-gray-600 mt-1">
              Hantera inkomna event tips från besökare
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Sök event tips..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="md:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as EventTipStatus | 'all')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Alla statusar</option>
                <option value="pending">Väntar ({tips.filter(t => t.status === 'pending').length})</option>
                <option value="reviewed">Granskad</option>
                <option value="approved">Godkänd</option>
                <option value="rejected">Avböjd</option>
                <option value="converted">Konverterad</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tips List */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : filteredTips.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <div className="text-gray-500 text-lg">
                {tips.length === 0 ? 'Inga event tips ännu' : 'Inga tips matchar sökningen'}
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Event
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Datum
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plats
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Inlämnare
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Åtgärder
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredTips.map((tip) => (
                      <tr key={tip.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{tip.event_name}</div>
                          {tip.categories && tip.categories.length > 0 && (
                            <div className="text-sm text-gray-500 mt-1">
                              {tip.categories.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900">
                            {tip.date_time ? formatDate(tip.date_time) : tip.event_date || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900">{tip.event_location || '-'}</div>
                          {tip.venue_name && (
                            <div className="text-sm text-gray-500">{tip.venue_name}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900">{tip.submitter_email}</div>
                          {tip.submitter_name && (
                            <div className="text-sm text-gray-500">{tip.submitter_name}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(tip.status)}`}>
                            {getStatusText(tip.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Link
                            href={`/admin/tips/${tip.id}`}
                            className="inline-flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Visa
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
                  <div className="text-sm text-gray-700">
                    Visar {((page - 1) * limit) + 1} till {Math.min(page * limit, total)} av {total} tips
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Föregående
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Nästa
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedLayout>
  )
}
