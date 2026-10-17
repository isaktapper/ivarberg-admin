/** Datumformat på svenska. Alla tar ISO-sträng eller Date. */

const toDate = (d: string | Date | null | undefined) => (d ? (d instanceof Date ? d : new Date(d)) : null)

/** "lör 26 sep" */
export function formatDay(d: string | Date | null | undefined): string {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return '–'
  return date.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')
}

/** "lör 26 sep 2026" */
export function formatDayYear(d: string | Date | null | undefined): string {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return '–'
  return date.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
}

/** "19:30" */
export function formatTime(d: string | Date | null | undefined): string {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return '–'
  return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

/** "lör 26 sep · 19:30" */
export function formatDateTime(d: string | Date | null | undefined): string {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return '–'
  return `${formatDay(date)} · ${formatTime(date)}`
}

/** "i dag 06:02", "i går 14:10", annars "18 sep 06:03" */
export function formatRelative(d: string | Date | null | undefined): string {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return '–'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.floor((startOfToday.getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86_400_000)
  if (diffDays === 0) return `i dag ${formatTime(date)}`
  if (diffDays === 1) return `i går ${formatTime(date)}`
  if (diffDays === -1) return `i morgon ${formatTime(date)}`
  return `${date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '')} ${formatTime(date)}`
}

/** "4 min 12 s" */
export function formatDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return '–'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? `${m} min ${rest} s` : `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

/** "3 318" */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '–'
  return n.toLocaleString('sv-SE')
}

/** ISO-datum (YYYY-MM-DD) i lokal tid */
export function toLocalDateInput(d: string | Date | null | undefined): string {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "HH:MM" i lokal tid */
export function toLocalTimeInput(d: string | Date | null | undefined): string {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** "YYYY-MM-DDTHH:MM" för datetime-local */
export function toDateTimeLocalInput(d: string | Date | null | undefined): string {
  const date = toLocalDateInput(d)
  const time = toLocalTimeInput(d)
  return date && time ? `${date}T${time}` : ''
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function initials(name: string | null | undefined): string {
  return (name || '?').trim().charAt(0).toUpperCase()
}
