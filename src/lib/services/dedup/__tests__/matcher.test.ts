/**
 * Kör: npx tsx --test src/lib/services/dedup/__tests__/matcher.test.ts
 *
 * Fallen är riktiga par ur databasen (hösten 2026). Platsrelationen anges
 * direkt här - i drift kommer den från VenueResolver (koordinater/adress/alias).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchEvents, type MatchableEvent } from '../matcher'
import { TokenWeights, tokensMatch } from '../text'
import { streetAddress } from '../venues'
import type { VenueRelation } from '../venues'

// Ett litet korpus så att vanliga ord ("workshop", "föreläsning") väger lite
const weights = new TokenWeights([
  'Workshop: Rymden', 'Workshop: Skriv Sci-fi', 'Konstworkshop', 'Föreläsning: Linda Wenthe',
  'Föreläsning med Tomas Magnusson', 'Höstlov - Ansiktsmålning', 'Höstlov i konstverkstan',
  'Konsert med Yttling Jazz', 'Konsert för barnen', 'Doc Lounge - The art of not knowing',
  'Doc Lounge - Cambodian Beer Dream', 'Allmänna visningar: Teach Me to Remember',
  'Sagostund med tecken som stöd', 'Pyssel med naturtema', 'Smokie', 'Sabaton till Varberg',
])

const ev = (name: string, date_time: string, venue_name: string, url: string): MatchableEvent => ({
  name,
  date_time,
  venue_name,
  location: `${venue_name}, Varberg`,
  organizer_event_url: url,
})
const match = (a: MatchableEvent, b: MatchableEvent, relation: VenueRelation = 'same') =>
  matchEvents(a, b, { relation }, weights).verdict

const VV = 'https://visitvarberg.se/evenemang/'
const KOM = 'https://varberg.se/kalender/'
const ARENA = 'https://arenavarberg.se/event/'

test('samma event från olika källor med olika stavning blir dublett', () => {
  const pairs: Array<[string, string]> = [
    ['Peter Stormare – från Arbrå till Hollywood', 'PETER STORMARE – Från Arbrå till Hollywood'],
    ['Föreläsning: Linda Wenthe', 'Föreläsning - Linda Wenthe'],
    ['Workshop: Rymden​', 'Workshop: Rymden'],
    ['Konsert för barnen i Gaza', 'Konsert för Gazas barn'],
    ['Knyckare Konspirerar', 'Emma Knyckare - ”Knyckare konspirerar”'],
    ['Valter Nilsson', 'Valter Nilsson till Nöjeshallen!'],
    ['När det inre inte syns: föreläsning med Veronica Krondal', 'När det inre inte syns'],
  ]
  for (const [a, b] of pairs) {
    const venueB = b.includes('Nöjeshallen') ? 'Nöjeshallen' : 'Kulturhuset Komedianten'
    assert.equal(
      match(ev(a, '2026-10-14T18:00:00', 'Lilla Teatern', `${KOM}1`), ev(b, '2026-10-14T18:00:00', venueB, `${VV}2`)),
      'duplicate',
      `${a} / ${b}`
    )
  }
})

test('insläpp vs start (en timme isär) på samma plats blir dublett', () => {
  assert.equal(match(ev('Terra', '2026-10-31T18:00:00', 'Nöjeshallen', `${ARENA}1`), ev('TERRA', '2026-10-31T19:00:00', 'Arena Varberg', `${VV}1`)), 'duplicate')
})

test('olika filmer i samma serie samma kväll är inte dubletter', () => {
  const v = match(
    ev('Doc Lounge - The art of not knowing', '2026-11-04T19:00:00', 'Teater Halland', `${VV}1`),
    ev('Doc Lounge - Cambodian Beer Dream', '2026-11-04T19:00:00', 'Teater Halland', `${VV}2`)
  )
  assert.notEqual(v, 'duplicate')
})

test('samma aktivitet på olika platser är inte dubletter', () => {
  assert.equal(
    match(ev('Pyssel med naturtema', '2026-10-28T10:00:00', 'Bua bibliotek', `${VV}1`), ev('Pyssel med naturtema', '2026-10-28T10:00:00', 'Träslövsläge bibliotek', `${VV}2`), 'different'),
    'distinct'
  )
})

test('samma källa listar tillfällen separat = olika event', () => {
  assert.equal(
    match(ev('Konst åt alla', '2026-10-13T18:00:00', 'Björkängsgården', `${VV}1`), ev('Konst åt alla', '2026-10-13T19:00:00', 'Björkängsgården', `${VV}2`)),
    'distinct'
  )
})

test('dagliga utställningstillfällen olika dagar är inte dubletter', () => {
  assert.equal(
    match(ev('Grannkonst 2026', '2026-10-01T12:00:00', 'Fästningen', `${VV}1`), ev('Grannkonst 2026', '2026-10-02T12:00:00', 'Fästningen', `${KOM}1`)),
    'distinct'
  )
})

test('heldagsutställning och workshop samma dag blir aldrig automatisk dublett', () => {
  const v = match(
    ev('Sagopromenad och konst utmed gamla järnvägsspåret', '2026-10-03T00:00:00', 'Galleria Trädgården', `${VV}1`),
    ev('Konstworkshop', '2026-10-03T12:00:00', 'Konstverkstan', `${KOM}1`),
    'unknown'
  )
  assert.notEqual(v, 'duplicate')
})

test('kort namn som ryms i ett längre blir inte automatisk dublett när platsen är okänd', () => {
  const v = match(
    ev('Tredje advent på Varbergs torg', '2026-12-13T14:00:00', 'Varbergs torg', `${VV}1`),
    ev('Åk jultåget andra, tredje och fjärde advent', '2026-12-13T14:00:00', 'Brunnsparken', `${VV}2`),
    'unknown'
  )
  assert.notEqual(v, 'duplicate')
})

test('sammansättningar räknas inte som samma ord, böjningar gör det', () => {
  assert.equal(tokensMatch('konst', 'konstworkshop'), false)
  assert.equal(tokensMatch('barn', 'barnen'), true)
  assert.equal(tokensMatch('gaza', 'gazas'), true)
  assert.equal(tokensMatch('konsworkshop', 'konstworkshop'), true)
})

test('gatuadress tolkas oberoende av lokalnamn, våning och landsnamn', () => {
  assert.equal(streetAddress('Kulturhuset Komedianten, Engelbrektsgatan 7 våning 2'), 'engelbrektsgatan 7')
  assert.equal(streetAddress('Engelbrektsgatan 7, Varberg, 432 41 Sverige'), 'engelbrektsgatan 7')
  assert.equal(streetAddress('Kattegattsvägen 26, 432 50 Varberg, Sweden'), 'kattegattsvägen 26')
  assert.equal(streetAddress('Varberg, Sverige'), null)
})
