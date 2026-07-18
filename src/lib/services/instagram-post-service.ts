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
const MIN_IMAGE_WIDTH = 640

export interface RankingResult {
  primaryCandidates: number[] // Event-id:n i prioritetsordning (bäst först)
  alsoToday: number[] // Event-id:n för "Det händer också"-listan
}

export interface RecentlyFeatured {
  recentPrimaryIds: Map<number, string> // event_id -> post_date (senaste)
  recentMentionIds: Map<number, string> // primär ELLER också-listad -> post_date
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
    .select('post_date, event_id, also_event_ids, status')
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
  }
  return { recentPrimaryIds, recentMentionIds }
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

  // Variationsregel: event som varit primärt senaste 7 dagarna utesluts ur primärkandidaturen
  const primaryEligible = events.filter((e) => !recentlyFeatured.recentPrimaryIds.has(e.id))
  // Fallback (lugn dag med bara långkörare): tillåt alla, minst nyligen visade först
  const primaryPool =
    primaryEligible.length > 0
      ? primaryEligible
      : [...events].sort((a, b) => {
          const aDate = recentlyFeatured.recentPrimaryIds.get(a.id) || ''
          const bDate = recentlyFeatured.recentPrimaryIds.get(b.id) || ''
          return aDate.localeCompare(bDate)
        })

  if (primaryEligible.length === 0 && events.length > 0) {
    console.warn('  ⚠️ Alla dagens event har varit primära senaste 7 dagarna - använder minst nyligen visade')
  }

  const eventList = events.map((e) => eventSummary(e, isRecentlyMentioned(e.id))).join('\n')
  const primaryIds = primaryPool.map((e) => e.id)

  const prompt = `Här är alla event som händer i Varberg idag:

${eventList}

Ranka eventen efter hur bra de skulle fungera i ett Instagram-inlägg för en lokal eventguide.

Bedömningskriterier:
- Brett publikintresse (konserter, festivaler, marknader > nischade möten)
- Visuell potential (har_bild: ja är ett stort plus - bilden blir inläggets foto)
- Speciella/unika event > vardagliga återkommande aktiviteter
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

/** Programmatisk validering: nåbar, avkodbar, tillräckligt stor */
export async function validateImage(imageUrl: string): Promise<boolean> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return false

    const buffer = Buffer.from(await response.arrayBuffer())
    const metadata = await sharp(buffer).metadata()
    const width = metadata.width ?? 0
    const height = metadata.height ?? 0
    if (width < MIN_IMAGE_WIDTH || height < 300) return false
    return true
  } catch (error) {
    console.warn(`  ⚠️ Bildvalidering misslyckades för ${imageUrl}:`, error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * Steg 2: Vision-granska kandidaternas bilder och välj den bästa.
 * Ett enda multimodalt anrop med alla (för-validerade) bilder.
 */
export async function reviewImages(
  candidates: { event: Event; imageUrl: string }[]
): Promise<{ bestEventId: number | null; unusableEventIds: number[] }> {
  if (candidates.length === 0) return { bestEventId: null, unusableEventIds: [] }
  if (candidates.length === 1) return { bestEventId: candidates[0].event.id, unusableEventIds: [] }

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
                text: `Granska dessa eventbilder för ett Instagram-inlägg för en lokal eventguide. Välj den bild som fungerar BÄST som inläggets huvudbild.

Kriterier:
- Skarp och visuellt tilltalande (inte suddig, mörk eller lågupplöst)
- Inte en placeholder, logotyp eller ren textskylt
- Eventaffischer med text är OK, men riktiga foton föredras om kvaliteten är jämförbar
- Flagga bilder som är helt oanvändbara (trasiga, oigenkännliga, placeholder)

Svara ENDAST med JSON:
{ "best_event_id": <id>, "unusable_event_ids": [<id>, ...] }`,
              },
              ...imageContent,
            ],
          },
        ],
        max_tokens: 100,
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
  return { bestEventId, unusableEventIds }
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

/** Steg 3: Generera den svenska captionen */
export async function generateCaption(primary: Event, alsoEvents: Event[]): Promise<string> {
  const alsoList = alsoEvents
    .map((e) => {
      const time = formatTime(e.date_time)
      return `- ${e.name} (${e.venue_name || e.location}${time ? `, kl ${time}` : ''})`
    })
    .join('\n')

  const prompt = `Skriv en Instagram-caption för dagens inlägg från en lokal eventguide för Varberg.

HUVUDEVENT (inläggets bild är från detta event):
${eventSummary(primary, false)}

ÖVRIGA EVENT IDAG:
${alsoList || '(inga)'}

Struktur (följ exakt):
1. Öppningsrad: "Det här händer i Varberg idag! 🎉" (eller nära variant)
2. 1-2 entusiastiska meningar om huvudeventet (namn, plats, tid)
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
        temperature: 0.7,
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
// Instagrams tillåtna aspect ratios för foto-poster
const MIN_RATIO = 4 / 5 // 0.8 (porträtt)
const MAX_RATIO = 1.91 // (landskap)
const TARGET_WIDTH = 1080

/**
 * Hämta eventbilden, konvertera till Instagram-godkänd JPEG (max 1080px,
 * ratio clampad till 4:5-1.91:1) och ladda upp till en publik Supabase
 * Storage-bucket. Returnerar den publika URL som skickas till Make/Instagram.
 */
export async function uploadInstagramImage(
  supabase: SupabaseClient,
  imageUrl: string,
  postDate: string
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

  const metadata = await sharp(sourceBuffer).metadata()
  let width = metadata.width ?? 0
  let height = metadata.height ?? 0
  // EXIF-orientering 5-8 = bilden är roterad 90°, bredd/höjd byter plats
  if ((metadata.orientation ?? 1) >= 5) {
    ;[width, height] = [height, width]
  }
  if (!width || !height) {
    throw new Error('Kunde inte läsa bildens dimensioner')
  }
  const ratio = width / height

  // .rotate() utan argument applicerar EXIF-orienteringen före resize
  let pipeline = sharp(sourceBuffer, { failOn: 'error' }).rotate()
  if (ratio < MIN_RATIO) {
    // För hög (t.ex. lång affisch) → croppa till 4:5
    pipeline = pipeline.resize({
      width: TARGET_WIDTH,
      height: Math.round(TARGET_WIDTH / MIN_RATIO), // 1350
      fit: 'cover',
      position: sharp.strategy.attention,
    })
  } else if (ratio > MAX_RATIO) {
    // För bred (panorama) → croppa till 1.91:1
    pipeline = pipeline.resize({
      width: TARGET_WIDTH,
      height: Math.round(TARGET_WIDTH / MAX_RATIO), // 565
      fit: 'cover',
      position: sharp.strategy.attention,
    })
  } else {
    pipeline = pipeline.resize({ width: TARGET_WIDTH, withoutEnlargement: true })
  }
  const jpegBuffer = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer()

  // Skapa bucketen om den inte finns (publik läsning krävs för Instagram)
  const { error: bucketError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: true,
  })
  if (bucketError && !/already exists/i.test(bucketError.message)) {
    throw new Error(`Kunde inte skapa storage-bucket: ${bucketError.message}`)
  }

  const path = `${postDate}.jpg`
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, jpegBuffer, { contentType: 'image/jpeg', upsert: true })
  if (uploadError) {
    throw new Error(`Kunde inte ladda upp bilden: ${uploadError.message}`)
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}
