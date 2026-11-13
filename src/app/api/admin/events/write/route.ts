import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-server'

/**
 * POST /api/admin/events/write
 *
 * Skapar och uppdaterar events åt adminens sidor med service role.
 *
 * Varför inte direkt från webbläsaren: en trigger på events skriver till
 * event_audit_log vid skapande och statusändring. Körs ändringen som inloggad
 * användare stoppas den raden av RLS ("new row violates row-level security
 * policy for table event_audit_log") och hela ändringen rullas tillbaka.
 * Med service role går loggraden igenom.
 *
 * Body:
 *   { action: 'update', ids: number[], patch }
 *   { action: 'update', organizer_id: number, only_status?: string, patch }
 *   { action: 'insert', payload }
 */

async function verifyAuth() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
    },
  })
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  return !session || error ? null : session
}

// Fält som aldrig ska skrivas härifrån. `category` finns inte längre i
// events-tabellen (ersatt av `categories`).
const BLOCKED_FIELDS = ['id', 'created_at', 'category']

function clean(values: unknown): Record<string, unknown> | null {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null
  const copy = { ...(values as Record<string, unknown>) }
  for (const field of BLOCKED_FIELDS) delete copy[field]
  return Object.keys(copy).length > 0 ? copy : null
}

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status })

export async function POST(request: NextRequest) {
  const session = await verifyAuth()
  if (!session) return fail('Du är inte inloggad', 401)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return fail('Ogiltig förfrågan', 400)
  }

  try {
    if (body.action === 'insert') {
      const payload = clean(body.payload)
      if (!payload) return fail('Inget att spara', 400)
      const { data, error } = await supabaseAdmin.from('events').insert([payload]).select('id').single()
      if (error) return fail(error.message, 400)
      return NextResponse.json({ ok: true, id: data.id })
    }

    if (body.action === 'update') {
      const patch = clean(body.patch)
      if (!patch) return fail('Inget att spara', 400)
      delete patch.event_id

      let query = supabaseAdmin.from('events').update(patch)
      if (Array.isArray(body.ids)) {
        const ids = body.ids.filter((id): id is number => Number.isInteger(id))
        if (ids.length === 0) return fail('Inga event valda', 400)
        query = query.in('id', ids)
      } else if (Number.isInteger(body.organizer_id)) {
        query = query.eq('organizer_id', body.organizer_id as number)
        if (typeof body.only_status === 'string') query = query.eq('status', body.only_status)
      } else {
        return fail('Inga event valda', 400)
      }

      const { error } = await query
      if (error) return fail(error.message, 400)
      return NextResponse.json({ ok: true })
    }

    return fail('Okänd åtgärd', 400)
  } catch (error) {
    console.error('events/write:', error)
    return fail(error instanceof Error ? error.message : 'Okänt fel', 500)
  }
}
