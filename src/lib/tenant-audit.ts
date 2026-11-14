import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { isVarberg, scopeEvents, type Tenant } from '@/lib/tenants'

/**
 * event_audit_log har ingen egen stadskolumn; staden följer av eventet.
 *
 * - Utan stad (migrationen inte körd): alla loggar, som förut.
 * - Varberg: allt utom loggar för event som ligger i en annan stad. Loggar för
 *   raderade event går inte att knyta till någon stad och stannar hos Varberg,
 *   där all historik kommer ifrån.
 * - Övriga städer: bara loggar för event som finns i staden.
 */
export async function filterAuditLogsByTenant<T extends { event_id?: string | null }>(
  supabase: SupabaseClient,
  logs: T[],
  tenant: Pick<Tenant, 'id' | 'municipality_codes'> | null
): Promise<T[]> {
  if (!tenant || logs.length === 0) return logs

  const varberg = isVarberg(tenant)
  const rows = await fetchAllRows<{ event_id: string }>((from, to) => {
    const query = supabase.from('events').select('event_id')
    const scoped = varberg ? query.not('municipality_code', 'in', `(${tenant.municipality_codes.join(',')})`) : scopeEvents(query, tenant)
    return scoped.order('id', { ascending: true }).range(from, to)
  })
  const ids = new Set(rows.map((r) => r.event_id))

  return logs.filter((log) => (varberg ? !ids.has(log.event_id ?? '') : ids.has(log.event_id ?? '')))
}
