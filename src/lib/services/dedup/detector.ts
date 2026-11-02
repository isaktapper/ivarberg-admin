/**
 * Generisk dubblettdetektering för events.
 *
 * Används på två ställen:
 * 1. Vid import (event-importer): varje skrapat event jämförs mot databasen
 *    och mot tidigare event i samma körning. Dubletter importeras inte - i
 *    stället får det befintliga eventet källans URL och eventuella saknade
 *    fält (bild, pris, bokningslänk...).
 * 2. Nattlig städning (cleanupExisting): alla kommande event jämförs parvis
 *    och säkra dubletter slås ihop - förloraren får status 'duplicate' och
 *    pekar på vinnaren via duplicate_of. Allt loggas och kan ångras.
 *
 * Beslutsordning per par: URL → regler (matcher.ts) → AI för gråzonen.
 * Inget är ortsspecifikt: plats avgörs via koordinater och självlärda alias,
 * namnvikter räknas fram ur datan.
 *
 * Fungerar även innan migrationen ADD_GENERIC_DEDUP.sql körts: då hoppas
 * sammanslagning och nya kolumner över och bara dagens "hoppa över" görs.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScrapedEvent } from '../../scrapers/types'
import { TokenWeights } from './text'
import { VenueResolver, type VenueInput } from './venues'
import { matchEvents, minutesBetween, sourceHost, MAX_MINUTES_APART, type MatchResult } from './matcher'
import { judgeSameEvent, isConfidentSame, type AIVerdict } from './ai-judge'

export interface PoolEvent {
  id?: number // saknas för event som ännu inte sparats (samma importkörning)
  name: string
  date_time: string
  venue_name?: string | null
  location?: string | null
  organizer_event_url?: string | null
  alternate_urls?: string[] | null
  description?: string | null
  image_url?: string | null
  price?: string | null
  booking_url?: string | null
  event_website?: string | null
  is_free?: boolean | null
  status?: string
  featured?: boolean
  organizer_id?: number | null
}

export interface DuplicateMatch {
  target: PoolEvent
  decidedBy: 'url' | 'rules' | 'ai'
  match?: MatchResult
  ai?: AIVerdict | null
}

export interface CleanupSummary {
  compared: number
  merged: number
  aiCalls: number
  pairs: Array<{ keep: PoolEvent; hide: PoolEvent; decidedBy: 'rules' | 'ai'; reason: string }>
}

const POOL_COLUMNS =
  'id, name, date_time, venue_name, location, organizer_event_url, description, image_url, price, booking_url, event_website, is_free, status, featured, organizer_id'
const MATCHABLE_STATUSES = ['published', 'pending_approval', 'draft', 'cancelled']
const MAX_AI_CALLS_PER_RUN = 40
const PAGE = 1000

/** Fält som fylls i på det kanoniska eventet om de saknas där men finns på dubbletten */
const FILLABLE: Array<keyof PoolEvent> = ['image_url', 'price', 'booking_url', 'event_website', 'is_free', 'description']

export class DuplicateDetector {
  private schemaReady = false
  private pool: PoolEvent[] = []
  private urlIndex = new Map<string, PoolEvent>()
  private weights = new TokenWeights()
  private venues: VenueResolver
  private excludedPairs = new Set<string>()
  private excludedUrls = new Set<string>()
  private aiCalls = 0
  private organizerHosts = new Map<number, string>()
  private heroEventIds = new Set<number>()
  /** Poolobjekt för event som importeras i samma körning → det skrapade originalet */
  private pendingSource = new Map<PoolEvent, ScrapedEvent>()

  constructor(
    private supabase: SupabaseClient,
    private options: { dryRun?: boolean } = {}
  ) {
    this.venues = new VenueResolver(supabase, false)
  }

  get canMerge(): boolean {
    return this.schemaReady && !this.options.dryRun
  }

