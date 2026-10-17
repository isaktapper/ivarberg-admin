import { NextRequest, NextResponse } from 'next/server'
import { aiCategorizer } from '@/lib/services/aiCategorizer'

/**
 * POST { name, description?, venue_name? } → { categories: string[], scores: Record<string, number> }
 * Samma AI-kategorisering som scrapern använder.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Namn saknas' }, { status: 400 })
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY saknas på servern' }, { status: 500 })

    const result = await aiCategorizer.categorize(name, String(body.description || ''), String(body.venue_name || ''))
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Kategorisering misslyckades' }, { status: 500 })
  }
}
