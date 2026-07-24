/**
 * Service för den dagliga automatiska Instagram-posten:
 * "Det här händer i Varberg idag".
 *
 * AI-pipeline (gpt-4o-mini, alla anrop PostHog-mätta via openai-client):
 *   1. rankEvents()      - rankar dagens event efter Instagram-potential
 *   2. reviewImages()    - vision-granskar toppkandidaternas bilder
 *   3. generateCaption() - skriver den svenska captionen
 *
 * VIKTIG INNEHÅLLSREGEL: captions får ALDRIG hänvisa till arrangörens egen
 * webbplats eller biljettsida. Enda CTA är iVarberg ("länk i bio").
 * Därför skickas booking_url/event_website/organizer_event_url aldrig med
 * i prompterna, och sanitizeCaption() stryker rader med URL:er/domäner.
 */
import sharp from 'sharp'
import { SupabaseClient } from '@supabase/supabase-js'
import { Event } from '@/types/database'
import { getOpenAIClient } from './openai-client'
import { alertService } from './alert-service'

const MODEL = 'gpt-4o-mini'
const MAX_CAPTION_LENGTH = 2200
const PRIMARY_LOOKBACK_DAYS = 7 // Event som varit primärt inom X dagar får inte bli det igen
const ALSO_LOOKBACK_DAYS = 2 // Event som nämnts inom X dagar undviks i "också"-listan
const MIN_ALSO_COUNT = 3
const MAX_ALSO_COUNT = 6

// Karusell: min 1, max 5 slides per post
export const MAX_SLIDES = 5
export const MAX_VISION_CANDIDATES = 8 // tak på bilder i vision-anropet

// Bildkvalitet: alla slides croppas till kvadrat, så källbilden måste vara
// nära 1:1 (retention = min(w,h)/max(w,h) = andel av långsidan som överlever
// croppen). 4:5=0.8, 4:3=0.75, 3:2=0.667 klarar strikta gaten; 16:9=0.5625
// gör det inte. Relaxed-nivån släpper in 16:9 som sista utväg för slide 1.
const MIN_CROP_RETENTION = 0.65
const RELAXED_CROP_RETENTION = 0.55
// Kortaste sida styr uppskalningen till 1080x1080: 800 → max ~1.35x
const MIN_SOURCE_SIDE = 800
const RELAXED_SOURCE_SIDE = 640

export interface RankingResult {
  primaryCandidates: number[] // Event-id:n i prioritetsordning (bäst först)
  alsoToday: number[] // Event-id:n för "Det händer också"-listan
}

export interface RecentlyFeatured {
  recentPrimaryIds: Map<number, string> // event_id -> post_date (senaste)
  recentMentionIds: Map<number, string> // primär ELLER också-listad -> post_date
  recentPrimaryNames: Map<string, string> // normaliserat eventnamn -> post_date
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
  return (data || []) as Event[]
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
  for (const row of data || []) {
    if (row.event_id) {
      recentPrimaryIds.set(row.event_id, row.post_date)
      recentMentionIds.set(row.event_id, row.post_date)
    }
    for (const id of row.also_event_ids || []) {
      recentMentionIds.set(id, row.post_date)
    }
    // Event som fått en foto-slide räknas som "sedda" minst lika starkt
    // som ett textomnämnande (endast slide 1 räknas som primärt)
    for (const id of row.slide_event_ids || []) {
      recentMentionIds.set(id, row.post_date)
    }
  }

  // Slå upp namnen på nyligen primära event: återkommande event får nya
  // id:n varje dag, så dubbletter måste även blockeras på namn.
  const recentPrimaryNames = new Map<string, string>()
  if (recentPrimaryIds.size > 0) {
    const { data: namedEvents, error: nameError } = await supabase
      .from('events')
      .select('id, name')
      .in('id', [...recentPrimaryIds.keys()])
    if (nameError) {
      throw new Error(`Kunde inte hämta namn för Instagram-historik: ${nameError.message}`)
    }
    for (const e of namedEvents || []) {
      recentPrimaryNames.set(normalizeEventName(e.name), recentPrimaryIds.get(e.id)!)
    }
  }

