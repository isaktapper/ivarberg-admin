'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedLayout from '@/components/ProtectedLayout'
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle,
  Clock,
  MessageSquare,
  Mail,
  Smartphone,
  RefreshCw,
  Filter
} from 'lucide-react'

interface SystemAlert {
  id: number
  severity: 'info' | 'warning' | 'critical'
  category: string
  title: string
  message: string
  details: Record<string, any>
  source: string | null
  acknowledged: boolean
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved: boolean
  resolved_at: string | null
  sms_sent: boolean
  email_sent: boolean
  created_at: string
}

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-800'
  },
  warning: {
    icon: AlertCircle,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800'
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-800'
  }
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'critical'>('unresolved')

  const fetchAlerts = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('system_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (filter === 'unresolved') {
        query = query.eq('resolved', false)
      } else if (filter === 'critical') {
        query = query.eq('severity', 'critical')
      }

      const { data, error } = await query

      if (error) throw error
      setAlerts(data || [])
    } catch (error) {
      console.error('Error fetching alerts:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAlerts()
  }, [filter])

  const acknowledgeAlert = async (alertId: number) => {
    try {
      const { error } = await supabase
        .from('system_alerts')
        .update({
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: 'admin' // TODO: Use actual user
        })
        .eq('id', alertId)

      if (error) throw error
      fetchAlerts()
    } catch (error) {
      console.error('Error acknowledging alert:', error)
    }
  }

  const resolveAlert = async (alertId: number) => {
    try {
      const { error } = await supabase
        .from('system_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString()
        })
        .eq('id', alertId)

      if (error) throw error
      fetchAlerts()
    } catch (error) {
      console.error('Error resolving alert:', error)
    }
  }

  const unresolvedCount = alerts.filter(a => !a.resolved).length
  const criticalCount = alerts.filter(a => a.severity === 'critical' && !a.resolved).length

  return (
    <ProtectedLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Systemvarningar</h1>
            <p className="text-gray-600 mt-1">
              {unresolvedCount > 0 ? (
                <>
                  <span className="font-medium text-amber-600">{unresolvedCount} olösta</span>
                  {criticalCount > 0 && (
                    <span className="ml-2 font-medium text-red-600">({criticalCount} kritiska)</span>
                  )}
                </>
              ) : (
                <span className="text-green-600">✓ Inga aktiva varningar</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setFilter('unresolved')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  filter === 'unresolved' 
                    ? 'bg-white shadow text-gray-900' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Olösta
              </button>
              <button
                onClick={() => setFilter('critical')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  filter === 'critical' 
                    ? 'bg-white shadow text-gray-900' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Kritiska
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  filter === 'all' 
                    ? 'bg-white shadow text-gray-900' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Alla
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={fetchAlerts}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Alerts List */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Inga varningar</h3>
            <p className="text-gray-600 mt-1">
              {filter === 'unresolved' 
                ? 'Alla varningar är lösta!'
                : filter === 'critical'
                ? 'Inga kritiska varningar.'
                : 'Inga varningar har loggats ännu.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => {
              const config = SEVERITY_CONFIG[alert.severity]
              const Icon = config.icon

              return (
                <div
                  key={alert.id}
                  className={`${config.bg} ${config.border} border rounded-lg p-4 ${
                    alert.resolved ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`p-2 rounded-full ${config.badge}`}>
                      <Icon className="w-5 h-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`font-medium ${config.text}`}>
                          {alert.title}
                        </h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${config.badge}`}>
                          {alert.severity}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {alert.category}
                        </span>
                        {alert.resolved && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            ✓ Löst
                          </span>
                        )}
                      </div>

                      <p className="text-gray-700 mt-1">{alert.message}</p>

                      {/* Details */}
                      {alert.details && Object.keys(alert.details).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                            Visa detaljer
                          </summary>
                          <pre className="mt-2 p-2 bg-white rounded text-xs overflow-x-auto">
                            {JSON.stringify(alert.details, null, 2)}
                          </pre>
                        </details>
                      )}

                      {/* Meta */}
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(alert.created_at).toLocaleString('sv-SE')}
                        </span>
                        {alert.source && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {alert.source}
                          </span>
                        )}
                        {alert.sms_sent && (
                          <span className="flex items-center gap-1 text-green-600">
                            <Smartphone className="w-3 h-3" />
                            SMS skickat
                          </span>
                        )}
                        {alert.email_sent && (
                          <span className="flex items-center gap-1 text-green-600">
                            <Mail className="w-3 h-3" />
                            Email skickat
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {!alert.resolved && (
                      <div className="flex flex-col gap-2">
                        {!alert.acknowledged && (
                          <button
                            onClick={() => acknowledgeAlert(alert.id)}
                            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                          >
                            Noterad
                          </button>
                        )}
                        <button
                          onClick={() => resolveAlert(alert.id)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                        >
                          Markera löst
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Setup Instructions */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-2">📱 Konfigurera SMS-notifikationer</h3>
          <p className="text-sm text-gray-600 mb-3">
            För att få SMS vid kritiska fel, lägg till dessa i din <code className="bg-gray-200 px-1 rounded">.env.local</code>:
          </p>
          <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto">
{`# Twilio (för SMS)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ALERT_PHONE_NUMBER=+46701234567

# Email för alerts (använder din befintliga Resend)
ALERT_EMAIL=din@email.com`}
          </pre>
          <p className="text-xs text-gray-500 mt-2">
            Skapa ett Twilio-konto på <a href="https://www.twilio.com" target="_blank" rel="noopener" className="text-blue-600 hover:underline">twilio.com</a> - 
            de har gratis testkrediter för att komma igång.
          </p>
        </div>
      </div>
    </ProtectedLayout>
  )
}
