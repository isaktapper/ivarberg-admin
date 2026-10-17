/**
 * Ett enda statusregister för alla domäner i adminen.
 * Varje status mappar till en TON (ok / wait / neutral / bad / info / running)
 * och en svensk etikett. <StatusBadge> läser härifrån.
 */
export type StatusTone = 'ok' | 'wait' | 'neutral' | 'bad' | 'info' | 'running'

export interface StatusMeta {
  label: string
  tone: StatusTone
}

export type StatusDomain =
  | 'event'
  | 'organizer'
  | 'page'
  | 'scraper'
  | 'tip'
  | 'alert'
  | 'instagram'
  | 'alertSeverity'

const registry: Record<StatusDomain, Record<string, StatusMeta>> = {
  event: {
    published: { label: 'Publicerad', tone: 'ok' },
    pending_approval: { label: 'Väntar', tone: 'wait' },
    draft: { label: 'Utkast', tone: 'neutral' },
    cancelled: { label: 'Inställd', tone: 'bad' },
  },
  organizer: {
    active: { label: 'Aktiv', tone: 'ok' },
    pending: { label: 'Väntar', tone: 'wait' },
    archived: { label: 'Arkiverad', tone: 'neutral' },
  },
  page: {
    published: { label: 'Publicerad', tone: 'ok' },
    draft: { label: 'Utkast', tone: 'neutral' },
  },
  scraper: {
    running: { label: 'Körs', tone: 'running' },
    success: { label: 'Klar', tone: 'ok' },
    partial: { label: 'Delvis', tone: 'wait' },
    failed: { label: 'Misslyckad', tone: 'bad' },
    cancelled: { label: 'Avbruten', tone: 'neutral' },
  },
  tip: {
    pending: { label: 'Väntar', tone: 'wait' },
    reviewed: { label: 'Granskad', tone: 'info' },
    approved: { label: 'Godkänd', tone: 'ok' },
    rejected: { label: 'Avvisad', tone: 'bad' },
    converted: { label: 'Skapad som event', tone: 'ok' },
  },
  alert: {
    open: { label: 'Olöst', tone: 'bad' },
    acknowledged: { label: 'Noterad', tone: 'wait' },
    resolved: { label: 'Löst', tone: 'ok' },
  },
  alertSeverity: {
    critical: { label: 'Kritisk', tone: 'bad' },
    error: { label: 'Fel', tone: 'bad' },
    warning: { label: 'Varning', tone: 'wait' },
    info: { label: 'Info', tone: 'info' },
  },
  instagram: {
    pending: { label: 'Väntar', tone: 'wait' },
    published: { label: 'Publicerad', tone: 'ok' },
    skipped: { label: 'Hoppad', tone: 'neutral' },
    failed: { label: 'Misslyckad', tone: 'bad' },
  },
}

export function getStatus(domain: StatusDomain, value: string | boolean | null | undefined): StatusMeta {
  const key = typeof value === 'boolean' ? (value ? 'published' : 'draft') : String(value ?? '')
  return registry[domain][key] ?? { label: key || '–', tone: 'neutral' }
}

export function statusOptions(domain: StatusDomain): { value: string; label: string }[] {
  return Object.entries(registry[domain]).map(([value, meta]) => ({ value, label: meta.label }))
}

export const toneClasses: Record<StatusTone, { chip: string; dot: string; text: string }> = {
  ok: { chip: 'bg-kelp-light text-kelp', dot: 'bg-kelp', text: 'text-kelp' },
  wait: { chip: 'bg-amber-light text-amber', dot: 'bg-amber', text: 'text-amber' },
  neutral: { chip: 'bg-stone text-ink-soft', dot: 'bg-ink-faint', text: 'text-ink-soft' },
  bad: { chip: 'bg-poppy-light text-poppy', dot: 'bg-poppy', text: 'text-poppy' },
  info: { chip: 'bg-sea-light text-sea-dark', dot: 'bg-sea', text: 'text-sea-dark' },
  running: { chip: 'bg-sea-light text-sea-dark', dot: 'bg-sea animate-pulse', text: 'text-sea-dark' },
}

/** Kvalitetspoäng 0–100 → ton */
export function qualityTone(score: number | null | undefined): StatusTone {
  if (score == null) return 'neutral'
  if (score >= 80) return 'ok'
  if (score >= 50) return 'wait'
  return 'bad'
}
