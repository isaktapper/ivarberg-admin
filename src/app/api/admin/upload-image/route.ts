import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

const MAX_BYTES = 8 * 1024 * 1024
const BUCKET = 'event-images'

/**
 * POST multipart/form-data { file } → { url }
 * Laddar upp en bild till Supabase Storage (bucket event-images, publik).
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Ingen fil skickades' }, { status: 400 })
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Bara bildfiler tillåts' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Bilden är större än 8 MB' }, { status: 400 })

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const base = file.name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[åä]/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'bild'
    const path = `events/${Date.now()}-${base}.${ext}`

    const bytes = Buffer.from(await file.arrayBuffer())
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl, path })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Uppladdning misslyckades' }, { status: 500 })
  }
}
