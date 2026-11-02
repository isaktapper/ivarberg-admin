/**
 * Platsjämförelse för dubblettdetektering - utan ortsspecifika listor.
 *
 * Två event räknas som samma plats om:
 * - platsnamnen är (nästan) lika, eller
 * - paret finns i venue_aliases (lärs in automatiskt när två event bevisligen
 *   är samma men platsen heter olika i olika källor), eller
 * - båda har geokodats och ligger inom SAME_PLACE_METERS från varandra.
 *
 * Geokodning sker via OpenStreetMap Nominatim (gratis, max 1 anrop/s) och
 * cachas per unik plats-/adressträng i venue_geocodes, så varje plats slås
 * bara upp en gång. Misslyckade uppslag cachas också.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import * as stringSimilarity from 'string-similarity'
import { normalizeText } from './text'

export type VenueRelation = 'same' | 'unknown' | 'different'

export interface Geocode {
  lat: number | null
  lon: number | null
  precise: boolean
}

export interface VenueInput {
  venue_name?: string | null
  location?: string | null
}

const SAME_PLACE_METERS = 250
const DIFFERENT_PLACE_METERS = 1000
/** Nominatim place_rank: 30 = byggnad/adress/anläggning, 26-27 = gata, <=16 = ort */
const PRECISE_PLACE_RANK = 28
/** Träffar längre bort än så från datasetets tyngdpunkt räknas som felgeokodade */
const MAX_DISTANCE_FROM_HOME_KM = 60
const MAX_LOOKUPS_PER_RUN = 200

export function venueKey(v: VenueInput): string {
  return normalizeText(v.venue_name || v.location || '')
}

function geocodeKey(v: VenueInput): string {
  return `${normalizeText(v.venue_name)}|${normalizeText(v.location)}`
}

