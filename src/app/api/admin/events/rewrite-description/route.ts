import { NextRequest, NextResponse } from 'next/server'
import { getOpenAIClient } from '@/lib/services/openai-client'

/**
 * POST { name, description?, venue_name?, date_time? } → { description }
 * Skriver om en eventbeskrivning på svenska utan att hitta på fakta.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Namn saknas' }, { status: 400 })
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY saknas på servern' }, { status: 500 })

    const description = String(body.description || '').trim()
    const venue = String(body.venue_name || '').trim()
    const when = String(body.date_time || '').trim()

    const client = getOpenAIClient()
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content: `Du skriver korta, inbjudande eventbeskrivningar på svenska för ivarberg.nu, en lokal eventguide för Varberg.
Regler:
- Använd BARA fakta som finns i underlaget. Hitta aldrig på tider, priser, artister, åldersgränser eller detaljer.
- Om underlaget är tunt: skriv kort och allmänt hållet snarare än att gissa.
- Max 600 tecken, 1–3 stycken, ingen rubrik, inga emojis, inga länkar, inga uppmaningar om att köpa biljett på annan sajt.
- Skriv i tredje person, neutral men varm ton. Svara enbart med beskrivningen.`,
        },
        {
          role: 'user',
          content: `Eventnamn: ${name}\nPlats: ${venue || 'okänd'}\nTid: ${when || 'okänd'}\n\nNuvarande beskrivning:\n${description || '(saknas)'}`,
        },
      ],
      posthogProperties: { feature: 'event-description-rewrite' },
    })

    const text = response.choices[0]?.message?.content?.trim()
    if (!text) return NextResponse.json({ error: 'Tomt svar från AI' }, { status: 502 })
    return NextResponse.json({ description: text })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Omskrivning misslyckades' }, { status: 500 })
  }
}
