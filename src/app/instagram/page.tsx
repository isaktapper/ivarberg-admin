'use client'

/**
 * Översikt över Instagram-posterna: dagens förslag/status och historik.
 * Godkännandet sker på /instagram/approve/<token> (länk härifrån eller i
 * ntfy-notisen).
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ProtectedLayout from '@/components/ProtectedLayout'
import { InstagramPost } from '@/types/database'
import { CheckCircle, Clock, ExternalLink, Instagram, RefreshCw, SkipForward, XCircle } from 'lucide-react'

type Row = InstagramPost & { event?: { name: string } | null }

const STATUS: Record<InstagramPost['status'], { label: string; className: string; Icon: typeof Clock }> = {
  pending: { label: 'Väntar på godkännande', className: 'bg-amber-100 text-amber-800', Icon: Clock },
  published: { label: 'Publicerad', className: 'bg-green-100 text-green-800', Icon: CheckCircle },
  skipped: { label: 'Överhoppad', className: 'bg-gray-100 text-gray-700', Icon: SkipForward },
  failed: { label: 'Misslyckad', className: 'bg-red-100 text-red-800', Icon: XCircle },
}

const SOURCE: Record<string, string> = {
  manual: 'godkänd på sidan',
  ntfy: 'godkänd i notisen',
  auto: 'auto-publicerad',
  direct: 'direktpublicerad',
}

export default function InstagramPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('instagram_posts')
      .select('*, event:events(name)')
      .order('post_date', { ascending: false })
      .limit(30)
    setRows((data as Row[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const today = rows[0]

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Instagram className="size-6" /> Instagram
            </h1>
            <p className="text-gray-600">
              Dagliga posten &quot;Det här händer i Varberg idag&quot;. Förslaget skapas på morgonen och skickas som ntfy-notis - godkänn, ändra eller hoppa över.
            </p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 text-sm text-gray-700 border rounded-md px-3 py-2 bg-white hover:bg-gray-50">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Uppdatera
          </button>
        </div>

        {today && (
          <div className="rounded-xl border bg-white p-4 flex flex-col sm:flex-row gap-4">
            {today.slide_image_urls?.[0] || today.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={today.slide_image_urls?.[0] || today.image_url || ''} alt="" className="w-full sm:w-40 aspect-square object-cover rounded-lg bg-gray-100" />
            ) : null}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-500">Senaste: {today.post_date}</span>
                <StatusBadge status={today.status} />
                {today.approval_source && <span className="text-xs text-gray-500">({SOURCE[today.approval_source] ?? today.approval_source})</span>}
              </div>
              <p className="font-medium text-gray-900">{today.event?.name ?? (today.status === 'skipped' ? today.error : '–')}</p>
              {today.caption && <p className="text-sm text-gray-600 line-clamp-3 whitespace-pre-line">{today.caption}</p>}
              {today.status === 'failed' && today.error && <p className="text-sm text-red-700">{today.error}</p>}
              {today.approval_token && (
                <Link
                  href={`/instagram/approve/${today.approval_token}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-pink-700 hover:underline"
                >
                  {today.status === 'pending' ? 'Granska och godkänn' : 'Öppna godkännandesidan'} <ExternalLink className="size-4" />
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Datum</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Huvudevent</th>
                <th className="px-4 py-2 font-medium hidden md:table-cell">Slides</th>
                <th className="px-4 py-2 font-medium hidden md:table-cell">Publicerad</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-900">{r.post_date}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-gray-900">
                    {r.event?.name ?? <span className="text-gray-500">{r.error ?? '–'}</span>}
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell text-gray-600">{r.slide_image_urls?.length ?? (r.status === 'pending' ? '–' : 0)}</td>
                  <td className="px-4 py-2 hidden md:table-cell text-gray-600 whitespace-nowrap">
                    {r.posted_at ? new Date(r.posted_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '–'}
                    {r.approval_source ? ` · ${SOURCE[r.approval_source] ?? r.approval_source}` : ''}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.approval_token && (
                      <Link href={`/instagram/approve/${r.approval_token}`} className="text-pink-700 hover:underline inline-flex items-center gap-1">
                        Öppna <ExternalLink className="size-3.5" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Inga poster ännu</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ProtectedLayout>
  )
}

function StatusBadge({ status }: { status: InstagramPost['status'] }) {
  const s = STATUS[status] ?? STATUS.failed
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
      <s.Icon className="size-3.5" /> {s.label}
    </span>
  )
}