  /** Läser in pool, URL-index, ordvikter, platscache och ångrade par */
  async init(range: { from: string; to?: string }): Promise<void> {
    const probe = await this.supabase.from('events').select('alternate_urls').limit(1)
    this.schemaReady = !probe.error
    if (!this.schemaReady) {
      console.warn('  ⚠️ Dubblettmigrationen (ADD_GENERIC_DEDUP.sql) är inte körd - kör utan sammanslagning')
    }
    this.venues = new VenueResolver(this.supabase, this.schemaReady && !this.options.dryRun)
    await this.venues.load()

    // URL-index och ordvikter: alla event, oavsett datum
    const urlColumns = this.schemaReady ? 'id, name, organizer_event_url, alternate_urls, duplicate_of' : 'id, name, organizer_event_url'
    const all = await this.fetchAll<PoolEvent & { duplicate_of?: number | null }>(urlColumns, (q) => q)
    const byId = new Map(all.map((e) => [e.id!, e]))
    for (const e of all) {
      this.weights.add(e.name)
      const canonical = (e.duplicate_of && byId.get(e.duplicate_of)) || e
      if (e.organizer_event_url && !this.urlIndex.has(e.organizer_event_url)) this.urlIndex.set(e.organizer_event_url, canonical)
    }
    for (const e of all) for (const url of e.alternate_urls ?? []) if (!this.urlIndex.has(url)) this.urlIndex.set(url, e)

    // Kandidatpool: matchbara event i tidsintervallet (±1 dag)
    const from = shiftDate(range.from, -1)
    const to = range.to ? shiftDate(range.to, 1) : undefined
    this.pool = await this.fetchAll<PoolEvent>(this.schemaReady ? `${POOL_COLUMNS}, alternate_urls` : POOL_COLUMNS, (q) => {
      let query = q.in('status', MATCHABLE_STATUSES).gte('date_time', from)
      if (to) query = query.lte('date_time', to)
      return query
    })
    // urlIndex ska peka på fullständiga poolobjekt där de finns
    const poolById = new Map(this.pool.map((e) => [e.id!, e]))
    for (const [url, e] of this.urlIndex) if (e.id && poolById.has(e.id)) this.urlIndex.set(url, poolById.get(e.id)!)

    if (this.schemaReady) {
      const { data: undone } = await this.supabase
        .from('duplicate_event_logs')
        .select('existing_event_id, duplicate_event_id, scraped_event_url')
        .eq('action', 'undone')
      for (const u of undone ?? []) {
        if (u.duplicate_event_id) this.excludedPairs.add(pairKey(u.existing_event_id, u.duplicate_event_id))
        if (u.scraped_event_url) this.excludedUrls.add(u.scraped_event_url)
      }
    }

    console.log(`  🔎 Dubblettkontroll: ${this.pool.length} kandidater, ${this.urlIndex.size} kända URL:er`)
  }

  /** Geokodar alla platser i poolen plus de som skickas in (cachas permanent) */
  async prepareVenues(extra: VenueInput[] = []): Promise<void> {
    // Utan cachetabellen skulle varje körning geokoda om alla platser (1 anrop/s)
    if (!this.schemaReady && !this.options.dryRun) return
    await this.venues.ensureGeocoded([...this.pool, ...extra])
  }

  /** Lägg till ett event som ska importeras i samma körning, så att senare event kan matchas mot det */
  registerPending(event: ScrapedEvent): void {
    const pending: PoolEvent = { ...event, alternate_urls: event.alternate_urls ?? [] }
    this.pool.push(pending)
    this.weights.add(event.name)
    if (event.organizer_event_url) this.urlIndex.set(event.organizer_event_url, pending)
    this.pendingSource.set(pending, event)
  }

  /** Hittar ett befintligt (eller tidigare i körningen registrerat) event som det skrapade eventet är en dublett av */
  async findDuplicate(event: ScrapedEvent): Promise<DuplicateMatch | null> {
    const url = event.organizer_event_url
    if (url && this.urlIndex.has(url)) return { target: this.urlIndex.get(url)!, decidedBy: 'url' }
    if (url && this.excludedUrls.has(url)) return null
    return this.bestMatch(event, this.pool)
  }

