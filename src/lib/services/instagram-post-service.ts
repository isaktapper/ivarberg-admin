/**
 * Service för den dagliga automatiska Instagram-posten:
 * "Det här händer i Varberg idag".
 *
 * AI-pipeline (gpt-4o-mini, alla anrop PostHog-mätta via openai-client):
 *   1. rankEvents()       - rankar dagens event (huvudkandidater + listan)
 *   2. reviewImages()     - vision-granskar bilderna, flaggar riktigt snygga foton
 *   3. generateHeadline() - kort rubrik till vykortet
 *   4. generateCaption()  - den svenska captionen
 *
 * Slidesen ritas av instagram-slides.ts (vykortet, 4:5). Fotot läggs in helt
 * på vykortet, så bildgaten (assessPhoto) handlar bara om upplösning.
 *
 * VIKTIG INNEHÅLLSREGEL: captions får ALDRIG hänvisa till arrangörens egen
 * webbplats eller biljettsida. Enda CTA är ivarberg.nu ("länk i bio").
 * Därför skickas booking_url/event_website/organizer_event_url aldrig med
 * i prompterna, och sanitizeCaption() stryker rader med URL:er/domäner.
 */
import sharp from 'sharp'
import { SupabaseClient } from '@supabase/supabase-js'
import { Event } from '@/types/database'
import { getOpenAIClient } from './openai-client'
import { alertService } from './alert-service'
import { HEADLINE_MAX_LENGTH } from './instagram-proposal'
import { MAX_PHOTO_ASPECT, MIN_PHOTO_ASPECT, photoBox, stripEmoji } from './instagram-slides'

const MODEL = 'gpt-4o-mini'
const MAX_CAPTION_LENGTH = 2200
const PRIMARY_LOOKBACK_DAYS = 7 // Event som varit primärt inom X dagar får inte bli det igen
const ALSO_LOOKBACK_DAYS = 2 // Event som nämnts inom X dagar undviks i listan
const MIN_ALSO_COUNT = 3
export const MAX_ALSO_COUNT = 7 // listslidens tak: topp tre + fyra rader

export const MAX_VISION_CANDIDATES = 8 // tak på bilder i vision-anropet

// Dubblettregler utöver 7-dagarsregeln för primärt event: samma event får
// inte återkomma som extra vykort dag efter dag, och får inte synas mer än
// MAX_APPEARANCES_PER_WEEK gånger på en rullande vecka. Matchning sker på
// normaliserat NAMN - långkörare får nytt event-id varje dag av scrapern, så
// id-jämförelsen ensam ser dem som nya event varje morgon (det var så
// "TRYCKT!" kunde ligga med i praktiskt taget varje karusell).
const SLIDE_LOOKBACK_DAYS = 3
const MAX_APPEARANCES_PER_WEEK = 2
// Huvudeventet har ett generösare tak än slides: ett event som fått några
// slides i veckan får fortfarande bli hero när det är dess dag, men ett som
// legat i halva veckans poster (långkörare) ska inte kunna det.
const MAX_PRIMARY_APPEARANCES_PER_WEEK = 3

// Bildgate för vykortet: fotot visas som mest ~884 px brett, så källan får
// skalas upp högst så här mycket (efter att extrema format klämts).
const MAX_PHOTO_UPSCALE = 1.6
const ABSOLUTE_MIN_SIDE = 400 // golv mot rena tumnaglar

export interface RankingResult {
  primaryCandidates: number[] // Event-id:n i prioritetsordning (bäst först)
  alsoToday: number[] // Event-id:n för "Det händer också"-listan
}

export interface RecentlyFeatured {
  recentPrimaryIds: Map<number, string> // event_id -> post_date (senaste)
  recentMentionIds: Map<number, string> // primär ELLER också-listad -> post_date
  recentPrimaryNames: Map<string, string> // normaliserat eventnamn -> post_date
  recentMentionNames: Map<string, string> // normaliserat namn -> senaste datum i NÅGON roll
  appearanceDatesByName: Map<string, Set<string>> // normaliserat namn -> alla datum eventet synts
}

/**
 * Normalisera eventnamn för dubblettjämförelse. Återkommande event (t.ex.
 * en utställning som pågår flera dagar) får ETT event-id PER DAG av
 * scrapern, så id-jämförelse räcker inte - samma namn inom 7 dagar måste
 * också blockeras (19 jul postades id 6985, 21 jul id 6986 - samma event).
 */
