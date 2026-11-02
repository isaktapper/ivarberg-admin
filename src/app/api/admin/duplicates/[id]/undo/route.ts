import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-server'
import { EventImporter } from '@/lib/services/event-importer'
import type { ScrapedEvent } from '@/lib/scrapers/types'

async function verifyAuth() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
    },
  })
  const { data, error } = await supabase.auth.getUser()
  return !error && !!data.user
}

/** Tar bort URL:er ur ett events alternate_urls */
async function removeAlternateUrls(eventId: number, urls: Array<string | null | undefined>) {
  const drop = new Set(urls.filter(Boolean))
  if (drop.size === 0) return
  const { data } = await supabaseAdmin.from('events').select('alternate_urls').eq('id', eventId).single()
  const remaining = (data?.alternate_urls ?? []).filter((u: string) => !drop.has(u))
  await supabaseAdmin.from('events').update({ alternate_urls: remaining }).eq('id', eventId)
}

/**
 * POST /api/admin/duplicates/:id/undo
 * Ångrar ett dubblettbeslut. Paret slås aldrig ihop automatiskt igen.
 * - merged: det dolda eventet får tillbaka sin tidigare status
 * - skipped: det skrapade eventet importeras från den sparade kopian
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await verifyAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data: log, error } = await supabaseAdmin.from('duplicate_event_logs').select('*').eq('id', id).single()
    if (error || !log) return NextResponse.json({ error: 'Beslutet hittades inte' }, { status: 404 })
    if (log.action === 'undone') return NextResponse.json({ error: 'Redan ångrat' }, { status: 409 })

    let restoredEventId: number | null = log.duplicate_event_id

    if (log.action === 'merged') {
      if (!log.duplicate_event_id) return NextResponse.json({ error: 'Det dolda eventet finns inte längre' }, { status: 410 })
      const { data: hidden } = await supabaseAdmin
        .from('events')
        .select('organizer_event_url, alternate_urls')
        .eq('id', log.duplicate_event_id)
        .single()
      const { error: restoreError } = await supabaseAdmin
        .from('events')
        .update({ status: log.previous_status || 'published', duplicate_of: null })
        .eq('id', log.duplicate_event_id)
      if (restoreError) throw restoreError
      await removeAlternateUrls(log.existing_event_id, [hidden?.organizer_event_url, ...(hidden?.alternate_urls ?? [])])
    } else {
      const payload = log.scraped_payload as ScrapedEvent | null
      if (!payload) {
        return NextResponse.json({ error: 'Beslutet saknar sparad kopia av eventet och kan inte ångras' }, { status: 400 })
      }
      await removeAlternateUrls(log.existing_event_id, [log.scraped_event_url])
      const result = await new EventImporter().importEvents([payload], log.scraper_name, log.organizer_id ?? 0, undefined, {
        skipDedup: true,
      })
      if (result.eventsImported !== 1) {
        return NextResponse.json({ error: result.errors[0] ?? 'Eventet kunde inte återskapas' }, { status: 500 })
      }
      if (payload.organizer_event_url) {
        const { data: created } = await supabaseAdmin
          .from('events')
          .select('id')
          .eq('organizer_event_url', payload.organizer_event_url)
          .order('id', { ascending: false })
          .limit(1)
          .single()
        restoredEventId = created?.id ?? null
      }
    }

    const { error: logError } = await supabaseAdmin
      .from('duplicate_event_logs')
      .update({ action: 'undone', undone_at: new Date().toISOString(), duplicate_event_id: restoredEventId })
      .eq('id', id)
    if (logError) throw logError

    return NextResponse.json({ success: true, restoredEventId })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Kunde inte ångra' }, { status: 500 })
  }
}
