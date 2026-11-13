/**
 * Torsdagsbrevet – datum och klockslag i Europe/Stockholm.
 *
 * Brevet går ut torsdag 07:00 svensk tid och handlar om helgen som följer
 * (fredag–söndag). Allt räknas med Intl, utan extra beroenden, och klarar
 * sommar-/vintertid.
 *
 * Modulen är fri från serverberoenden så att godkännandesidan kan använda den.
 *
 * OBS: events.date_time lagras som lokal svensk tid UTAN tidszon
 * (t.ex. "2026-11-14T19:00:00"). Evenemangens tider jämförs därför som
 * strängar, aldrig via Date.
 */

const TIME_ZONE = 'Europe/Stockholm'

/** Klockslaget brevet går ut på torsdagen (svensk tid) */
export const SEND_HOUR = 7
/** Sista chansen att godkänna: fredag kl 18 (svensk tid). Därefter är helgen redan igång. */
export const APPROVAL_DEADLINE_HOUR = 18

const pad = (n: number) => String(n).padStart(2, '0')

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function zonedParts(date: Date): ZonedParts {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') }
}

function splitDate(date: string): [number, number, number] {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return [y, m, d]
}

/** Veckodag för ett YYYY-MM-DD-datum: 0 = söndag ... 4 = torsdag ... 6 = lördag */
export function weekdayOf(date: string): number {
  const [y, m, d] = splitDate(date)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** YYYY-MM-DD plus ett antal dagar (kalenderräkning, opåverkad av sommartid) */
export function addDays(date: string, days: number): string {
  const [y, m, d] = splitDate(date)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export interface StockholmNow {
  /** YYYY-MM-DD */
  date: string
  /** 0 = söndag ... 6 = lördag */
  weekday: number
  hour: number
  minute: number
}

/** Aktuellt datum, veckodag och klockslag i Europe/Stockholm */
export function stockholmNow(now: Date = new Date()): StockholmNow {
  const p = zonedParts(now)
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`
  return { date, weekday: weekdayOf(date), hour: p.hour, minute: p.minute }
}

/**
 * Ett svenskt klockslag (väggklocka) som UTC-tidpunkt, med rätt offset för
 * just det datumet. 2026-11-12 07:00 blir 06:00Z (vintertid), 2026-07-16
 * 07:00 blir 05:00Z (sommartid).
 */
export function stockholmTimeToUtc(date: string, hour: number, minute = 0): Date {
  const [y, m, d] = splitDate(date)
  const wallAsUtc = Date.UTC(y, m - 1, d, hour, minute)
  // Offset (lokal tid minus UTC) vid en given tidpunkt
  const offsetAt = (ts: number) => {
    const p = zonedParts(new Date(ts))
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000
  }
  // Två pass: första gissningen kan hamna på fel sida om en tidsomställning
  let ts = wallAsUtc - offsetAt(wallAsUtc)
  ts = wallAsUtc - offsetAt(ts)
  return new Date(ts)
}

/** Torsdagen för nästa brev: i dag om det är torsdag, annars kommande torsdag */
export function upcomingIssueDate(now: Date = new Date()): string {
  const today = stockholmNow(now)
  return addDays(today.date, (4 - today.weekday + 7) % 7)
}

/** Helgen ett brev handlar om: fredag och söndag efter torsdagen */
export function weekendFor(issueDate: string): { start: string; end: string } {
  return { start: addDays(issueDate, 1), end: addDays(issueDate, 3) }
}

/**
 * Gränser för helgens evenemang som naiva lokaltidssträngar:
 * fredag 00:00 (inklusive) till måndag 00:00 (exklusive).
 */
export function weekendQueryRange(issueDate: string): { from: string; to: string } {
  return { from: `${addDays(issueDate, 1)}T00:00:00`, to: `${addDays(issueDate, 4)}T00:00:00` }
}

/** När brevet ska gå ut: torsdagen kl 07:00 svensk tid */
export function sendTimeFor(issueDate: string): Date {
  return stockholmTimeToUtc(issueDate, SEND_HOUR)
}

/** Sista tidpunkten då brevet får godkännas: fredagen kl 18:00 svensk tid */
export function approvalDeadlineFor(issueDate: string): Date {
  return stockholmTimeToUtc(addDays(issueDate, 1), APPROVAL_DEADLINE_HOUR)
}

const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']

/**
 * "torsdag 12 november 07:00" i svensk tid. Sätts ihop för hand i stället för
 * med toLocaleString, så att server och webbläsare alltid ger samma text.
 */
export function formatStockholm(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return '–'
  const p = zonedParts(date)
  const day = `${p.year}-${pad(p.month)}-${pad(p.day)}`
  return `${WEEKDAYS[weekdayOf(day)]} ${p.day} ${MONTHS[p.month - 1]} ${pad(p.hour)}:${pad(p.minute)}`
}

/** "torsdag 12 november" för ett YYYY-MM-DD-datum */
export function formatDateLong(date: string): string {
  const [, m, d] = splitDate(date)
  return `${WEEKDAYS[weekdayOf(date)]} ${d} ${MONTHS[m - 1]}`
}

/** "13–15 november" eller "30 oktober–1 november" */
export function formatWeekendRange(start: string, end: string): string {
  const [, sm, sd] = splitDate(start)
  const [, em, ed] = splitDate(end)
  return sm === em ? `${sd}–${ed} ${MONTHS[em - 1]}` : `${sd} ${MONTHS[sm - 1]}–${ed} ${MONTHS[em - 1]}`
}

// ---------------------------------------------------------------------------
// Evenemangens tider (naiva lokaltidssträngar)
// ---------------------------------------------------------------------------

/** YYYY-MM-DD ur events.date_time */
export function eventDay(dateTime: string): string {
  return (dateTime || '').slice(0, 10)
}

/** "19:00" ur events.date_time, null när tid saknas (00:00 = heldag) */
export function eventTime(dateTime: string): string | null {
  const t = (dateTime || '').slice(11, 16)
  return !t || t === '00:00' ? null : t
}

/** "lördag 19:00" eller "lördag" */
export function eventWhenLabel(dateTime: string): string {
  const day = eventDay(dateTime)
  if (!day) return ''
  const time = eventTime(dateTime)
  return time ? `${WEEKDAYS[weekdayOf(day)]} ${time}` : WEEKDAYS[weekdayOf(day)]
}