  private async bestMatch(event: PoolEvent, candidates: PoolEvent[]): Promise<DuplicateMatch | null> {
    const scored: Array<{ target: PoolEvent; match: MatchResult }> = []
    for (const c of candidates) {
      if (c === event || (c.id !== undefined && c.id === event.id)) continue
      const minutes = minutesBetween(event.date_time, c.date_time)
      if (minutes !== null && minutes > MAX_MINUTES_APART) continue
      if (event.id && c.id && this.excludedPairs.has(pairKey(event.id, c.id))) continue
      const match = matchEvents(event, c, this.venues.relation(event, c), this.weights)
      if (match.verdict !== 'distinct') scored.push({ target: c, match })
    }
    if (scored.length === 0) return null
    scored.sort((a, b) => b.match.nameScore - a.match.nameScore)

    const sure = scored.find((s) => s.match.verdict === 'duplicate')
    if (sure) return { ...sure, decidedBy: 'rules' }

    for (const s of scored.slice(0, 2)) {
      if (this.aiCalls >= MAX_AI_CALLS_PER_RUN) break
      this.aiCalls++
      const ai = await judgeSameEvent(event, s.target, {
        minutesApart: s.match.minutesApart,
        venue: s.match.venue,
        venueMeters: s.match.venueMeters,
      })
      console.log(
        `  🤖 AI: "${event.name}" vs "${s.target.name}" → ${ai ? `${ai.same ? 'samma' : 'olika'} (${Math.round(ai.confidence * 100)}%) ${ai.explanation}` : 'inget svar'}`
      )
      if (isConfidentSame(ai)) return { ...s, decidedBy: 'ai', ai }
    }
    return null
  }

  /**
   * Hanterar ett skrapat event som visat sig vara en dublett: källans URL och
   * saknade fält förs över till målet. Returnerar en loggrad att spara (null
   * för rena URL-träffar, som inte är något beslut).
   */
  async absorbScraped(event: ScrapedEvent, dup: DuplicateMatch, scraperName: string, organizerId: number) {
    if (dup.decidedBy === 'url') return null
    const target = dup.target
    const updates = this.mergeFields(target, event)
    if (event.organizer_event_url && this.schemaReady) updates.alternate_urls = addUrls(target, [event.organizer_event_url])

    if (target.id === undefined) {
      // Målet importeras i samma körning - ändra objektet innan det sparas
      Object.assign(target, updates)
      const original = this.pendingSource.get(target)
      if (original) Object.assign(original, updates)
    } else if (this.canMerge && Object.keys(updates).length > 0) {
      const { error } = await this.supabase.from('events').update(updates).eq('id', target.id)
      if (error) console.warn(`  ⚠️ Kunde inte uppdatera event ${target.id}: ${error.message}`)
      else Object.assign(target, updates)
    }
    if (event.organizer_event_url) this.urlIndex.set(event.organizer_event_url, target)
    if (!this.options.dryRun && dup.match?.venue !== 'different') await this.maybeLearnAlias(event, target, dup)

    console.log(`  ⊘ Dublett (${dup.decidedBy}, ${dup.match?.reason}): "${event.name}" = "${target.name}"`)
    return {
      target,
      log: {
        scraper_name: scraperName,
        scraped_event_name: event.name,
        scraped_event_url: event.organizer_event_url ?? '',
        existing_event_name: target.name,
        existing_event_url: target.organizer_event_url ?? '',
        similarity_score: round2(dup.match?.nameScore ?? 1),
        match_type: dup.decidedBy,
        scraped_at: new Date().toISOString(),
        action: 'skipped',
        reasons: reasonsJson(dup),
        scraped_payload: event,
        organizer_id: organizerId,
      },
    }
  }

