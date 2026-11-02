/**
 * AI-bedömning av gråzonspar: är det här samma evenemang?
 * Anropas bara för par som matcher.ts gett "maybe", så det blir få anrop.
 */
import { getOpenAIClient } from '../openai-client'
import type { MatchableEvent } from './matcher'

export interface JudgeEvent extends MatchableEvent {
  description?: string | null
}

export interface AIVerdict {
  same: boolean
  confidence: number
  explanation: string
}

const MIN_CONFIDENCE = 0.75

function describe(e: JudgeEvent): string {
  const desc = (e.description ?? '').replace(/\s+/g, ' ').slice(0, 400)
  return [
    `Namn: ${e.name}`,
    `Tid: ${e.date_time}`,
    `Plats: ${[e.venue_name, e.location].filter(Boolean).join(', ') || 'okänd'}`,
    `Källa: ${e.organizer_event_url ?? 'okänd'}`,
    desc ? `Beskrivning: ${desc}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export interface JudgeContext {
  minutesApart: number | null
  venue: 'same' | 'unknown' | 'different'
  venueMeters?: number
}

function describeContext(c: JudgeContext): string {
  const time =
    c.minutesApart === null
      ? 'Det ena saknar klockslag, båda är samma dag.'
      : c.minutesApart === 0
        ? 'Starttiderna är identiska.'
        : `Starttiderna skiljer ${c.minutesApart} minuter.`
  const place =
    c.venue === 'same'
      ? 'Platserna är samma byggnad/adress enligt koordinater eller adress, även om de heter olika.'
      : c.venueMeters !== undefined
        ? `Platserna ligger ca ${c.venueMeters} m från varandra.`
        : 'Platsernas läge är okänt.'
  return `${time} ${place}`
}

/** Returnerar null om AI inte är tillgänglig eller svaret inte går att tolka */
export async function judgeSameEvent(a: JudgeEvent, b: JudgeEvent, context: JudgeContext): Promise<AIVerdict | null> {
  if (!process.env.OPENAI_API_KEY) return null

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Du jämför två evenemang som hämtats från olika webbplatser och avgör om de beskriver ' +
            'SAMMA tillfälle (samma evenemang, samma dag, samma plats). Namn, platsnamn och tider ' +
            'skrivs ofta olika i olika källor: en lokal kan heta olika saker (en arena, en hall i den ' +
            'och arrangörens namn för den), och en tidsskillnad på upp till en timme är ofta insläpp i ' +
            'den ena och start i den andra - det i sig gör dem inte till olika evenemang. Avgör utifrån ' +
            'vad som händer: samma artist, föreställning, talare eller aktivitet = samma. Olika ' +
            'föreställningar, filmer, talare eller delmoment i en serie, eller en utställning jämfört ' +
            'med en visning/workshop i den, är INTE samma evenemang. Svara med JSON: ' +
            '{"same": boolean, "confidence": 0-1, "explanation": "kort motivering på svenska"}',
        },
        {
          role: 'user',
          content: `Evenemang A:\n${describe(a)}\n\nEvenemang B:\n${describe(b)}\n\nFakta: ${describeContext(context)}`,
        },
      ],
      posthogProperties: { feature: 'event-dedup-judge' },
    })

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}')
    if (typeof parsed.same !== 'boolean') return null
    return {
      same: parsed.same,
      confidence: Number(parsed.confidence) || 0,
      explanation: String(parsed.explanation ?? ''),
    }
  } catch (error) {
    console.warn('  ⚠️ AI-bedömning av dublett misslyckades:', error instanceof Error ? error.message : error)
    return null
  }
}

export function isConfidentSame(v: AIVerdict | null): boolean {
  return !!v && v.same && v.confidence >= MIN_CONFIDENCE
}
