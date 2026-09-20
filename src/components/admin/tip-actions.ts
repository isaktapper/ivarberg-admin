import { supabase } from '@/lib/supabase'
import type { Event } from '@/types/database'

/** Gemensamma anrop för tips (lista + detalj). Går via befintliga API-routes. */

export async function convertTip(id: number): Promise<{ event: Event; event_id: string }> {
  const res = await fetch(`/api/admin/tips/${id}/convert`, { method: 'POST' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.details || json.error || 'Kunde inte konvertera tipset')
  return json
}

export async function rejectTip(id: number, reason: string): Promise<void> {
  const res = await fetch(`/api/admin/tips/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.details || json.error || 'Kunde inte avvisa tipset')
}

export async function markTipsReviewed(ids: number[]): Promise<void> {
  const { error } = await supabase
    .from('event_tips')
    .update({ status: 'reviewed', updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw new Error(error.message)
}