  /** Spara dubblettloggar; tål att migrationen inte är körd (då sparas bara de gamla kolumnerna) */
  async saveLogs(rows: Array<Record<string, unknown>>): Promise<void> {
    if (rows.length === 0 || this.options.dryRun) return
    const payload = this.schemaReady
      ? rows
      : rows.map((r) => ({
          scraper_name: r.scraper_name,
          scraped_event_name: r.scraped_event_name,
          scraped_event_url: r.scraped_event_url,
          existing_event_id: r.existing_event_id,
          existing_event_name: r.existing_event_name,
          existing_event_url: r.existing_event_url,
          similarity_score: r.similarity_score,
          match_type: 'fuzzy_name',
          scraped_at: r.scraped_at,
        }))
    const { error } = await this.supabase.from('duplicate_event_logs').insert(payload)
    if (error) console.error('  ⚠️ Kunde inte spara dubblettloggar:', error.message)
    else console.log(`  💾 Sparade ${rows.length} dubblettbeslut`)
  }

  /**
   * Nattlig städning: jämför alla kommande event parvis och slår ihop dubletter.
   * Med dryRun skrivs ingenting, men allt som skulle göras returneras.
   */
  async cleanupExisting(fromDate = new Date().toISOString().slice(0, 10)): Promise<CleanupSummary> {
    await this.init({ from: fromDate })
    this.pool = this.pool.filter((e) => e.status !== 'cancelled' && e.date_time >= fromDate)
    await this.prepareVenues()
    await this.loadCanonicalHints()

    const summary: CleanupSummary = { compared: 0, merged: 0, aiCalls: 0, pairs: [] }
    const events = [...this.pool].sort((a, b) => a.date_time.localeCompare(b.date_time))
    const hidden = new Set<number>()

    for (let i = 0; i < events.length; i++) {
      const a = events[i]
      if (hidden.has(a.id!)) continue
      // Kandidater: senare event inom tidsfönstret (heldagsevent: samma datum)
      const window: PoolEvent[] = []
      for (let j = i + 1; j < events.length; j++) {
        const b = events[j]
        if (b.date_time.slice(0, 10) > a.date_time.slice(0, 10) && minutesBetween(a.date_time, b.date_time)! > MAX_MINUTES_APART) break
        if (!hidden.has(b.id!)) window.push(b)
      }
      summary.compared += window.length
      const dup = await this.bestMatch(a, window)
      if (!dup || dup.decidedBy === 'url') continue

      const [keep, hide] = this.pickCanonical(a, dup.target)
      hidden.add(hide.id!)
      summary.pairs.push({ keep, hide, decidedBy: dup.decidedBy, reason: dup.ai?.explanation || dup.match?.reason || '' })
      if (this.canMerge) {
        await this.mergeExisting(keep, hide, dup)
        summary.merged++
      }
    }
    summary.aiCalls = this.aiCalls
    return summary
  }

  private async loadCanonicalHints(): Promise<void> {
    const { data: orgs } = await this.supabase.from('organizers').select('id, website')
    for (const o of orgs ?? []) {
      const host = sourceHost(o.website)
      if (host) this.organizerHosts.set(o.id, host)
    }
    const { data: hero } = await this.supabase.from('hero_featured_events').select('event_id')
    for (const h of hero ?? []) this.heroEventIds.add(h.event_id)
  }

  /** Vinnaren: utvald > publicerad > arrangörens egen källa > mest komplett > äldst */
  private pickCanonical(a: PoolEvent, b: PoolEvent): [PoolEvent, PoolEvent] {
    const score = (e: PoolEvent) => {
      let s = 0
      if (e.featured || this.heroEventIds.has(e.id!)) s += 1000
      if (e.status === 'published') s += 100
      const orgHost = e.organizer_id ? this.organizerHosts.get(e.organizer_id) : undefined
      if (orgHost && orgHost === sourceHost(e.organizer_event_url)) s += 10
      for (const f of FILLABLE) if (hasValue(e[f])) s += 1
      if ((e.description ?? '').length > 200) s += 1
      return s
    }
    const sa = score(a)
    const sb = score(b)
    if (sa !== sb) return sa > sb ? [a, b] : [b, a]
    return a.id! < b.id! ? [a, b] : [b, a]
  }

