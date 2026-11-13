/**
 * Torsdagsbrevet – allt som pratar med Resend.
 *
 * Utskick sker med Resend BROADCASTS till ett segment (inte /emails). Resend
 * sköter avregistreringen: mallen innehåller platshållaren
 * {{{RESEND_UNSUBSCRIBE_URL}}} som byts mot en personlig länk per mottagare.
 *
 * SDK (resend 6.5.0), metoderna som används:
 *   contacts.list({ segmentId })                  kontakterna i segmentet
 *   contacts.get({ email })                       finns adressen redan i Resend?
 *   contacts.create({ email, firstName, ... })    ny kontakt
 *   contacts.update({ id, unsubscribed: true })   avregistrering (aldrig tvärtom)
 *   contacts.segments.add / remove                koppla kontakt till segmentet
 *   broadcasts.create({ segmentId, from, subject, html, text, name })
 *   broadcasts.send(id, { scheduledAt })          skicka nu eller schemalägg
 *   broadcasts.get(id)                            status (draft | queued | sent)
 *   broadcasts.remove(id)                         tar bort utkast, avbokar schemalagt
 *   emails.send(...)                              testmejl till en adress
 *
 * Supabase (newsletter_subscriptions) är källan för prenumeranter. Före varje
 * utskick synkas de aktiva till segmentet. En avregistrering går bara åt ett
 * håll: den som avregistrerat sig i Resend markeras i Supabase, och den som
 * är avregistrerad i Supabase stängs av i Resend. Ingen återaktiveras.
 */
import { Resend } from 'resend'
import type { ErrorResponse } from 'resend'
import { SupabaseClient } from '@supabase/supabase-js'
import { NewsletterSubscription } from '@/types/database'
import { fetchAllRows } from '../supabase-fetch-all'
import { newsletterFrom, newsletterReplyTo, newsletterSegmentId, previewRenderOptions, renderOptions } from './config'
import { renderNewsletterEmail } from './email-template'
import { NewsletterContent } from './types'

// Resend tillåter två anrop per sekund som standard
const MIN_INTERVAL_MS = 550
const MAX_ATTEMPTS = 4

let client: Resend | null = null
let lastCallAt = 0

function resend(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY saknas')
  if (!client) client = new Resend(key)
  return client
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type ResendResult<T> = { data: T | null; error: ErrorResponse | null }

/** Ett Resend-anrop med gles takt och omförsök vid 429. Returnerar SDK:ns { data, error }. */
async function attempt<T>(fn: () => Promise<ResendResult<T>>): Promise<ResendResult<T>> {
  let result: ResendResult<T> = { data: null, error: null }
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    // Aldrig längre paus än intervallet, även om klockan skulle ha ställts om
    const wait = Math.min(lastCallAt + MIN_INTERVAL_MS - Date.now(), MIN_INTERVAL_MS)
    if (wait > 0) await sleep(wait)
    lastCallAt = Date.now()
    result = await fn()
    const rateLimited = result.error && (result.error.name === 'rate_limit_exceeded' || result.error.statusCode === 429)
    if (!rateLimited) return result
    await sleep(1000 * (i + 1))
  }
  return result
}

/** Som attempt(), men kastar ett läsbart fel om Resend svarar med fel */
async function call<T>(label: string, fn: () => Promise<ResendResult<T>>): Promise<T> {
  const { data, error } = await attempt(fn)
  if (error || data == null) {
    throw new Error(`Resend (${label}): ${error?.message ?? 'tomt svar'}`)
  }
  return data
}

function isNotFound(error: ErrorResponse | null): boolean {
  return !!error && (error.name === 'not_found' || error.statusCode === 404)
}

function requireSegmentId(): string {
  const id = newsletterSegmentId()
  if (!id) throw new Error('RESEND_NEWSLETTER_SEGMENT_ID saknas')
  return id
}

// ---------------------------------------------------------------------------
// Synk av prenumeranter: Supabase -> Resend-segmentet
// ---------------------------------------------------------------------------

type SubscriptionRow = Pick<NewsletterSubscription, 'id' | 'email' | 'name' | 'status' | 'resend_contact_id'>

interface SegmentContact {
  id: string
  email: string
  unsubscribed: boolean
}

export interface SubscriberSyncResult {
  /** Kontakter i segmentet som får brevet efter synken */
  recipients: number
  /** Nya kontakter som skapades i Resend */
  created: number
  /** Kontakter som lades till i segmentet */
  added: number
  /** Avregistreringar i Resend som fördes över till Supabase */
  unsubscribedInSupabase: number
  /** Avregistrerade/studsande i Supabase som stängdes av i Resend */
  unsubscribedInResend: number
  /** Sådant som inte gick att synka – de berörda får inte brevet */
  warnings: string[]
}