export function normalizeEventName(name: string): string {
  return name
    .toLowerCase()
    .replace(/["'"''`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ============ Tid/datum (Europe/Stockholm, via Intl - ingen extra dependency) ============

function stockholmParts(date: Date): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24 }
}

/** Aktuell timme (0-23) i Europe/Stockholm */
export function getStockholmHour(now: Date = new Date()): number {
  return stockholmParts(now).hour
}

/** Dagens datum i Europe/Stockholm som YYYY-MM-DD */
export function getStockholmDateString(now: Date = new Date()): string {
  const { year, month, day } = stockholmParts(now)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Gränser för dagens kalenderdag i Europe/Stockholm som NAIVA lokaltidssträngar.
 *
 * OBS: events.date_time lagras som timestamp UTAN tidszon i svensk lokaltid
 * (t.ex. "2026-07-17T22:30:00"), så filtreringen måste ske med naiva strängar -
 * UTC-baserade gränser drar in gårdagskvällens event och tappar dagens sena.
 */
export function getStockholmDayRange(now: Date = new Date()): { start: string; end: string } {
  const today = getStockholmDateString(now)
  const tomorrow = getStockholmDateString(new Date(now.getTime() + 24 * 3600_000))
  return { start: `${today}T00:00:00`, end: `${tomorrow}T00:00:00` }
}

// ============ Datahämtning ============

/**
 * Event som aldrig ska med i Instagram-posten - varken som slide eller i
 * "Det händer också"-listan. Matchas som substring mot normaliserat eventnamn
 * (långkörare får nytt event-id varje dag, så id-blockning fungerar inte).
 * Typfall: utställningar vars bild annars återkommer dag efter dag.
 */
const EXCLUDED_EVENT_NAME_PATTERNS = [
  'tryckt!', // "TRYCKT! Grafisk konst" - daglig utställning, bilden låg med i varje post
]

export function isExcludedFromInstagram(name: string): boolean {
  const normalized = normalizeEventName(name)
  return EXCLUDED_EVENT_NAME_PATTERNS.some((pattern) => normalized.includes(pattern))
}

/** Hämta alla publicerade event som startar under dagens Stockholm-kalenderdag */
export async function getTodayEvents(supabase: SupabaseClient): Promise<Event[]> {
  const { start, end } = getStockholmDayRange()
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'published')
    .gte('date_time', start)
    .lt('date_time', end)
    .order('date_time', { ascending: true })

  if (error) {
    throw new Error(`Kunde inte hämta dagens event: ${error.message}`)
  }
  const events = (data || []) as Event[]
  const excluded = events.filter((e) => isExcludedFromInstagram(e.name))
  if (excluded.length > 0) {
    console.log(
      `  🚫 Exkluderar ${excluded.length} event från Instagram-posten: ${excluded.map((e) => e.name).join(', ')}`
    )
  }
  return events.filter((e) => !isExcludedFromInstagram(e.name))
}

/**
 * Hämta event som featurats i Instagram-poster de senaste 7 dagarna.
 * Används för variationsreglerna (undvik att posta samma event flera dagar i rad).
 */
export async function getRecentlyFeatured(supabase: SupabaseClient): Promise<RecentlyFeatured> {
  const since = new Date(Date.now() - PRIMARY_LOOKBACK_DAYS * 24 * 3600_000)
  const sinceDate = getStockholmDateString(since)

  const { data, error } = await supabase
    .from('instagram_posts')
    .select('post_date, event_id, also_event_ids, slide_event_ids, status')
    .gte('post_date', sinceDate)
    .eq('status', 'published')
    .order('post_date', { ascending: true })

  if (error) {
    throw new Error(`Kunde inte hämta Instagram-historik: ${error.message}`)
  }

  const recentPrimaryIds = new Map<number, string>()
  const recentMentionIds = new Map<number, string>()
  const datesByEventId = new Map<number, Set<string>>()
  const noteAppearance = (id: number, date: string) => {
    const dates = datesByEventId.get(id) ?? new Set<string>()
    dates.add(date)
    datesByEventId.set(id, dates)
  }
  for (const row of data || []) {
    if (row.event_id) {
      recentPrimaryIds.set(row.event_id, row.post_date)
      recentMentionIds.set(row.event_id, row.post_date)
      noteAppearance(row.event_id, row.post_date)
    }
    for (const id of row.also_event_ids || []) {
      recentMentionIds.set(id, row.post_date)
      noteAppearance(id, row.post_date)
    }
    // Event som fått en foto-slide räknas som "sedda" minst lika starkt
    // som ett textomnämnande (endast slide 1 räknas som primärt)
    for (const id of row.slide_event_ids || []) {
      recentMentionIds.set(id, row.post_date)
      noteAppearance(id, row.post_date)
    }
  }

  // Slå upp namnen på ALLA event som synts (inte bara de primära):
  // återkommande event får nya id:n varje dag, så både karensen och
  // veckotaket måste räknas på namn för att fånga långkörarna.
  const recentPrimaryNames = new Map<string, string>()
  const recentMentionNames = new Map<string, string>()
  const appearanceDatesByName = new Map<string, Set<string>>()
  const seenEventIds = [...datesByEventId.keys()]
  if (seenEventIds.length > 0) {
    const { data: namedEvents, error: nameError } = await supabase
      .from('events')
      .select('id, name')
      .in('id', seenEventIds)
    if (nameError) {
      throw new Error(`Kunde inte hämta namn för Instagram-historik: ${nameError.message}`)
    }
    const latest = (map: Map<string, string>, key: string, date: string) => {
      const known = map.get(key)
      if (!known || date > known) map.set(key, date)
    }
    for (const e of namedEvents || []) {
      const name = normalizeEventName(e.name)
      const primaryDate = recentPrimaryIds.get(e.id)
      if (primaryDate) latest(recentPrimaryNames, name, primaryDate)

      const dates = appearanceDatesByName.get(name) ?? new Set<string>()
      for (const date of datesByEventId.get(e.id) ?? []) {
        dates.add(date)
        latest(recentMentionNames, name, date)
      }
      appearanceDatesByName.set(name, dates)
    }
  }

  return {
    recentPrimaryIds,
    recentMentionIds,
    recentPrimaryNames,
    recentMentionNames,
    appearanceDatesByName,
  }
}

// ============ Dubblettspärrar ============

/** Senaste datum (YYYY-MM-DD) eventet synts i en post, '' om aldrig */
export function lastAppearance(event: Event, recent: RecentlyFeatured): string {
  const byName = recent.recentMentionNames.get(normalizeEventName(event.name)) || ''
  const byId = recent.recentMentionIds.get(event.id) || ''
  return byId > byName ? byId : byName
}

/** Antal dagar eventet (matchat på namn) synts i en post senaste veckan */
export function appearanceCount(event: Event, recent: RecentlyFeatured): number {
  return recent.appearanceDatesByName.get(normalizeEventName(event.name))?.size ?? 0
}

/** Har eventet nått veckotaket för antal visningar? Hård spärr. */
export function hasHitWeeklyCap(event: Event, recent: RecentlyFeatured): boolean {
  return appearanceCount(event, recent) >= MAX_APPEARANCES_PER_WEEK
}

/**
 * Får eventet komma med som karusell-slide (2-N)? Blockeras av veckotaket
 * eller av att det synts inom karensen. Slide 1 har egna regler nedan.
 */
export function isSlideRepeatBlocked(event: Event, recent: RecentlyFeatured): boolean {
  if (hasHitWeeklyCap(event, recent)) return true
  const last = lastAppearance(event, recent)
  return !!last && last >= daysAgoDateString(SLIDE_LOOKBACK_DAYS)
}

/**
 * Får eventet bli huvudevent (slide 1)? Nej om det varit primärt senaste 7
 * dagarna (id ELLER namn), och nej om det synts i posterna för många dagar
 * den senaste veckan - då är det en långkörare som redan fått sin plats.
 */
export function isPrimaryRepeatBlocked(event: Event, recent: RecentlyFeatured): boolean {
  const wasPrimary =
    recent.recentPrimaryIds.has(event.id) ||
    recent.recentPrimaryNames.has(normalizeEventName(event.name))
  return wasPrimary || appearanceCount(event, recent) >= MAX_PRIMARY_APPEARANCES_PER_WEEK
}

/**
 * Öppningsraderna från de senaste 7 publicerade captionsen. Skickas till
 * caption-prompten så att inledningen (och dess emoji) varieras dag för dag.
 */
export async function getRecentCaptionOpenings(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('instagram_posts')
    .select('caption')
    .eq('status', 'published')
    .order('post_date', { ascending: false })
    .limit(7)

  if (error) {
    console.warn(`  ⚠️ Kunde inte hämta caption-historik: ${error.message}`)
    return []
  }
  return (data || [])
    .map((row) => (row.caption || '').split('\n')[0].trim())
    .filter(Boolean)
}

/** Datum X dagar bakåt (Stockholm) som YYYY-MM-DD, för lookback-jämförelser */
function daysAgoDateString(days: number): string {
  return getStockholmDateString(new Date(Date.now() - days * 24 * 3600_000))
}

// ============ Steg 1: Ranking ============

/**
 * "HH:MM", eller null för midnatt (00:00 = heldagsevent/okänd tid).
 * date_time är naiv svensk lokaltid ("2026-07-18T19:30:00") - läs tiden
 * direkt ur strängen i stället för att Date-parsa (som tolkar i körmiljöns
 * tidszon och blir fel på t.ex. GitHub Actions-runners i UTC).
 */
function formatTime(dateTime: string): string | null {
  const time = dateTime.substring(11, 16)
  return !time || time === '00:00' ? null : time
}

/**
 * Bygg kompakt eventbeskrivning för prompterna.
 * OBS: inga URL:er (booking_url/event_website/organizer_event_url) skickas med.
 */
function eventSummary(event: Event, recentlyMentioned: boolean): string {
  const desc = (event.description || '').replace(/\s+/g, ' ').substring(0, 200)
  const parts = [
    `id: ${event.id}`,
    `namn: ${event.name}`,
    `tid: ${formatTime(event.date_time) ?? 'hela dagen'}`,
    `plats: ${event.venue_name || event.location}`,
    `kategorier: ${(event.categories || []).join(', ') || 'okänd'}`,
    `gratis: ${event.is_free === true ? 'ja' : event.is_free === false ? 'nej' : 'okänt'}`,
    `har_bild: ${event.image_url ? 'ja' : 'nej'}`,
    recentlyMentioned ? 'nyligen_visad_pa_instagram: ja' : null,
    desc ? `beskrivning: ${desc}` : null,
  ].filter(Boolean)
  return parts.join(' | ')
}

/** Generisk retry-wrapper för OpenAI-anrop (exponential backoff på 429) */
async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 4): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (error: unknown) {
      const status = (error as { status?: number }).status
      if (status === 429 && i < retries - 1) {
        const waitTime = Math.pow(2, i) * 3000
        console.log(`  ⏳ Rate limit (${label}, försök ${i + 1}/${retries}), väntar ${waitTime / 1000}s...`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      } else {
        throw error
      }
    }
  }
  throw new Error(`Max retries exceeded (${label})`)
}

/**
 * Steg 1: Ranka dagens event efter Instagram-potential.
 * Event som varit primära senaste 7 dagarna är bortfiltrerade i förväg
 * (kodenforcerat) och event som nämnts senaste 2 dagarna flaggas i prompten.
 */
export async function rankEvents(
  events: Event[],
  recentlyFeatured: RecentlyFeatured
): Promise<RankingResult> {
  const eventById = new Map(events.map((e) => [e.id, e]))
  const alsoCutoff = daysAgoDateString(ALSO_LOOKBACK_DAYS)
  // Namnmedveten karens: id-jämförelsen ensam ser långkörare som nya event
  // varje dag och släppte därför igenom samma event dag efter dag.
  const isRecentlyMentioned = (id: number) => {
    const event = eventById.get(id)
    if (!event) return false
    const last = lastAppearance(event, recentlyFeatured)
    return !!last && last >= alsoCutoff
  }
  // Veckotaket är en hård spärr (karensen kan fyllas på bort nedan, taket inte)
  const isCapped = (id: number) => {
    const event = eventById.get(id)
    return !!event && hasHitWeeklyCap(event, recentlyFeatured)
  }

  // Variationsregel: event som varit primärt senaste 7 dagarna (på id ELLER
  // namn) och långkörare som redan synts för många dagar i veckans poster
  // utesluts ur primärkandidaturen.
  const lastFeatured = (e: Event) =>
    recentlyFeatured.recentPrimaryIds.get(e.id) ||
    recentlyFeatured.recentPrimaryNames.get(normalizeEventName(e.name)) ||
    ''
  const primaryEligible = events.filter((e) => !isPrimaryRepeatBlocked(e, recentlyFeatured))
  // Fallback (lugn dag med bara långkörare): tillåt alla, minst nyligen visade först
  const primaryPool =
    primaryEligible.length > 0
      ? primaryEligible
      : [...events].sort((a, b) => lastFeatured(a).localeCompare(lastFeatured(b)))

  if (primaryEligible.length === 0 && events.length > 0) {
    console.warn('  ⚠️ Alla dagens event är blockerade av variationsreglerna - använder minst nyligen visade')
  }

  const eventList = events.map((e) => eventSummary(e, isRecentlyMentioned(e.id))).join('\n')
  const primaryIds = primaryPool.map((e) => e.id)

  const prompt = `Här är alla event som händer i Varberg idag:

${eventList}

Ranka eventen efter hur bra de skulle fungera i ett Instagram-inlägg för en lokal eventguide.

VIKTIGAST - prioritetsordning för HUVUDEVENT (coolast först). Välj alltid från en högre nivå om det finns ett event där med bild:
1. Konserter & livemusik
2. Festivaler & större evenemang
3. Nattliv, klubb & DJ
4. Teater, show & standup
5. Sportmatcher & tävlingar
6. Mat- & dryckesevent, marknader
7. Film, bio & föreläsningar
8. Konst & utställningar
9. Barn- & familjeaktiviteter, djur & natur
10. Guidade visningar & vandringar

Övriga bedömningskriterier:
- Visuell potential (har_bild: ja är ett stort plus - bilden blir inläggets foto)
- Speciella/unika event (engångstillfällen) > pågående långkörare (utställningar som visas många dagar i rad)
- Event med nyligen_visad_pa_instagram: ja ska HELST INTE väljas till "also_today" - variera innehållet

Välj:
1. "primary_candidates": de 3 bästa kandidaterna till HUVUDEVENT, i ordning (bäst först). Huvudeventet MÅSTE ha har_bild: ja. Du får ENDAST välja bland dessa id:n: [${primaryIds.join(', ')}]
2. "also_today": 4-7 andra event-id:n till inläggets lista "Mer i dag", i prioritetsordning. De TRE FÖRSTA visas stort som dagens topp tre - välj dagens bästa där och gärna olika kategorier. Inte samma som huvudkandidaterna, föredra sådana utan nyligen_visad-flagga. Event utan bild går bra i listan.

Svara ENDAST med JSON:
{ "primary_candidates": [id, id, id], "also_today": [id, id, id, id, id] }`

  const response = await withRetry(
    () =>
      getOpenAIClient().chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'Du är social media-redaktör för en lokal eventguide i Varberg. Du väljer vilka event som passar bäst på Instagram. Svara endast med JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 350,
        response_format: { type: 'json_object' },
        posthogProperties: { feature: 'instagram-event-ranking' },
      }),
    'instagram-event-ranking'
  )

  const content = response.choices[0]?.message?.content?.trim()
  if (!content) throw new Error('Tomt svar från AI (ranking)')

  const parsed = JSON.parse(content)
  const validIds = new Set(events.map((e) => e.id))
  const primaryIdSet = new Set(primaryIds)

  // Whitelist-validering: bara id:n som faktiskt finns i input
  const primaryCandidates: number[] = (parsed.primary_candidates || [])
    .filter((id: unknown): id is number => typeof id === 'number' && primaryIdSet.has(id))
    .filter((id: number) => {
      const event = events.find((e) => e.id === id)
      return !!event?.image_url // Huvudeventet måste ha bild
    })

  let alsoToday: number[] = (parsed.also_today || [])
    .filter((id: unknown): id is number => typeof id === 'number' && validIds.has(id))
    .filter((id: number) => !primaryCandidates.includes(id))
    .filter((id: number) => !isCapped(id))

  // Kodenforcerad variationsregel för "också"-listan: undvik event nämnda
  // senaste 2 dagarna om listan ändå får minst MIN_ALSO_COUNT poster
  const fresh = alsoToday.filter((id) => !isRecentlyMentioned(id))
  if (fresh.length >= MIN_ALSO_COUNT) {
    alsoToday = fresh
  } else {
    // Fyll på med minst nyligen visade av de bortfiltrerade
    const stale = alsoToday
      .filter((id) => isRecentlyMentioned(id))
      .sort((a, b) =>
        (recentlyFeatured.recentMentionIds.get(a) || '').localeCompare(
          recentlyFeatured.recentMentionIds.get(b) || ''
        )
      )
    alsoToday = [...fresh, ...stale.slice(0, MIN_ALSO_COUNT - fresh.length)]
  }
  alsoToday = alsoToday.slice(0, MAX_ALSO_COUNT)

  // Fallback om AI:n inte gav giltiga primärkandidater: ta event med bild ur poolen
  if (primaryCandidates.length === 0) {
    console.warn('  ⚠️ AI-rankingen gav inga giltiga primärkandidater - använder fallback')
    primaryPool
      .filter((e) => e.image_url)
      .slice(0, 3)
      .forEach((e) => primaryCandidates.push(e.id))
  }

  if (primaryCandidates.length === 0) {
    throw new Error('Inga event med bild tillgängliga som huvudevent')
  }

  return { primaryCandidates, alsoToday }
}

// ============ Steg 2: Bildvalidering + vision-granskning ============

/**
 * ImageKit-URL:er (ik.imagekit.io, som eventbilderna serveras via) har en
 * ?tr=...w-1440,h-660-transformation som beskär ALLA bilder till banner -
 * det är den croppen som gjorde gamla posterna 16:9-fula. Stryk
 * transformationen så att kvalitetsbedömning, vision-granskning och
 * kvadrat-crop utgår från originalbilden (dimensionerna i filnamnet,
 * t.ex. w-1536h-1811, är originalets).
 */
export function originalImageUrl(imageUrl: string): string {
  try {
    const url = new URL(imageUrl)
    if (url.hostname === 'ik.imagekit.io') {
      url.searchParams.delete('tr')
    }
    return url.toString()
  } catch {
    return imageUrl
  }
}

export interface PhotoAssessment {
  width: number
  height: number
  unreachable: boolean
  /** Räcker till ett vykort (huvudevent eller extra slide) */
  usable: boolean
}

/**
 * Hur mycket fotot måste skalas upp på vykortet. Extrema format kläms först
 * till MIN/MAX_PHOTO_ASPECT (som vid renderingen), resten visas helt.
 */
export function photoUpscale(width: number, height: number): number {
  const aspect = width / height
  const clamped = Math.min(MAX_PHOTO_ASPECT, Math.max(MIN_PHOTO_ASPECT, aspect))
  const sourceWidth = aspect > clamped ? height * clamped : width
  return photoBox(aspect).width / sourceWidth
}

/** Nåbar, avkodbar och tillräckligt stor för att bli ett vykort */
export async function assessPhoto(imageUrl: string): Promise<PhotoAssessment> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return { width: 0, height: 0, unreachable: true, usable: false }

    const buffer = Buffer.from(await response.arrayBuffer())
    const metadata = await sharp(buffer).metadata()
    let width = metadata.width ?? 0
    let height = metadata.height ?? 0
    // EXIF-orientering 5-8 = bilden är roterad 90°, bredd/höjd byter plats
    if ((metadata.orientation ?? 1) >= 5) {
      ;[width, height] = [height, width]
    }
    if (!width || !height) return { width: 0, height: 0, unreachable: true, usable: false }

    const usable = Math.min(width, height) >= ABSOLUTE_MIN_SIDE && photoUpscale(width, height) <= MAX_PHOTO_UPSCALE
    return { width, height, unreachable: false, usable }
  } catch (error) {
    console.warn(`  ⚠️ Bildbedömning misslyckades för ${imageUrl}:`, error instanceof Error ? error.message : error)
    return { width: 0, height: 0, unreachable: true, usable: false }
  }
}

export interface ImageReviewResult {
  bestEventId: number | null
  rankedEventIds: number[] // alla användbara kandidater i kvalitetsordning (bäst först)
  unusableEventIds: number[]
  standoutEventIds: number[] // riktigt snygga foton som bär ett eget extra vykort
}

/**
 * Steg 2: Vision-granska kandidaternas bilder och ranka dem efter kvalitet.
 * Ett enda multimodalt anrop med alla (för-validerade) bilder. Rankningen
 * styr valet av huvudevent (vykortet); "standout" styr extra vykort.
 */
export async function reviewImages(
  candidates: { event: Event; imageUrl: string }[]
): Promise<ImageReviewResult> {
  if (candidates.length === 0) return { bestEventId: null, rankedEventIds: [], unusableEventIds: [], standoutEventIds: [] }
  if (candidates.length === 1) {
    const id = candidates[0].event.id
    return { bestEventId: id, rankedEventIds: [id], unusableEventIds: [], standoutEventIds: [] }
  }

  const imageContent = candidates.flatMap((c, i) => [
    { type: 'text' as const, text: `Bild ${i + 1} (event_id ${c.event.id}, "${c.event.name}"):` },
    { type: 'image_url' as const, image_url: { url: c.imageUrl } },
  ])

  const response = await withRetry(
    () =>
      getOpenAIClient().chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Granska dessa eventbilder för ett Instagram-inlägg för en lokal eventguide. Den bästa bilden blir inläggets vykort (huvudbild). Rangordna ALLA bilder efter hur bra de fungerar (bäst först).

Kriterier:
- Skarp och visuellt tilltalande (inte suddig, mörk eller lågupplöst)
- Inte en placeholder, logotyp eller ren textskylt
- Eventaffischer med text är OK, men riktiga foton föredras om kvaliteten är jämförbar (inlägget har redan en egen rubrik)
- Flagga bilder som är helt oanvändbara (trasiga, oigenkännliga, placeholder) - de ska inte med i quality_order

Välj också "standout_event_ids": de 0-2 bilder som är RIKTIGT snygga foton (inte affischer med mycket text) och skulle bära en egen extra slide. Var sträng - de flesta dagar är svaret tomt eller en bild.

Svara ENDAST med JSON:
{ "best_event_id": <id>, "quality_order": [<id>, <id>, ...], "unusable_event_ids": [<id>, ...], "standout_event_ids": [<id>, ...] }`,
              },
              ...imageContent,
            ],
          },
        ],
        max_tokens: 200,
        response_format: { type: 'json_object' },
        posthogProperties: { feature: 'instagram-image-review' },
      }),
    'instagram-image-review'
  )

  const content = response.choices[0]?.message?.content?.trim()
  if (!content) throw new Error('Tomt svar från AI (bildgranskning)')

  const parsed = JSON.parse(content)
  const validIds = new Set(candidates.map((c) => c.event.id))

  const unusableEventIds: number[] = (parsed.unusable_event_ids || []).filter(
    (id: unknown): id is number => typeof id === 'number' && validIds.has(id)
  )
  let bestEventId: number | null =
    typeof parsed.best_event_id === 'number' && validIds.has(parsed.best_event_id)
      ? parsed.best_event_id
      : null
  if (bestEventId !== null && unusableEventIds.includes(bestEventId)) {
    bestEventId = null
  }

  // Kvalitetsordning: whitelist-validera, dedupa och stryk oanvändbara.
  // Kandidater som modellen utelämnat läggs sist i inmatningsordning
  // (defensivt - de ska hellre bli sena slides än försvinna helt).
  const unusable = new Set(unusableEventIds)
  const rankedEventIds: number[] = []
  const seen = new Set<number>()
  const pushRanked = (id: number) => {
    if (validIds.has(id) && !unusable.has(id) && !seen.has(id)) {
      seen.add(id)
      rankedEventIds.push(id)
    }
  }
  if (bestEventId !== null) pushRanked(bestEventId)
  for (const id of parsed.quality_order || []) {
    if (typeof id === 'number') pushRanked(id)
  }
  for (const c of candidates) pushRanked(c.event.id)

  const standoutEventIds: number[] = [
    ...new Set<number>(
      (parsed.standout_event_ids || []).filter(
        (id: unknown): id is number => typeof id === 'number' && validIds.has(id) && !unusable.has(id)
      )
    ),
  ].slice(0, 2)

  return { bestEventId, rankedEventIds, unusableEventIds, standoutEventIds }
}

