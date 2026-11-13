/**
 * Skapar och uppdaterar events via /api/admin/events/write (service role).
 *
 * Använd dessa i stället för supabase.from('events').insert/update i
 * webbläsaren: triggern som skriver till event_audit_log stoppas annars av
 * RLS och ändringen misslyckas. Returformen liknar supabase-klientens
 * ({ error }) så att anropen är lätta att byta.
 */

type WriteError = { message: string } | null

async function post(body: Record<string, unknown>): Promise<{ json: { id?: number; error?: string } | null; error: WriteError }> {
  try {
    const res = await fetch('/api/admin/events/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) return { json, error: { message: json?.error || `Servern svarade ${res.status}` } }
    return { json, error: null }
  } catch (e) {
    return { json: null, error: { message: e instanceof Error ? e.message : 'Nätverksfel' } }
  }
}

/** Uppdaterar ett eller flera events utifrån id. */
export async function updateEvents(ids: number[], patch: Record<string, unknown>): Promise<{ error: WriteError }> {
  const { error } = await post({ action: 'update', ids, patch })
  return { error }
}

/** Uppdaterar en arrangörs events, valfritt bara de med en viss status. */
export async function updateOrganizerEvents(organizerId: number, patch: Record<string, unknown>, onlyStatus?: string): Promise<{ error: WriteError }> {
  const { error } = await post({ action: 'update', organizer_id: organizerId, only_status: onlyStatus, patch })
  return { error }
}

/** Skapar ett event och returnerar dess id. */
export async function insertEvent(payload: Record<string, unknown>): Promise<{ data: { id: number } | null; error: WriteError }> {
  const { json, error } = await post({ action: 'insert', payload })
  if (error) return { data: null, error }
  return typeof json?.id === 'number' ? { data: { id: json.id }, error: null } : { data: null, error: { message: 'Eventet skapades inte' } }
}