  private async mergeExisting(keep: PoolEvent, hide: PoolEvent, dup: DuplicateMatch): Promise<void> {
    const updates = this.mergeFields(keep, hide)
    updates.alternate_urls = addUrls(keep, [hide.organizer_event_url, ...(hide.alternate_urls ?? [])])

    const { error: keepError } = await this.supabase.from('events').update(updates).eq('id', keep.id!)
    if (keepError) {
      console.warn(`  ⚠️ Kunde inte uppdatera event ${keep.id}: ${keepError.message}`)
      return
    }
    Object.assign(keep, updates)

    const { error: hideError } = await this.supabase
      .from('events')
      .update({ status: 'duplicate', duplicate_of: keep.id })
      .eq('id', hide.id!)
    if (hideError) {
      console.warn(`  ⚠️ Kunde inte dölja event ${hide.id}: ${hideError.message}`)
      return
    }
    // Dubletter som pekade på förloraren ska peka på vinnaren
    await this.supabase.from('events').update({ duplicate_of: keep.id }).eq('duplicate_of', hide.id!)

    await this.maybeLearnAlias(hide, keep, dup)
    await this.saveLogs([
      {
        scraper_name: 'Nattlig städning',
        scraped_event_name: hide.name,
        scraped_event_url: hide.organizer_event_url ?? '',
        existing_event_id: keep.id,
        existing_event_name: keep.name,
        existing_event_url: keep.organizer_event_url ?? '',
        similarity_score: round2(dup.match?.nameScore ?? 1),
        match_type: dup.decidedBy,
        scraped_at: new Date().toISOString(),
        action: 'merged',
        duplicate_event_id: hide.id,
        previous_status: hide.status,
        reasons: reasonsJson(dup),
      },
    ])
    console.log(`  🔗 Slog ihop: "${hide.name}" (#${hide.id}) → "${keep.name}" (#${keep.id})`)
  }

  /** Fält på `from` som saknas på `into` */
  private mergeFields(into: PoolEvent, from: PoolEvent | ScrapedEvent): Record<string, unknown> {
    const updates: Record<string, unknown> = {}
    for (const f of FILLABLE) {
      const value = (from as PoolEvent)[f]
      if (!hasValue(into[f]) && hasValue(value)) updates[f] = value
    }
    return updates
  }

  /** Lär in platsalias bara från säkra regelbeslut på samma tid, så att fel inte sprids */
  private async maybeLearnAlias(a: VenueInput, b: PoolEvent, dup: DuplicateMatch): Promise<void> {
    if (dup.decidedBy !== 'rules' || dup.match?.minutesApart !== 0 || (dup.match?.nameScore ?? 0) < 0.9) return
    await this.venues.learnAlias(a, b, b.id)
  }

  private async fetchAll<T>(
    columns: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter: (q: any) => any
  ): Promise<T[]> {
    const rows: T[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await filter(this.supabase.from('events').select(columns))
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`Dubblettkontroll kunde inte läsa events: ${error.message}`)
      rows.push(...(data as T[]))
      if (data.length < PAGE) break
    }
    return rows
  }
}

function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== ''
}

function addUrls(target: PoolEvent, urls: Array<string | null | undefined>): string[] {
  const out = new Set(target.alternate_urls ?? [])
  for (const u of urls) if (u && u !== target.organizer_event_url) out.add(u)
  return [...out]
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function round2(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100
}

function reasonsJson(dup: DuplicateMatch) {
  return {
    reason: dup.match?.reason,
    nameScore: dup.match ? round2(dup.match.nameScore) : undefined,
    minutesApart: dup.match?.minutesApart,
    venue: dup.match?.venue,
    venueMeters: dup.match?.venueMeters,
    ai: dup.ai ? { confidence: dup.ai.confidence, explanation: dup.ai.explanation } : undefined,
  }
}
