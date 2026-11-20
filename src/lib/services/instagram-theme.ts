/**
 * Utseendet på Instagram-inläggen ("vykortet"): en pastellfärg per veckodag,
 * vågmönster i bakgrunden och en poststämpel med stadens namn.
 *
 * Allt stadsspecifikt ligger i InstagramTheme så att fler i{stad}.nu kan få
 * egna färger/namn utan att renderaren ändras.
 */

export interface DayColors {
  /** Bakgrund */
  bg: string
  /** Vågmönster och skuggor (ett steg mörkare än bakgrunden) */
  wave: string
  /** Text, chip och stämpel (mörk ton av samma färg) */
  ink: string
}

export interface InstagramTheme {
  /** Stadsnamn i poststämpeln, t.ex. "VARBERG" */
  postmarkCity: string
  /** Domän längst ner på varje slide */
  domain: string
  /** Färger per veckodag, index 0 = söndag (som Date.getDay) */
  days: [DayColors, DayColors, DayColors, DayColors, DayColors, DayColors, DayColors]
}

export const VARBERG_THEME: InstagramTheme = {
  postmarkCity: 'VARBERG',
  domain: 'ivarberg.nu',
  days: [
    { bg: '#CFEEEA', wave: '#B1E1DA', ink: '#194B46' }, // sön - havsgrön
    { bg: '#D7EAF7', wave: '#BFDCF1', ink: '#173F5C' }, // mån - ljusblå
    { bg: '#D6EFDF', wave: '#BCE3CA', ink: '#1D4A33' }, // tis - mint
    { bg: '#FAEFBF', wave: '#F1E09B', ink: '#584510' }, // ons - smörgul
    { bg: '#FCDDC9', wave: '#F5C7AA', ink: '#682D13' }, // tor - persika
    { bg: '#F8D6DF', wave: '#EFBDCA', ink: '#6A2236' }, // fre - rosa
    { bg: '#E4DDF4', wave: '#D0C6EC', ink: '#392D65' }, // lör - lila
  ],
}

const WEEKDAYS = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag']
const WEEKDAYS_SHORT = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']
const MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
]

export interface PostDateParts {
  weekday: number // 0 = söndag
  weekdayName: string // "Lördag"
  weekdayShort: string // "Lör"
  day: number // 21
  monthName: string // "november"
  /** "21.11.26" för poststämpeln */
  stamp: string
}

/** Delar upp ett YYYY-MM-DD-datum utan att gå via lokal tidszon */
export function postDateParts(postDate: string): PostDateParts {
  const [y, m, d] = postDate.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return {
    weekday,
    weekdayName: WEEKDAYS[weekday],
    weekdayShort: WEEKDAYS_SHORT[weekday],
    day: d,
    monthName: MONTHS[m - 1],
    stamp: `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${String(y).slice(2)}`,
  }
}

export function dayColors(theme: InstagramTheme, postDate: string): DayColors {
  return theme.days[postDateParts(postDate).weekday]
}