// ============ Steg 3: Caption ============

/**
 * Stryk rader som innehåller URL:er eller domännamn (utom ivarberg.nu/.se).
 * Skyddsnät för innehållsregeln: aldrig hänvisa till arrangörers egna sidor.
 */
export function sanitizeCaption(caption: string): { caption: string; hadViolations: boolean } {
  const urlPattern = /(https?:\/\/|www\.|\b[a-zA-ZåäöÅÄÖ0-9-]+\.(se|com|nu|net|org|io)\b)/i
  let hadViolations = false
  const lines = caption.split('\n').filter((line) => {
    const withoutIvarberg = line.replace(/ivarberg(\.(se|nu))?/gi, '')
    if (urlPattern.test(withoutIvarberg)) {
      hadViolations = true
      console.warn(`  ⚠️ Strök rad med extern hänvisning ur caption: "${line.trim()}"`)
      return false
    }
    return true
  })
  return { caption: lines.join('\n').trim(), hadViolations }
}

/**
 * Steg 3: Kort rubrik till vykortet (2-5 ord). Datum, tid och plats står
 * redan på sliden, så rubriken ska säga VAD som händer och väcka lust.
 */
export async function generateHeadline(primary: Event, avoid: string[] = []): Promise<string> {
  const avoidBlock =
    avoid.length > 0 ? `\nSkriv något annat än dessa:\n${avoid.map((a) => `- ${a}`).join('\n')}\n` : ''
  const prompt = `Skriv en rubrik till dagens Instagram-vykort för en lokal eventguide i Varberg.

EVENT:
${eventSummary(primary, false)}
${avoidBlock}
REGLER:
- 2-5 ord, max ${HEADLINE_MAX_LENGTH - 6} tecken
- Svenska, varm och lokal ton, gärna lite lekfull - men konkret om vad som händer
- Ingen emoji, inga citattecken, ingen punkt på slutet
- Skriv INTE datum, veckodag, klockslag eller plats (det står redan på bilden)
- Använd gärna eventets namn om det är kort och känt (artist, föreställning), annars beskriv upplevelsen
- Exempel på ton: "Jazz på fästningen", "Binda julkrans med ett glas vin", "Nisse Hallberg är tillbaka"

Svara ENDAST med JSON: { "headline": "..." }`

  const response = await withRetry(
    () =>
      getOpenAIClient().chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: 'Du är social media-redaktör för ivarberg.nu och skriver korta, träffsäkra svenska rubriker. Svara endast med JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.9,
        max_tokens: 60,
        response_format: { type: 'json_object' },
        posthogProperties: { feature: 'instagram-headline' },
      }),
    'instagram-headline'
  )

  const content = response.choices[0]?.message?.content?.trim()
  let headline = ''
  try {
    headline = String(JSON.parse(content || '{}').headline || '')
  } catch {
    headline = ''
  }
  headline = stripEmoji(headline).replace(/^["'”“]+|["'”“.!]+$/g, '').trim()
  if (!headline) headline = stripEmoji(primary.name)
  if (headline.length > HEADLINE_MAX_LENGTH) {
    headline = headline.slice(0, HEADLINE_MAX_LENGTH).replace(/\s+\S*$/, '')
  }
  return headline
}

/**
 * Steg 4: Generera den svenska captionen (med variation mot senaste dagarnas
 * öppningar). Listan över dagens övriga event står på slide 2, så captionen
 * hålls kort och hänvisar dit.
 */
export async function generateCaption(
  primary: Event,
  listEvents: Event[],
  recentOpenings: string[] = []
): Promise<string> {
  const listText = listEvents
    .map((e) => {
      const time = formatTime(e.date_time)
      return `- ${e.name} (${e.venue_name || e.location}${time ? `, kl ${time}` : ''})`
    })
    .join('\n')

  const recentOpeningsBlock =
    recentOpenings.length > 0
      ? `\nDE SENASTE DAGARNAS ÖPPNINGSRADER (skriv något som känns ANNORLUNDA än alla dessa - annan formulering OCH annan emoji):\n${recentOpenings.map((o) => `- ${o}`).join('\n')}\n`
      : ''

  const prompt = `Skriv en Instagram-caption för dagens inlägg från en lokal eventguide för Varberg.

Inlägget är en karusell: första bilden är ett vykort för HUVUDEVENTET, nästa bild är en lista "Mer i dag" med eventen under ÖVRIGA EVENT.

HUVUDEVENT:
${eventSummary(primary, false)}

ÖVRIGA EVENT IDAG (står på bild 2):
${listText || '(inga)'}
${recentOpeningsBlock}
Struktur (följ exakt):
1. Öppningsrad: kort och catchig, budskapet "det här händer i Varberg idag" - men VARIERA formuleringen. Låt gärna huvudeventet färga tonen och välj emoji som matchar eventets karaktär (konsert 🎸🎶, teater/show 🎭, konst 🎨, mat 🍴, marknad 🛍️, sport ⚽, utomhus/sommar ☀️🌊, kvällsevent ✨🌙 osv). Använd INTE 🎉 som slentrianval.
2. 1-2 entusiastiska meningar om huvudeventet (namn, plats, tid) - variera även här, börja inte alltid med eventnamnet
3. ${listText ? 'En mening som lockar att svepa till listan, gärna med en av de övriga eventen som smakprov (t.ex. "Svep för fler tips - från julmarknad till innebandy 👉")' : 'Hoppa över denna punkt'}
4. Avslutning: "Allt som händer idag hittar du på ivarberg.nu 👉 länk i bio"
5. 3-5 relevanta svenska hashtags (t.ex. #varberg #ivarberg + eventrelevanta)

ABSOLUTA REGLER:
- Skriv på svenska, varm och lokal ton, sparsamt med emojis (2-4 totalt utöver de i mallen)
- Använd INTE markdown-formatering (inga asterisker, fetstil eller kursiv) - Instagram renderar ren text
- Ingen punktlista över eventen - den står redan på bilden
- Utelämna klockslag för event utan angiven tid (skriv inte "kl 00:00")
- Nämn ALDRIG arrangörens webbplats, biljettsida eller några URL:er/länkar
- Enda hänvisningen är ivarberg.nu ("länk i bio"). Skriv alltid tjänstens namn som "ivarberg.nu", aldrig "iVarberg"
- Uppmana INTE till att köpa biljetter någonstans - ivarberg.nu är enda vägen
- Max 900 tecken

Svara ENDAST med captionen, ingen annan text.`

  const response = await withRetry(
    () =>
      getOpenAIClient().chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'Du är social media-redaktör för ivarberg.nu, en lokal eventguide för Varberg. Du skriver engagerande svenska Instagram-captions. Du hänvisar aldrig till externa webbplatser - all trafik ska till ivarberg.nu (länk i bio).',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.9,
        max_tokens: 600,
        posthogProperties: { feature: 'instagram-caption' },
      }),
    'instagram-caption'
  )

  let caption = response.choices[0]?.message?.content?.trim()
  if (!caption) throw new Error('Tomt svar från AI (caption)')

  // Instagram renderar inte markdown - strippa ev. fetstil/kursiv
  caption = caption.replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1').replace(/_{2}([^_\n]+)_{2}/g, '$1')

  // Innehållsregel: stryk externa hänvisningar (kodenforcerat skyddsnät)
  const sanitized = sanitizeCaption(caption)
  caption = sanitized.caption
  if (sanitized.hadViolations) {
    await alertService.alert({
      severity: 'info',
      category: 'openai',
      title: 'Instagram-caption innehöll extern hänvisning',
      message: 'AI-genererad caption innehöll URL/domän som ströks automatiskt.',
      source: 'instagram-post-service',
    })
  }

  if (caption.length > MAX_CAPTION_LENGTH) {
    caption = caption.substring(0, MAX_CAPTION_LENGTH - 1) + '…'
  }
  return caption
}

