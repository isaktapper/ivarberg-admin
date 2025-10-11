'use client';

import { useState, useEffect } from 'react';
import ProtectedLayout from '@/components/ProtectedLayout';
import { Download, Calendar, TrendingUp, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

interface AuditLog {
  id: string;
  event_id: string;
  event_name: string;
  action: string;
  changed_by: string;
  old_status: string | null;
  new_status: string | null;
  quality_score: number | null;
  created_at: string;
  changes: any;
}

interface Statistics {
  total: number;
  autoPublished: number;
  manuallyApproved: number;
  rejected: number;
  avgQualityScore: number;
  byOrganizer: Record<number, number>;
  byCategory: Record<string, number>;
}

export default function StatisticsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchStatistics();
  }, [startDate, endDate, actionFilter]);

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (actionFilter !== 'all') params.append('action', actionFilter);

      const response = await fetch(`/api/admin/statistics?${params}`);
      const data = await response.json();
      
      if (data.error) {
        console.error('API error:', data.error);
        setLogs([]);
        setStats(null);
        return;
      }
      
      setLogs(data.logs || []);
      setStats(data.stats || null);
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/admin/statistics/export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `event-statistik-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export misslyckades');
    } finally {
      setExporting(false);
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'created': 'Skapad',
      'auto_published': 'Auto-publicerad',
      'approved': 'Godkänd',
      'rejected': 'Nekad',
      'edited': 'Redigerad'
    };
    return labels[action] || action;
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      'auto_published': 'bg-green-100 text-green-800',
      'approved': 'bg-blue-100 text-blue-800',
      'rejected': 'bg-red-100 text-red-800',
      'edited': 'bg-yellow-100 text-yellow-800',
      'created': 'bg-gray-100 text-gray-800'
    };
    return colors[action] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="p-4 space-y-4 max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Event-statistik</h1>
            <p className="text-gray-600 mt-1">Granskningshistorik och kvalitetsstatistik</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/events/review"
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              ← Tillbaka till granskning
            </Link>
            <button 
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-2" />
              {exporting ? 'Exporterar...' : 'Exportera till Excel'}
            </button>
          </div>
        </div>

        {/* Statistik-kort */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Totalt granskade</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
                </div>
                <Calendar className="w-6 h-6 text-gray-400" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Auto-publicerade</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{stats.autoPublished}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.total > 0 ? Math.round((stats.autoPublished / stats.total) * 100) : 0}% av totalt
                  </p>
                </div>
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Manuellt godkända</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{stats.manuallyApproved}</p>
                </div>
                <CheckCircle className="w-6 h-6 text-blue-400" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Genomsnittlig kvalitet</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.avgQualityScore}/100</p>
                </div>
                <TrendingUp className="w-6 h-6 text-gray-400" />
              </div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="bg-white rounded-lg shadow p-3">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filter</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Från datum
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Till datum
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Åtgärd
              </label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Alla</option>
                <option value="auto_published">Auto-publicerade</option>
                <option value="approved">Godkända</option>
                <option value="rejected">Nekade</option>
                <option value="edited">Redigerade</option>
              </select>
            </div>
          </div>
        </div>

        {/* Logg-tabell */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Granskningshistorik</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Datum
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Event
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Åtgärd
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statusändring
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kvalitet
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ändrad av
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs && logs.length > 0 && logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(log.created_at).toLocaleString('sv-SE', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      <div className="max-w-xs truncate">{log.event_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionColor(log.action)}`}>
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.old_status && log.new_status ? (
                        <span>{log.old_status} → {log.new_status}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.quality_score ? (
                        <span className={`font-medium ${
                          log.quality_score >= 80 ? 'text-green-600' :
                          log.quality_score >= 50 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {log.quality_score}/100
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.changed_by}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {logs.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <XCircle className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>Ingen data att visa</p>
                <p className="text-sm mt-1">Försök ändra filtren eller vänta på att events blir granskade</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}