async function listSegmentContacts(segmentId: string): Promise<SegmentContact[]> {
  const contacts: SegmentContact[] = []
  let after: string | undefined
  for (;;) {
    const page = await call('contacts.list', () =>
      resend().contacts.list(after ? { segmentId, limit: 100, after } : { segmentId, limit: 100 })
    )
    for (const c of page.data) contacts.push({ id: c.id, email: c.email.trim().toLowerCase(), unsubscribed: c.unsubscribed })
    if (!page.has_more || page.data.length === 0) break
    after = page.data[page.data.length - 1].id
  }
  return contacts
}

function splitName(name: string): { firstName?: string; lastName?: string } {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || undefined }
}

/**
 * Synkar prenumeranterna till Resend-segmentet inför ett utskick:
 *   - aktiva som saknas i segmentet skapas (om adressen inte redan finns i
 *     Resend) och läggs till, och resend_contact_id sparas
 *   - den som avregistrerat sig i Resend markeras 'unsubscribed' i Supabase
 *   - den som är 'unsubscribed'/'bounced' i Supabase stängs av i Resend
 *   - 'pending' (obekräftade) tas ur segmentet
 * Ingen kontakt sätts någonsin tillbaka till prenumererande.
 */
export async function syncSubscribersToResend(supabase: SupabaseClient): Promise<SubscriberSyncResult> {
  const segmentId = requireSegmentId()
  const result: SubscriberSyncResult = {
    recipients: 0,
    created: 0,
    added: 0,
    unsubscribedInSupabase: 0,
    unsubscribedInResend: 0,
    warnings: [],
  }

  const segmentContacts = await listSegmentContacts(segmentId)
  const byEmail = new Map(segmentContacts.map((c) => [c.email, c]))

  const subscriptions = await fetchAllRows<SubscriptionRow>((from, to) =>
    supabase
      .from('newsletter_subscriptions')
      .select('id, email, name, status, resend_contact_id')
      .order('id', { ascending: true })
      .range(from, to)
  )
  const knownEmails = new Set(subscriptions.map((s) => s.email.trim().toLowerCase()))

  const markUnsubscribed = async (sub: SubscriptionRow, contactId: string) => {
    const { error } = await supabase
      .from('newsletter_subscriptions')
      .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString(), resend_contact_id: contactId })
      .eq('id', sub.id)
    if (error) result.warnings.push(`${sub.email}: avregistreringen kunde inte sparas i Supabase (${error.message})`)
    else result.unsubscribedInSupabase++
  }
  const saveContactId = async (sub: SubscriptionRow, contactId: string) => {
    if (sub.resend_contact_id === contactId) return
    const { error } = await supabase.from('newsletter_subscriptions').update({ resend_contact_id: contactId }).eq('id', sub.id)
    if (error) result.warnings.push(`${sub.email}: Resend-id kunde inte sparas (${error.message})`)
  }

  for (const sub of subscriptions) {
    const email = sub.email.trim().toLowerCase()
    const inSegment = byEmail.get(email)

    try {
      if (sub.status === 'active') {
        if (inSegment) {
          if (inSegment.unsubscribed) await markUnsubscribed(sub, inSegment.id)
          else await saveContactId(sub, inSegment.id)
          continue
        }

        // Inte i segmentet: finns adressen redan som kontakt i Resend?
        const existing = await attempt(() => resend().contacts.get({ email }))
        if (existing.error && !isNotFound(existing.error)) {
          throw new Error(existing.error.message)
        }
        let contactId: string
        if (existing.data) {
          if (existing.data.unsubscribed) {
            // Avregistrerad i Resend sedan tidigare – återaktiveras aldrig
            await markUnsubscribed(sub, existing.data.id)
            continue
          }
          contactId = existing.data.id
        } else {
          // `unsubscribed` skickas medvetet inte med: en ny kontakt börjar som
          // prenumererande, och en befintlig får aldrig sin status ändrad här
          const created = await call('contacts.create', () => resend().contacts.create({ email, ...splitName(sub.name) }))
          contactId = created.id
          result.created++
        }

        await call('contacts.segments.add', () => resend().contacts.segments.add({ contactId, segmentId }))
        result.added++
        byEmail.set(email, { id: contactId, email, unsubscribed: false })
        await saveContactId(sub, contactId)
        continue
      }

      // Inte aktiv i Supabase: se till att kontakten inte får brevet
      if (!inSegment || inSegment.unsubscribed) continue
      if (sub.status === 'pending') {
        await call('contacts.segments.remove', () => resend().contacts.segments.remove({ contactId: inSegment.id, segmentId }))
        byEmail.delete(email)
      } else {
        await call('contacts.update', () => resend().contacts.update({ id: inSegment.id, unsubscribed: true }))
        inSegment.unsubscribed = true
        result.unsubscribedInResend++
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`  ⚠️ Kunde inte synka ${email} till Resend: ${message}`)
      result.warnings.push(`${email}: ${message}`)
      // Osäkert läge för en icke-aktiv prenumerant får inte sluta med att brevet går iväg till den
      if (sub.status !== 'active' && inSegment && !inSegment.unsubscribed) {
        throw new Error(`Kunde inte stänga av ${email} i Resend (${message}) - utskicket avbryts`)
      }
    }
  }

  const recipients = [...byEmail.values()].filter((c) => !c.unsubscribed)
  result.recipients = recipients.length
  const unknown = recipients.filter((c) => !knownEmails.has(c.email)).length
  if (unknown > 0) {
    result.warnings.push(`${unknown} kontakt${unknown === 1 ? '' : 'er'} i Resend-segmentet finns inte i Supabase men får också brevet`)
  }
  return result
}

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

