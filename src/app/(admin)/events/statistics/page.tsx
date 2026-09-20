'use client';

import { useState, useEffect } from 'react';
import ProtectedLayout from '@/components/ProtectedLayout';
import { 
  Download, 
  Calendar, 
  TrendingUp, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  BarChart3,
  PieChart,
  Activity,
  Database,
  RefreshCw,
  Clock,
  Users,
  FileWarning,
  Image as ImageIcon,
  FileText
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

interface ScraperStat {
  name: string;
  total: number;
  success: number;
  failed: number;
  partial: number;
  cancelled: number;
  successRate: number;
  totalEventsFound: number;
  totalEventsImported: number;
  totalDuplicates: number;
  avgDuration: number;
  lastRun: string | null;
  lastStatus: string | null;
}

interface DashboardData {
  scrapers: {
    stats: ScraperStat[];
    trend: { date: string; imported: number; found: number; duplicates: number }[];
    topErrors: { error: string; count: number }[];
    summary: {
      totalRuns: number;
      totalFound: number;
      totalImported: number;
      totalDuplicates: number;
      overallSuccessRate: number;
    };
  };
  events: {
    stats: {
      total: number;
      published: number;
      pending: number;
      draft: number;
      cancelled: number;
      active: number;
      passed: number;
      addedLast24h: number;
      addedLast7d: number;
    };
    categories: { name: string; count: number }[];
    sources: { name: string; count: number }[];
    weeklyForecast: { week: string; count: number }[];
    trend: { date: string; added: number }[];
  };
  quality: {
    noCategory: number;
    noImage: number;
    noDescription: number;
    lowQuality: number;
    avgQualityScore: number;
  };
  generatedAt: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function StatisticsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'scrapers' | 'events' | 'quality'>('overview');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/dashboard-stats');
      const result = await response.json();
      
      if (result.error) {
        console.error('API error:', result.error);
        return;
      }
      
      setData(result);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
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

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('sv-SE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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

  if (!data) {
    return (
      <ProtectedLayout>
        <div className="text-center py-12 text-gray-500">
          <XCircle className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p>Kunde inte ladda statistik</p>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Statistik Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Senast uppdaterad: {formatDate(data.generatedAt)}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={fetchDashboardData}
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Uppdatera
            </button>
            <button 
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-2" />
              {exporting ? 'Exporterar...' : 'Exportera'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', label: 'Översikt', icon: BarChart3 },
              { id: 'scrapers', label: 'Scrapers', icon: Download },
              { id: 'events', label: 'Events', icon: Calendar },
              { id: 'quality', label: 'Datakvalitet', icon: FileWarning },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <OverviewTab data={data} formatDuration={formatDuration} />
        )}
        
        {activeTab === 'scrapers' && (
          <ScrapersTab 
            data={data} 
            formatDuration={formatDuration} 
            formatDate={formatDate}
            getStatusColor={getStatusColor}
          />
        )}
        
        {activeTab === 'events' && (
          <EventsTab data={data} />
        )}
        
        {activeTab === 'quality' && (
          <QualityTab data={data} />
        )}
      </div>
    </ProtectedLayout>
  );
}

// ==================== OVERVIEW TAB ====================
function OverviewTab({ data, formatDuration }: { data: DashboardData; formatDuration: (ms: number) => string }) {
  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard
          icon={<Calendar className="w-5 h-5 text-blue-600" />}
          label="Totalt Events"
          value={data.events.stats.total}
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5 text-green-600" />}
          label="Publicerade"
          value={data.events.stats.published}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-purple-600" />}
          label="Aktiva (kommande)"
          value={data.events.stats.active}
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-orange-600" />}
          label="Nya (24h)"
          value={data.events.stats.addedLast24h}
        />
        <StatCard
          icon={<Activity className="w-5 h-5 text-cyan-600" />}
          label="Körningar (30d)"
          value={data.scrapers.summary.totalRuns}
        />
        <StatCard
          icon={<Database className="w-5 h-5 text-indigo-600" />}
          label="Success Rate"
          value={`${data.scrapers.summary.overallSuccessRate}%`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Events per vecka */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Kommande Events per Vecka</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.events.weeklyForecast}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Kategorier */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Events per Kategori</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RechartsPieChart>
              <Pie
                data={data.events.categories.slice(0, 8)}
                cx="50%"
                cy="45%"
                innerRadius={35}
                outerRadius={70}
                paddingAngle={2}
                dataKey="count"
                nameKey="name"
              >
                {data.events.categories.slice(0, 8).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [`${value} events`, name]} />
              <Legend 
                layout="horizontal" 
                verticalAlign="bottom" 
                align="center"
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
              />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Scraper Trend */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Events Importerade per Dag (30 dagar)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data.scrapers.trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              fontSize={10}
              tickFormatter={(value) => new Date(value).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
            />
            <YAxis fontSize={12} />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleDateString('sv-SE')}
            />
            <Line type="monotone" dataKey="imported" stroke="#10b981" strokeWidth={2} name="Importerade" />
            <Line type="monotone" dataKey="duplicates" stroke="#f59e0b" strokeWidth={2} name="Dubbletter" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ==================== SCRAPERS TAB ====================
function ScrapersTab({ 
  data, 
  formatDuration, 
  formatDate, 
  getStatusColor 
}: { 
  data: DashboardData; 
  formatDuration: (ms: number) => string;
  formatDate: (date: string | null) => string;
  getStatusColor: (status: string | null) => string;
}) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Activity className="w-5 h-5 text-blue-600" />}
          label="Körningar (30d)"
          value={data.scrapers.summary.totalRuns}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-green-600" />}
          label="Totalt Importerade"
          value={data.scrapers.summary.totalImported}
        />
        <StatCard
          icon={<Database className="w-5 h-5 text-yellow-600" />}
          label="Dubbletter Skippade"
          value={data.scrapers.summary.totalDuplicates}
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5 text-purple-600" />}
          label="Success Rate"
          value={`${data.scrapers.summary.overallSuccessRate}%`}
          subtitle="(success + partial)"
        />
      </div>

      {/* Scraper Details Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Scraper Prestanda (30 dagar)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scraper</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Körningar</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Success Rate</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Importerade</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dubbletter</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Snitt Tid</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Senaste</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.scrapers.stats.map((scraper) => (
                <tr key={scraper.name} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{scraper.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <span>{scraper.total}</span>
                      <span className="text-xs text-gray-400">
                        ({scraper.success}✓ {scraper.failed > 0 && `${scraper.failed}✗`})
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            scraper.successRate >= 90 ? 'bg-green-500' :
                            scraper.successRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${scraper.successRate}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{scraper.successRate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-green-600 font-medium">
                    +{scraper.totalEventsImported}
                  </td>
                  <td className="px-4 py-3 text-sm text-yellow-600">
                    {scraper.totalDuplicates}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDuration(scraper.avgDuration)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-600">{formatDate(scraper.lastRun)}</span>
                      {scraper.lastStatus && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full w-fit mt-1 ${getStatusColor(scraper.lastStatus)}`}>
                          {scraper.lastStatus}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Scraping Trend (30 dagar)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data.scrapers.trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              fontSize={10}
              tickFormatter={(value) => new Date(value).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
            />
            <YAxis fontSize={12} />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleDateString('sv-SE')}
            />
            <Legend />
            <Line type="monotone" dataKey="found" stroke="#3b82f6" strokeWidth={2} name="Funna" />
            <Line type="monotone" dataKey="imported" stroke="#10b981" strokeWidth={2} name="Importerade" />
            <Line type="monotone" dataKey="duplicates" stroke="#f59e0b" strokeWidth={2} name="Dubbletter" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top Errors */}
      {data.scrapers.topErrors.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Vanligaste Felen (30 dagar)
          </h3>
          <div className="space-y-2">
            {data.scrapers.topErrors.map((err, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-red-50 rounded">
                <span className="text-sm text-red-800 truncate flex-1">{err.error}</span>
                <span className="text-sm font-medium text-red-600 ml-2">{err.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== EVENTS TAB ====================
function EventsTab({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <StatCard
          icon={<Calendar className="w-5 h-5 text-blue-600" />}
          label="Totalt"
          value={data.events.stats.total}
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5 text-green-600" />}
          label="Publicerade"
          value={data.events.stats.published}
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-yellow-600" />}
          label="Väntar godkännande"
          value={data.events.stats.pending}
        />
        <StatCard
          icon={<FileText className="w-5 h-5 text-gray-600" />}
          label="Utkast"
          value={data.events.stats.draft}
        />
        <StatCard
          icon={<XCircle className="w-5 h-5 text-red-600" />}
          label="Avbrutna"
          value={data.events.stats.cancelled}
        />
      </div>

      {/* Timeline Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-purple-600" />}
          label="Aktiva (kommande)"
          value={data.events.stats.active}
          subtitle="publicerade events"
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-gray-600" />}
          label="Passerade"
          value={data.events.stats.passed}
        />
        <StatCard
          icon={<Activity className="w-5 h-5 text-green-600" />}
          label="Senaste 24h"
          value={data.events.stats.addedLast24h}
          subtitle="nya events"
        />
        <StatCard
          icon={<Activity className="w-5 h-5 text-blue-600" />}
          label="Senaste 7 dagar"
          value={data.events.stats.addedLast7d}
          subtitle="nya events"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kategorier */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Events per Kategori</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.events.categories} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" fontSize={12} />
              <YAxis type="category" dataKey="name" fontSize={11} width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Källor */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Events per Källa/Arrangör</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.events.sources} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" fontSize={12} />
              <YAxis type="category" dataKey="name" fontSize={11} width={120} />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly Forecast */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Kommande Events per Vecka</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.events.weeklyForecast}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Trend */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Events Tillagda per Dag (30 dagar)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data.events.trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              fontSize={10}
              tickFormatter={(value) => new Date(value).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
            />
            <YAxis fontSize={12} />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleDateString('sv-SE')}
            />
            <Line type="monotone" dataKey="added" stroke="#3b82f6" strokeWidth={2} name="Tillagda" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ==================== QUALITY TAB ====================
function QualityTab({ data }: { data: DashboardData }) {
  const totalPublished = data.events.stats.published;
  
  const qualityIssues = [
    {
      label: 'Saknar kategori',
      count: data.quality.noCategory,
      icon: <PieChart className="w-5 h-5 text-red-500" />,
      color: 'red',
    },
    {
      label: 'Saknar bild',
      count: data.quality.noImage,
      icon: <ImageIcon className="w-5 h-5 text-orange-500" />,
      color: 'orange',
    },
    {
      label: 'Kort/ingen beskrivning',
      count: data.quality.noDescription,
      icon: <FileText className="w-5 h-5 text-yellow-500" />,
      color: 'yellow',
    },
    {
      label: 'Låg kvalitetspoäng (<50)',
      count: data.quality.lowQuality,
      icon: <AlertTriangle className="w-5 h-5 text-purple-500" />,
      color: 'purple',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Quality Score */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Genomsnittlig Kvalitetspoäng</h3>
            <p className="text-sm text-gray-500">Baserat på {totalPublished} publicerade events</p>
          </div>
          <div className="text-right">
            <div className={`text-4xl font-bold ${
              data.quality.avgQualityScore >= 80 ? 'text-green-600' :
              data.quality.avgQualityScore >= 60 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {data.quality.avgQualityScore}
            </div>
            <div className="text-sm text-gray-500">av 100</div>
          </div>
        </div>
        
        {/* Quality Meter */}
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div 
            className={`h-4 rounded-full transition-all ${
              data.quality.avgQualityScore >= 80 ? 'bg-green-500' :
              data.quality.avgQualityScore >= 60 ? 'bg-yellow-500' :
              'bg-red-500'
            }`}
            style={{ width: `${data.quality.avgQualityScore}%` }}
          />
        </div>
      </div>

      {/* Quality Issues */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {qualityIssues.map((issue, idx) => (
          <div key={idx} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3 mb-3">
              {issue.icon}
              <h4 className="text-sm font-medium text-gray-900">{issue.label}</h4>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold text-gray-900">{issue.count}</div>
                <div className="text-xs text-gray-500">
                  {totalPublished > 0 ? `${Math.round((issue.count / totalPublished) * 100)}%` : '0%'} av publicerade
                </div>
              </div>
              {issue.count > 0 && (
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  issue.count > 50 ? 'bg-red-100 text-red-800' :
                  issue.count > 10 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {issue.count > 50 ? 'Hög' : issue.count > 10 ? 'Medium' : 'Låg'}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Quality Distribution Chart */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Datakvalitetsproblem</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={qualityIssues}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">💡 Tips för att förbättra datakvalitet</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Events utan kategori kan filtreras och kategoriseras manuellt via Events-sidan</li>
          <li>• Events utan bild får lägre synlighet på den publika sajten</li>
          <li>• Korta beskrivningar ger sämre SEO och användarupplevelse</li>
          <li>• Låg kvalitetspoäng innebär att flera fält saknas eller är ofullständiga</li>
        </ul>
      </div>
    </div>
  );
}

// ==================== SHARED COMPONENTS ====================
function StatCard({ 
  icon, 
  label, 
  value, 
  subtitle 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