export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Rensar adressbrus som geokodare inte förstår ("våning 2", landsnamn, "SE-") */
function cleanAddress(s: string): string {
  return s
    .replace(/\b(v[åa]ning|v[åa]n|plan)\s*\d+\b/gi, '')
    .replace(/\b(sverige|sweden)\b/gi, '')
    .replace(/\bSE-(?=\d)/g, '')
    .replace(/\s*,\s*(,\s*)*/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim()
}

/** Orten ur en svensk adress: segmentet med postnummer, eller sista segmentet */
function cityFrom(location: string): string | null {
  const parts = cleanAddress(location).split(',').map((p) => p.trim()).filter(Boolean)
  const withZip = parts.find((p) => /\d{3}\s?\d{2}/.test(p))
  const city = (withZip ?? parts[parts.length - 1] ?? '').replace(/\d{3}\s?\d{2}/, '').trim()
  return city || null
}

/** "Engelbrektsgatan 7 våning 2, 432 41 Varberg" → "engelbrektsgatan 7" (null om ingen gatuadress) */
export function streetAddress(location: string | null | undefined): string | null {
  for (const segment of cleanAddress(location ?? '').split(',')) {
    const s = segment.trim()
    if (/^\d{3}\s?\d{2}\b/.test(s)) continue // postnummer
    const m = s.match(/^(\p{L}[\p{L}\s.'-]*?)\s+(\d{1,4}\s?[a-z]?)$/iu)
    if (m) return normalizeText(`${m[1]} ${m[2].replace(/\s/g, '')}`)
  }
  return null
}

function geocodeQueries(v: VenueInput): string[] {
  const queries: string[] = []
  const location = cleanAddress(v.location ?? '')
  const venue = (v.venue_name ?? '').trim()
  if (location && /\d/.test(location)) queries.push(location)
  const city = v.location ? cityFrom(v.location) : null
  if (venue && city && normalizeText(venue) !== normalizeText(city)) queries.push(`${venue}, ${city}`)
  if (location && !queries.includes(location)) queries.push(location)
  return queries
}

interface CacheRow {
  query_key: string
  query: string
  lat: number | null
  lon: number | null
  precise: boolean
  display_name: string | null
  provider: string
}

export class VenueResolver {
  private geocodes = new Map<string, Geocode>()
  private aliases = new Set<string>()
  private lookups = 0
  private lastRequestAt = 0
  private home: { lat: number; lon: number } | null = null

  constructor(
    private supabase: SupabaseClient,
    /** false = tabellerna finns inte (migrationen ej körd) - cacha bara i minnet */
    private persist: boolean
  ) {}

  async load(): Promise<void> {
    if (!this.persist) return
    const { data: geo } = await this.supabase.from('venue_geocodes').select('query_key, lat, lon, precise')
    for (const r of geo ?? []) this.geocodes.set(r.query_key, { lat: r.lat, lon: r.lon, precise: r.precise })
    const { data: al } = await this.supabase.from('venue_aliases').select('venue_a, venue_b')
    for (const r of al ?? []) this.aliases.add(`${r.venue_a}||${r.venue_b}`)
    this.updateHome()
  }

  /** Tyngdpunkt för alla exakta platser - används som sökbias och rimlighetskontroll */
  private updateHome(): void {
    const precise = [...this.geocodes.values()].filter((g) => g.precise && g.lat !== null && g.lon !== null)
    if (precise.length < 5) return
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    this.home = { lat: median(precise.map((g) => g.lat!)), lon: median(precise.map((g) => g.lon!)) }
  }

  /** Geokodar alla platser som inte redan finns i cachen */
  async ensureGeocoded(venues: VenueInput[]): Promise<void> {
    const pending = new Map<string, VenueInput>()
    for (const v of venues) {
      const key = geocodeKey(v)
      if (key !== '|' && !this.geocodes.has(key)) pending.set(key, v)
    }
    if (pending.size === 0) return
    console.log(`  🌍 Geokodar ${pending.size} nya platser...`)

    for (const [key, v] of pending) {
      if (this.lookups >= MAX_LOOKUPS_PER_RUN) {
        console.log(`  ⚠️ Max ${MAX_LOOKUPS_PER_RUN} geokodningar per körning nådd - resten tas nästa körning`)
        break
      }
      const result = await this.geocode(v)
      this.geocodes.set(key, result.geocode)
      if (this.persist) {
        const row: CacheRow = {
          query_key: key,
          query: result.query,
          lat: result.geocode.lat,
          lon: result.geocode.lon,
          precise: result.geocode.precise,
          display_name: result.displayName,
          provider: 'nominatim',
        }
        const { error } = await this.supabase.from('venue_geocodes').upsert(row)
        if (error) console.warn(`  ⚠️ Kunde inte cacha geokod: ${error.message}`)
      }
      if (result.geocode.precise) this.updateHome()
    }
  }

  private async geocode(v: VenueInput): Promise<{ geocode: Geocode; query: string; displayName: string | null }> {
    const queries = geocodeQueries(v)
    let fallback: { geocode: Geocode; query: string; displayName: string | null } | null = null

    for (const query of queries) {
      const hit = await this.nominatim(query)
      if (!hit) continue
      const result = { geocode: hit.geocode, query, displayName: hit.displayName }
      if (hit.geocode.precise) return result
      fallback ??= result
    }
    return fallback ?? { geocode: { lat: null, lon: null, precise: false }, query: queries[0] ?? '', displayName: null }
  }

  private async nominatim(query: string): Promise<{ geocode: Geocode; displayName: string } | null> {
    // Nominatims användarvillkor: max 1 anrop/s och en identifierande User-Agent
    const wait = this.lastRequestAt + 1100 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.lastRequestAt = Date.now()
    this.lookups++

    const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' })
    const country = process.env.DEDUP_GEOCODE_COUNTRY ?? 'se'
    if (country) params.set('countrycodes', country)
    if (this.home) {
      const d = 0.4
      params.set('viewbox', `${this.home.lon - d},${this.home.lat + d},${this.home.lon + d},${this.home.lat - d}`)
    }

    try {
      const base = (process.env.ADMIN_BASE_URL || 'https://admin.ivarberg.nu').replace(/\/$/, '')
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': `ivarberg-admin-dedup/1.0 (+${base})`, 'Accept-Language': 'sv' },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        console.warn(`  ⚠️ Nominatim ${res.status} för "${query}"`)
        return null
      }
      const [hit] = (await res.json()) as Array<{ lat: string; lon: string; place_rank: number; display_name: string }>
      if (!hit) return null

      const point = { lat: Number(hit.lat), lon: Number(hit.lon) }
      const farAway = this.home && distanceMeters(this.home, point) > MAX_DISTANCE_FROM_HOME_KM * 1000
      return {
        geocode: { ...point, precise: hit.place_rank >= PRECISE_PLACE_RANK && !farAway },
        displayName: hit.display_name,
      }
    } catch (error) {
      console.warn(`  ⚠️ Nominatim-fel för "${query}":`, error instanceof Error ? error.message : error)
      return null
    }
  }

  relation(a: VenueInput, b: VenueInput): { relation: VenueRelation; meters?: number } {
    const ka = venueKey(a)
    const kb = venueKey(b)
    if (ka && kb) {
      if (ka === kb || stringSimilarity.compareTwoStrings(ka, kb) >= 0.85) return { relation: 'same' }
      if (this.aliases.has(aliasKey(ka, kb))) return { relation: 'same' }
    }
    // Samma gatuadress = samma byggnad, även när lokalen heter olika i källorna
    const sa = streetAddress(a.location)
    if (sa && sa === streetAddress(b.location)) return { relation: 'same', meters: 0 }

    const ga = this.geocodes.get(geocodeKey(a))
    const gb = this.geocodes.get(geocodeKey(b))
    if (ga?.lat == null || ga.lon == null || gb?.lat == null || gb.lon == null) return { relation: 'unknown' }

    const meters = Math.round(distanceMeters({ lat: ga.lat, lon: ga.lon }, { lat: gb.lat, lon: gb.lon }))
    if (ga.precise && gb.precise) {
      if (meters <= SAME_PLACE_METERS) return { relation: 'same', meters }
      if (meters > DIFFERENT_PLACE_METERS) return { relation: 'different', meters }
    }
    return { relation: 'unknown', meters }
  }

  /** Spara att två platsnamn är samma plats (anropas när en dublett bekräftats) */
  async learnAlias(a: VenueInput, b: VenueInput, eventId?: number): Promise<void> {
    const ka = venueKey(a)
    const kb = venueKey(b)
    if (!ka || !kb || ka === kb) return
    const key = aliasKey(ka, kb)
    if (this.aliases.has(key)) return
    this.aliases.add(key)
    if (!this.persist) return
    const [venue_a, venue_b] = ka < kb ? [ka, kb] : [kb, ka]
    const { error } = await this.supabase
      .from('venue_aliases')
      .upsert({ venue_a, venue_b, learned_from_event_id: eventId ?? null }, { onConflict: 'venue_a,venue_b' })
    if (error) console.warn(`  ⚠️ Kunde inte spara platsalias: ${error.message}`)
    else console.log(`  📍 Lärde platsalias: "${venue_a}" = "${venue_b}"`)
  }
}

function aliasKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`
}