/** Skapar ett Broadcast (utkast) i Resend till segmentet och returnerar dess id */
export async function createBroadcast(content: NewsletterContent): Promise<string> {
  const segmentId = requireSegmentId()
  const { html, text } = renderNewsletterEmail(content, renderOptions())
  const replyTo = newsletterReplyTo()
  // previewText skickas inte: mallen har redan en dold preheader överst, och
  // två stycken ger dubbel text i inkorgens förhandsrad
  const created = await call('broadcasts.create', () =>
    resend().broadcasts.create({
      name: `Torsdagsbrevet ${content.issueDate}`,
      segmentId,
      from: newsletterFrom(),
      subject: content.subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    })
  )
  return created.id
}

/** Skickar ett Broadcast direkt, eller schemalägger det till en tidpunkt (ISO 8601 i UTC) */
export async function sendBroadcast(broadcastId: string, scheduledAt?: Date): Promise<void> {
  await call('broadcasts.send', () =>
    resend().broadcasts.send(broadcastId, scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : undefined)
  )
}

/**
 * Tar bort ett Broadcast. Resend tillåter det för utkast och för schemalagda
 * utskick som inte gått iväg – ett schemalagt utskick avbokas då.
 */
export async function removeBroadcast(broadcastId: string): Promise<void> {
  const { error } = await attempt(() => resend().broadcasts.remove(broadcastId))
  if (error && !isNotFound(error)) throw new Error(`Resend (broadcasts.remove): ${error.message}`)
}

export interface BroadcastState {
  /** missing = finns inte (längre), draft = skapat men inte skickat, scheduled = väntar på sin tid, sent = utskickat eller på väg ut */
  state: 'missing' | 'draft' | 'scheduled' | 'sent'
  scheduledAt: string | null
  sentAt: string | null
}

/** Läser av ett Broadcasts läge i Resend */
export async function getBroadcastState(broadcastId: string): Promise<BroadcastState> {
  const { data, error } = await attempt(() => resend().broadcasts.get(broadcastId))
  if (isNotFound(error)) return { state: 'missing', scheduledAt: null, sentAt: null }
  if (error || !data) throw new Error(`Resend (broadcasts.get): ${error?.message ?? 'tomt svar'}`)

  const scheduledAt = data.scheduled_at ?? null
  const sentAt = data.sent_at ?? null
  if (data.status === 'sent' || sentAt) return { state: 'sent', scheduledAt, sentAt }
  if (data.status === 'queued') {
    // Köat med en tid i framtiden = schemalagt, annars på väg ut just nu
    const future = scheduledAt && new Date(scheduledAt).getTime() > Date.now()
    return { state: future ? 'scheduled' : 'sent', scheduledAt, sentAt }
  }
  return { state: scheduledAt ? 'scheduled' : 'draft', scheduledAt, sentAt }
}

// ---------------------------------------------------------------------------
// Testmejl
// ---------------------------------------------------------------------------

/**
 * Skickar brevet som ett vanligt mejl till EN adress (inte ett Broadcast).
 * Avregistreringslänken pekar på sajten, eftersom Resends platshållare bara
 * fylls i vid Broadcast.
 */
export async function sendTestEmail(content: NewsletterContent, to: string): Promise<string> {
  const { html, text } = renderNewsletterEmail(content, previewRenderOptions())
  const replyTo = newsletterReplyTo()
  const sent = await call('emails.send', () =>
    resend().emails.send({
      from: newsletterFrom(),
      to,
      subject: `[Test] ${content.subject}`,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    })
  )
  return sent.id
}