// ============ Uppladdning ============

const STORAGE_BUCKET = 'instagram-posts'

async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  // Skapa bucketen om den inte finns (publik läsning krävs för Instagram)
  const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, { public: true })
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Kunde inte skapa storage-bucket: ${error.message}`)
  }
}

async function uploadJpeg(supabase: SupabaseClient, path: string, jpeg: Buffer): Promise<string> {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, jpeg, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`Kunde inte ladda upp ${path}: ${error.message}`)
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Hämta en bild, cover-beskär den (attention) till width x height som JPEG och
 * ladda upp till bucketen under `path`. Används av Torsdagsbrevets mejlbilder.
 */
export async function uploadCroppedImage(
  supabase: SupabaseClient,
  imageUrl: string,
  path: string,
  width: number,
  height: number
): Promise<string> {
  const response = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`Kunde inte hämta bilden (${response.status}): ${imageUrl}`)
  const jpeg = await sharp(Buffer.from(await response.arrayBuffer()), { failOn: 'error' })
    .rotate()
    .resize({ width, height, fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()
  await ensureBucket(supabase)
  return uploadJpeg(supabase, path, jpeg)
}

/**
 * Ladda upp dagens färdigritade slides som `{postDate}-{n}.jpg`. Rensar först
 * gamla filer med samma datumprefix (tidigare försök, förhandsbilden till
 * notisen) - upsert kan skriva över men aldrig krympa mängden filer.
 */
export async function uploadSlideImages(
  supabase: SupabaseClient,
  slides: Buffer[],
  postDate: string
): Promise<string[]> {
  await ensureBucket(supabase)
  const { data: existingFiles } = await supabase.storage.from(STORAGE_BUCKET).list('', { search: postDate })
  const stalePaths = (existingFiles || []).map((f) => f.name).filter((name) => name.startsWith(postDate))
  if (stalePaths.length > 0) {
    await supabase.storage.from(STORAGE_BUCKET).remove(stalePaths)
  }
  const urls: string[] = []
  for (const [i, jpeg] of slides.entries()) {
    urls.push(await uploadJpeg(supabase, `${postDate}-${i + 1}.jpg`, jpeg))
  }
  return urls
}

/** Förhandsbild av vykortet till ntfy-notisen (`{postDate}-preview.jpg`, rensas vid publicering) */
export async function uploadPreviewImage(supabase: SupabaseClient, jpeg: Buffer, postDate: string): Promise<string> {
  await ensureBucket(supabase)
  return uploadJpeg(supabase, `${postDate}-preview.jpg`, jpeg)
}