  return { recentPrimaryIds, recentMentionIds, recentPrimaryNames }
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
  const alsoCutoff = daysAgoDateString(ALSO_LOOKBACK_DAYS)
  const isRecentlyMentioned = (id: number) => {
    const date = recentlyFeatured.recentMentionIds.get(id)
    return !!date && date >= alsoCutoff
  }

  // Variationsregel: event som varit primärt senaste 7 dagarna utesluts ur
  // primärkandidaturen - både på id OCH på namn (återkommande event får
  // nya id:n varje dag av scrapern).
  const lastFeatured = (e: Event) =>
    recentlyFeatured.recentPrimaryIds.get(e.id) ||
    recentlyFeatured.recentPrimaryNames.get(normalizeEventName(e.name)) ||
    ''
  const primaryEligible = events.filter((e) => !lastFeatured(e))
  // Fallback (lugn dag med bara långkörare): tillåt alla, minst nyligen visade först
  const primaryPool =
    primaryEligible.length > 0
      ? primaryEligible
      : [...events].sort((a, b) => lastFeatured(a).localeCompare(lastFeatured(b)))

  if (primaryEligible.length === 0 && events.length > 0) {
    console.warn('  ⚠️ Alla dagens event har varit primära senaste 7 dagarna - använder minst nyligen visade')
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
2. "also_today": 3-6 andra event-id:n som listas under "Det händer också" (inte samma som huvudkandidaterna, föredra sådana utan nyligen_visad-flagga)

Svara ENDAST med JSON:
{ "primary_candidates": [id, id, id], "also_today": [id, id, id, id] }`

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
        max_tokens: 300,
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

export interface ImageQualityResult {
  ok: boolean // klarar strikta gaten (slide-duglig)
  relaxedOk: boolean // klarar minst relaxed-gaten (endast primär-fallback)
  width: number
  height: number
  retention: number // min(w,h)/max(w,h) - andel som överlever kvadrat-crop
  reason?: 'unreachable' | 'too-small' | 'too-elongated'
}

/**
 * Programmatisk kvalitetsbedömning: nåbar, avkodbar, tillräcklig upplösning
 * och nära nog 1:1 för att kvadrat-croppen inte ska förstöra bilden.
 */
export async function assessImageQuality(imageUrl: string): Promise<ImageQualityResult> {
  const failed = (reason: ImageQualityResult['reason'], width = 0, height = 0, retention = 0): ImageQualityResult => ({
    ok: false,
    relaxedOk: false,
    width,
    height,
    retention,
    reason,
  })

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return failed('unreachable')

    const buffer = Buffer.from(await response.arrayBuffer())
    const metadata = await sharp(buffer).metadata()
    let width = metadata.width ?? 0
    let height = metadata.height ?? 0
    // EXIF-orientering 5-8 = bilden är roterad 90°, bredd/höjd byter plats
    if ((metadata.orientation ?? 1) >= 5) {
      ;[width, height] = [height, width]
    }
    if (!width || !height) return failed('unreachable')

    const shortSide = Math.min(width, height)
    const retention = shortSide / Math.max(width, height)

    if (shortSide < RELAXED_SOURCE_SIDE) return failed('too-small', width, height, retention)
    if (retention < RELAXED_CROP_RETENTION) return failed('too-elongated', width, height, retention)

    const strictOk = shortSide >= MIN_SOURCE_SIDE && retention >= MIN_CROP_RETENTION
    return {
      ok: strictOk,
      relaxedOk: true,
      width,
      height,
      retention,
      reason: strictOk ? undefined : shortSide < MIN_SOURCE_SIDE ? 'too-small' : 'too-elongated',
    }
  } catch (error) {
    console.warn(`  ⚠️ Bildbedömning misslyckades för ${imageUrl}:`, error instanceof Error ? error.message : error)
    return failed('unreachable')
  }
}

export interface ImageReviewResult {
  bestEventId: number | null
  rankedEventIds: number[] // alla användbara kandidater i kvalitetsordning (bäst först)
  unusableEventIds: number[]
}

/**
 * Steg 2: Vision-granska kandidaternas bilder och ranka dem efter kvalitet.
 * Ett enda multimodalt anrop med alla (för-validerade) bilder. Rankningen
 * styr både valet av primärt event (slide 1) och ordningen på övriga slides.
 */
export async function reviewImages(
  candidates: { event: Event; imageUrl: string }[]
): Promise<ImageReviewResult> {
  if (candidates.length === 0) return { bestEventId: null, rankedEventIds: [], unusableEventIds: [] }
  if (candidates.length === 1) {
    const id = candidates[0].event.id
    return { bestEventId: id, rankedEventIds: [id], unusableEventIds: [] }
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
                text: `Granska dessa eventbilder för ett Instagram-karusellinlägg för en lokal eventguide. Rangordna ALLA bilder efter hur bra de fungerar i inlägget (bäst först) - den bästa blir första sliden.

Kriterier:
- Skarp och visuellt tilltalande (inte suddig, mörk eller lågupplöst)
- Inte en placeholder, logotyp eller ren textskylt
- Eventaffischer med text är OK, men riktiga foton föredras om kvaliteten är jämförbar
- Flagga bilder som är helt oanvändbara (trasiga, oigenkännliga, placeholder) - de ska inte med i quality_order

Svara ENDAST med JSON:
{ "best_event_id": <id>, "quality_order": [<id>, <id>, ...], "unusable_event_ids": [<id>, ...] }`,
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

  return { bestEventId, rankedEventIds, unusableEventIds }
}

// ============ Steg 3: Caption ============

/**
 * Stryk rader som innehåller URL:er eller domännamn (utom ivarberg).
 * Skyddsnät för innehållsregeln: aldrig hänvisa till arrangörers egna sidor.
 */
export function sanitizeCaption(caption: string): { caption: string; hadViolations: boolean } {
  const urlPattern = /(https?:\/\/|www\.|\b[a-zA-ZåäöÅÄÖ0-9-]+\.(se|com|nu|net|org|io)\b)/i
  let hadViolations = false
  const lines = caption.split('\n').filter((line) => {
    const withoutIvarberg = line.replace(/ivarberg(\.se)?/gi, '')
    if (urlPattern.test(withoutIvarberg)) {
      hadViolations = true
      console.warn(`  ⚠️ Strök rad med extern hänvisning ur caption: "${line.trim()}"`)
      return false
    }
    return true
  })
  return { caption: lines.join('\n').trim(), hadViolations }
}

/** Steg 3: Generera den svenska captionen (med variation mot senaste dagarnas öppningar) */
export async function generateCaption(
  primary: Event,
  alsoEvents: Event[],
  recentOpenings: string[] = []
): Promise<string> {
  const alsoList = alsoEvents
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

HUVUDEVENT (inläggets bild är från detta event):
${eventSummary(primary, false)}

ÖVRIGA EVENT IDAG:
${alsoList || '(inga)'}
${recentOpeningsBlock}
Struktur (följ exakt):
1. Öppningsrad: kort och catchig, budskapet "det här händer i Varberg idag" - men VARIERA formuleringen. Låt gärna huvudeventet färga tonen och välj emoji som matchar eventets karaktär (konsert 🎸🎶, teater/show 🎭, konst 🎨, mat 🍴, marknad 🛍️, sport ⚽, utomhus/sommar ☀️🌊, kvällsevent ✨🌙 osv). Använd INTE 🎉 som slentrianval.
2. 1-2 entusiastiska meningar om huvudeventet (namn, plats, tid) - variera även här, börja inte alltid med eventnamnet
3. Om det finns övriga event: raden "Det händer också:" följt av punktlista (en rad per event: namn, plats, kl tid)
4. Avslutning: "Vill du se allt som händer idag? Gå in på iVarberg 👉 länk i bio"
5. 3-5 relevanta svenska hashtags (t.ex. #varberg #ivarberg + eventrelevanta)

ABSOLUTA REGLER:
- Skriv på svenska, varm och lokal ton, sparsamt med emojis (2-4 totalt utöver de i mallen)
- Använd INTE markdown-formatering (inga asterisker, fetstil eller kursiv) - Instagram renderar ren text
- Utelämna klockslag för event utan angiven tid (skriv inte "kl 00:00")
- Nämn ALDRIG arrangörens webbplats, biljettsida eller några URL:er/länkar
- Enda hänvisningen är iVarberg ("länk i bio")
- Uppmana INTE till att köpa biljetter någonstans - iVarberg är enda vägen
- Max 1800 tecken

Svara ENDAST med captionen, ingen annan text.`

  const response = await withRetry(
    () =>
      getOpenAIClient().chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'Du är social media-redaktör för iVarberg, en lokal eventguide för Varberg. Du skriver engagerande svenska Instagram-captions. Du hänvisar aldrig till externa webbplatser - all trafik ska till iVarberg (länk i bio).',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.9,
        max_tokens: 800,
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

// ============ Bildkonvertering + uppladdning ============

const STORAGE_BUCKET = 'instagram-posts'
const SQUARE_SIZE = 1080 // Instagram-nativ 1:1

/**
 * Hämta eventbilden, croppa till kvadratisk 1080x1080 JPEG och ladda upp
 * till en publik Supabase Storage-bucket som `{postDate}-{slideIndex}.jpg`.
 * Kvalitetsgaten (assessImageQuality) har redan sorterat bort bilder som
 * skulle croppas för hårt. Returnerar den publika URL:en.
 */
export async function uploadInstagramImage(
  supabase: SupabaseClient,
  imageUrl: string,
  postDate: string,
  slideIndex: number // 1-baserat
): Promise<string> {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) {
    throw new Error(`Kunde inte hämta bilden (${response.status}): ${imageUrl}`)
  }
  const sourceBuffer = Buffer.from(await response.arrayBuffer())

  // .rotate() utan argument applicerar EXIF-orienteringen före resize.
  // attention-strategin croppar mot bildens mest intressanta region.
  const jpegBuffer = await sharp(sourceBuffer, { failOn: 'error' })
    .rotate()
    .resize({
      width: SQUARE_SIZE,
      height: SQUARE_SIZE,
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()

  // Skapa bucketen om den inte finns (publik läsning krävs för Instagram)
  const { error: bucketError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: true,
  })
  if (bucketError && !/already exists/i.test(bucketError.message)) {
    throw new Error(`Kunde inte skapa storage-bucket: ${bucketError.message}`)
  }

  const path = `${postDate}-${slideIndex}.jpg`
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, jpegBuffer, { contentType: 'image/jpeg', upsert: true })
  if (uploadError) {
    throw new Error(`Kunde inte ladda upp bilden: ${uploadError.message}`)
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Ladda upp alla slides för dagens post. Rensar först gamla filer med samma
 * datumprefix (stale slides från tidigare försök + legacy `{postDate}.jpg`) -
 * upsert kan skriva över men aldrig krympa mängden filer.
 *
 * Slide 1 är obligatorisk (fel kastas vidare); fel på slide 2+ loggas och
 * den sliden släpps så att posten ändå går ut med färre bilder.
 */
export async function uploadInstagramSlides(
  supabase: SupabaseClient,
  slides: { event: Event; imageUrl: string }[],
  postDate: string
): Promise<{ event: Event; url: string }[]> {
  const { data: existingFiles } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list('', { search: postDate })
  const stalePaths = (existingFiles || [])
    .map((f) => f.name)
    .filter((name) => name.startsWith(postDate))
  if (stalePaths.length > 0) {
    await supabase.storage.from(STORAGE_BUCKET).remove(stalePaths)
  }

  const uploaded: { event: Event; url: string }[] = []
  for (const [i, slide] of slides.entries()) {
    try {
      const url = await uploadInstagramImage(supabase, slide.imageUrl, postDate, uploaded.length + 1)
      uploaded.push({ event: slide.event, url })
    } catch (error) {
      if (i === 0) throw error // primära slidens bild är obligatorisk
      console.warn(
        `  ⚠️ Slide "${slide.event.name}" kunde inte laddas upp - hoppar över:`,
        error instanceof Error ? error.message : error
      )
    }
  }
  return uploaded
}
