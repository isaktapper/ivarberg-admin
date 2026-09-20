/**
 * Lokal, ren kopia av poängsättningen i eventQualityChecker (utan OpenAI-moderation)
 * så att editorn kan visa en checklista i realtid utan API-anrop.
 */
export interface QualityCheckItem {
  label: string
  ok: boolean
  /** 'bad' = tungt avdrag, 'warn' = lättare */
  severity: 'bad' | 'warn'
}

export interface QualityResult {
  score: number
  items: QualityCheckItem[]
}

export function assessQualityLocal(e: {
  name?: string
  description?: string
  date_time?: string
  venue_name?: string
  image_url?: string | null
  categories?: string[]
}): QualityResult {
  let score = 100
  const items: QualityCheckItem[] = []

  const titleOk = !!e.name && e.name.length >= 5
  if (!titleOk) score -= 30
  items.push({ label: titleOk ? 'Titel finns' : 'Titel för kort eller saknas', ok: titleOk, severity: 'bad' })

  if (!e.description) {
    score -= 30
    items.push({ label: 'Beskrivning saknas', ok: false, severity: 'bad' })
  } else if (e.description.length < 50) {
    score -= 20
    items.push({ label: 'Beskrivning för kort (minst 50 tecken)', ok: false, severity: 'warn' })
  } else {
    items.push({ label: e.description.length < 100 ? 'Beskrivning finns (under 100 tecken)' : 'Beskrivning finns', ok: true, severity: 'warn' })
  }

  if (!e.date_time) {
    score -= 30
    items.push({ label: 'Datum saknas', ok: false, severity: 'bad' })
  } else if (new Date(e.date_time) < new Date()) {
    score -= 15
    items.push({ label: 'Eventet är i det förflutna', ok: false, severity: 'warn' })
  } else {
    items.push({ label: 'Datum i framtiden', ok: true, severity: 'bad' })
  }

  const imageOk = !!e.image_url
  if (!imageOk) score -= 25
  items.push({ label: imageOk ? 'Bild finns' : 'Bild saknas', ok: imageOk, severity: 'bad' })

  const venueOk = !!e.venue_name && e.venue_name.length >= 3
  if (!venueOk) score -= 10
  items.push({ label: venueOk ? 'Platsnamn finns' : 'Platsnamn saknas eller för kort', ok: venueOk, severity: 'warn' })

  const uncategorized = !e.categories || e.categories.length === 0 || e.categories.includes('Okategoriserad')
  if (uncategorized) score -= 30
  items.push({ label: uncategorized ? 'Saknar kategori' : 'Kategoriserad', ok: !uncategorized, severity: 'bad' })

  return { score: Math.max(0, score), items }
}
