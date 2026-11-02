/**
 * Namnjämförelse för dubblettdetektering.
 *
 * Helt datadriven - inga ortsspecifika ordlistor:
 * - Ordvikter (IDF) räknas fram ur eventnamnen i databasen. Ord som står i
 *   många namn ("workshop", "föreläsning", "höstlov") väger lite, ovanliga
 *   ord (artistnamn, titlar) väger mycket.
 * - Ord som finns i eventets eget platsnamn eller adress tas bort före
 *   jämförelsen, så "Valter Nilsson till Nöjeshallen!" blir "Valter Nilsson".
 */
import * as stringSimilarity from 'string-similarity'

// Mjukt bindestreck, zero-width space/joiner, BOM m.fl. (varberg.se har dem i titlar)
const INVISIBLE = /[­​-‏⁠﻿]/g

export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .replace(INVISIBLE, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(s: string | null | undefined): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((t) => t.length >= 2)
}

/** Max antal tecken en böjningsändelse får lägga till ("barn"/"barnen", "gaza"/"gazas") */
const MAX_INFLECTION_SUFFIX = 3

/**
 * Två ord räknas som samma vid exakt match, böjning eller stavfel - men inte
 * sammansättningar ("konst" ≠ "konstworkshop")
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length >= 4 && long.startsWith(short) && long.length - short.length <= MAX_INFLECTION_SUFFIX) return true
  return short.length >= 5 && stringSimilarity.compareTwoStrings(a, b) >= 0.8
}

export class TokenWeights {
  private df = new Map<string, number>()
  private n = 0

  constructor(names: Iterable<string> = []) {
    for (const name of names) this.add(name)
  }

  add(name: string): void {
    this.n++
    for (const t of new Set(tokenize(name))) this.df.set(t, (this.df.get(t) ?? 0) + 1)
  }

  weight(token: string): number {
    const df = this.df.get(token) ?? 0
    return Math.log(1 + (this.n + 1) / (df + 1))
  }
}

/** Under den här summerade vikten räknas ett namn som för allmänt för ren delmängdsmatchning */
const MIN_INFORMATIVE_WEIGHT = 4

export interface NameSimilarity {
  /**
   * 0-1. Max av teckenlikhet för hela namnen och viktad delmängd: hur stor del
   * av det kortare namnets "information" som finns i det längre. Delmängden
   * dämpas när det kortare namnet bara består av vanliga ord.
   */
  score: number
  /** 0-1. Viktad överlappning åt båda hållen - låg när det längre namnet har mycket eget innehåll */
  overlap: number
}

export function nameSimilarity(
  nameA: string,
  nameB: string,
  weights: TokenWeights,
  stripTokens: Set<string> = new Set()
): NameSimilarity {
  const strip = (tokens: string[]) => {
    const kept = tokens.filter((t) => !stripTokens.has(t))
    return kept.length > 0 ? kept : tokens
  }
  const a = [...new Set(strip(tokenize(nameA)))]
  const b = [...new Set(strip(tokenize(nameB)))]
  if (a.length === 0 || b.length === 0) return { score: 0, overlap: 0 }

  const dice = stringSimilarity.compareTwoStrings(a.join(' '), b.join(' '))

  const [small, large] = a.length <= b.length ? [a, b] : [b, a]
  let total = 0
  let matched = 0
  for (const t of small) {
    const w = weights.weight(t)
    total += w
    if (large.some((u) => tokensMatch(t, u))) matched += w
  }
  let largeTotal = 0
  let largeMatched = 0
  for (const u of large) {
    const w = weights.weight(u)
    largeTotal += w
    if (small.some((t) => tokensMatch(t, u))) largeMatched += w
  }

  const containment = total > 0 ? matched / total : 0
  const damped = containment * Math.min(1, total / MIN_INFORMATIVE_WEIGHT)
  const overlap = total + largeTotal > 0 ? (matched + largeMatched) / (total + largeTotal) : 0

  return { score: Math.max(dice, damped), overlap: Math.max(dice, overlap) }
}

/** Ord ur plats och adress som inte ska påverka namnjämförelsen */
export function placeTokens(...parts: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>()
  for (const p of parts) for (const t of tokenize(p)) out.add(t)
  return out
}
