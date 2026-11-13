/**
 * Torsdagsbrevet – utskicken i newsletter_issues och allt som går att göra
 * med ett utskick från godkännandesidan: spara ändringar, förhandsvisa,
 * skicka testmejl, godkänna, ångra och hoppa över.
 *
 * Regeln som allt här vilar på: brevet går ALDRIG ut utan att en människa
 * godkänt det. Godkännandet är enda stället i koden som skapar ett Broadcast.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NewsletterIssue, NewsletterIssueStatus } from '@/types/database'
import { alertService } from '../services/alert-service'
import { getPostHogClient } from '../services/openai-client'
import { missingSendConfig, missingTestConfig, newsletterTestEmail, previewRenderOptions } from './config'
import { approvalDeadlineFor, sendTimeFor, weekendFor } from './dates'
import { renderNewsletterEmail } from './email-template'
import { ensureEmailImages } from './images'
import {
  MAX_PICKS,
  NewsletterDraft,
  NewsletterProposal,
  buildContent,
  draftFromContent,
  validateDraft,
} from './proposal'
import {
  BroadcastState,
  createBroadcast,
  getBroadcastState,
  removeBroadcast,
  sendBroadcast,
  sendTestEmail,
  syncSubscribersToResend,
} from './resend'
import { NewsletterContent } from './types'

/** Lägen där innehållet får ändras och brevet får godkännas */
const EDITABLE: NewsletterIssueStatus[] = ['proposed', 'failed']
/** Ett godkännande som stått i 'approved' så här länge har avbrutits och får göras om */
const STALE_APPROVAL_MS = 5 * 60_000
/** Godkänns brevet så här nära 07:00 (eller senare) skickas det direkt i stället för att schemaläggas */
const IMMEDIATE_MARGIN_MS = 2 * 60_000

/** Fel som ska visas för användaren med en bestämd HTTP-status */
export class NewsletterError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'NewsletterError'
    this.status = status
  }
}

export function newsletterServiceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// ---------------------------------------------------------------------------
// Läsning
// ---------------------------------------------------------------------------

export async function loadIssueByToken(supabase: SupabaseClient, token: string): Promise<NewsletterIssue | null> {
  if (!token || token.length < 16 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null
  const { data, error } = await supabase.from('newsletter_issues').select('*').eq('approval_token', token).maybeSingle()
  if (error) throw new Error(`Kunde inte läsa utskicket: ${error.message}`)
  return (data as NewsletterIssue | null) ?? null
}

export async function loadIssueByDate(supabase: SupabaseClient, issueDate: string): Promise<NewsletterIssue | null> {
  const { data, error } = await supabase.from('newsletter_issues').select('*').eq('issue_date', issueDate).maybeSingle()
  if (error) throw new Error(`Kunde inte läsa utskicket: ${error.message}`)
  return (data as NewsletterIssue | null) ?? null
}

async function patchIssue(supabase: SupabaseClient, id: number, patch: Partial<NewsletterIssue>): Promise<NewsletterIssue> {
  const { data, error } = await supabase.from('newsletter_issues').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`Kunde inte uppdatera utskicket: ${error.message}`)
  return data as NewsletterIssue
}

export interface SubscriberCounts {
  active: number
  pending: number
  unsubscribed: number
  bounced: number
}

/** Antal prenumeranter per status i Supabase (källan för vilka som får brevet) */
export async function countSubscribers(supabase: SupabaseClient): Promise<SubscriberCounts> {
  const statuses = ['active', 'pending', 'unsubscribed', 'bounced'] as const
  const results = await Promise.all(
    statuses.map((status) =>
      supabase.from('newsletter_subscriptions').select('*', { count: 'exact', head: true }).eq('status', status)
    )
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(`Kunde inte räkna prenumeranter: ${failed.error.message}`)
  return {
    active: results[0].count ?? 0,
    pending: results[1].count ?? 0,
    unsubscribed: results[2].count ?? 0,
    bounced: results[3].count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Vyn för godkännandesidan
// ---------------------------------------------------------------------------

export interface NewsletterApprovalView {
  issueDate: string
  status: NewsletterIssueStatus
  weekendStart: string
  weekendEnd: string
  proposal: NewsletterProposal | null
  content: NewsletterContent | null
  /** När brevet går ut om det godkänns i tid: torsdag 07:00 svensk tid (ISO) */
  sendAt: string
  /** Sista tidpunkten att godkänna (ISO) */
  deadline: string
  /** true om godkännandet stått och väntat för länge och får göras om */
  approvalStuck: boolean
  scheduledFor: string | null
  sentAt: string | null
  approvedAt: string | null
  /** Mottagare i Resend-segmentet när brevet godkändes */
  recipientCount: number | null
  /** Aktiva prenumeranter i Supabase just nu */
  activeSubscribers: number | null
  error: string | null
  /** Det som saknas i konfigurationen för ett riktigt utskick (tom = klart) */
  missingConfig: string[]
  canSendTest: boolean
  defaultTestEmail: string | null
}

function isApprovalStuck(row: NewsletterIssue): boolean {
  return row.status === 'approved' && !!row.approved_at && Date.now() - new Date(row.approved_at).getTime() > STALE_APPROVAL_MS
}

export async function toApprovalView(supabase: SupabaseClient, row: NewsletterIssue): Promise<NewsletterApprovalView> {
  const weekend = weekendFor(row.issue_date)
  const activeSubscribers = await countSubscribers(supabase)
    .then((c) => c.active)
    .catch(() => null)
  return {
    issueDate: row.issue_date,
    status: row.status,
    weekendStart: weekend.start,
    weekendEnd: weekend.end,
    proposal: row.proposal ?? null,
    content: row.content ?? null,
    sendAt: sendTimeFor(row.issue_date).toISOString(),
    deadline: approvalDeadlineFor(row.issue_date).toISOString(),
    approvalStuck: isApprovalStuck(row),
    scheduledFor: row.scheduled_for ?? null,
    sentAt: row.sent_at ?? null,
    approvedAt: row.approved_at ?? null,
    recipientCount: row.recipient_count ?? null,
    activeSubscribers,
    error: row.error ?? null,
    missingConfig: missingSendConfig(),
    canSendTest: missingTestConfig().length === 0,
    defaultTestEmail: newsletterTestEmail(),
  }
}

// ---------------------------------------------------------------------------
// Utkast: spara, förhandsvisa, testmejl
// ---------------------------------------------------------------------------

function requireProposal(row: NewsletterIssue): NewsletterProposal {
  if (!row.proposal || row.proposal.candidates.length === 0) {
    throw new NewsletterError('Utskicket saknar förslag att utgå från', 400)
  }
  return row.proposal
}

/** Rensar utkastet: bara kända evenemang, inga dubbletter, högst tre, rader bara för kandidater */
function normalizeDraft(proposal: NewsletterProposal, draft: NewsletterDraft): NewsletterDraft {
  const known = new Set(proposal.candidates.map((c) => c.eventId))
  const pickEventIds = [...new Set(draft.pickEventIds)].filter((id) => known.has(id)).slice(0, MAX_PICKS)
  const comments: Record<string, string> = {}
  for (const [key, value] of Object.entries(draft.comments ?? {})) {
    if (known.has(Number(key)) && typeof value === 'string') comments[key] = value.replace(/\s+/g, ' ').trim()
  }
  return {
    pickEventIds,
    comments,
    subject: draft.subject.replace(/\s+/g, ' ').trim(),
    preheader: draft.preheader.replace(/\s+/g, ' ').trim(),
    intro: draft.intro.trim(),
    signoff: draft.signoff.trim(),
    ps: draft.ps?.trim() || null,
  }
}

/**
 * Sparar redaktörens ändringar som brevets innehåll. Evenemang som valts in
 * får sin mejlbild (JPEG 1200×675) skapad här, så att förhandsvisningen visar
 * exakt det som skickas.
 */
export async function saveDraft(supabase: SupabaseClient, row: NewsletterIssue, draft: NewsletterDraft): Promise<NewsletterIssue> {
  if (!EDITABLE.includes(row.status)) throw new NewsletterError('Brevet går inte att ändra i det här läget', 409)
  const proposal = requireProposal(row)
  const clean = normalizeDraft(proposal, draft)
  const imagesAdded = await ensureEmailImages(supabase, proposal, clean.pickEventIds)
  const content = buildContent(proposal, clean, row.content)

  const { data, error } = await supabase
    .from('newsletter_issues')
    .update(imagesAdded ? { content, proposal } : { content })
    .eq('id', row.id)
    .in('status', EDITABLE)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Kunde inte spara: ${error.message}`)
  if (!data) throw new NewsletterError('Brevet ändrades på annat håll – ladda om sidan', 409)
  return data as NewsletterIssue
}

/** Sparar utkastet (om det går att ändra) och returnerar raden med aktuellt innehåll */
async function withDraft(supabase: SupabaseClient, row: NewsletterIssue, draft?: NewsletterDraft): Promise<NewsletterIssue> {
  return draft && EDITABLE.includes(row.status) ? saveDraft(supabase, row, draft) : row
}

/** Brevets html för förhandsvisningen – samma rendering som testmejlet */
export async function previewIssue(
  supabase: SupabaseClient,
  row: NewsletterIssue,
  draft?: NewsletterDraft
): Promise<{ row: NewsletterIssue; html: string }> {
  const current = await withDraft(supabase, row, draft)
  if (!current.content) throw new NewsletterError('Brevet saknar innehåll', 400)
  return { row: current, html: renderNewsletterEmail(current.content, previewRenderOptions()).html }
}

/** Skickar brevet som testmejl till en angiven adress (aldrig till prenumeranterna) */
export async function sendIssueTest(
  supabase: SupabaseClient,
  row: NewsletterIssue,
  to: string,
  draft?: NewsletterDraft
): Promise<NewsletterIssue> {
  const missing = missingTestConfig()
  if (missing.length > 0) throw new NewsletterError(`Testmejl kan inte skickas. Saknas: ${missing.join(', ')}`, 409)
  const current = await withDraft(supabase, row, draft)
  if (!current.content) throw new NewsletterError('Brevet saknar innehåll', 400)
  await sendTestEmail(current.content, to)
  return current
}

// ---------------------------------------------------------------------------
// Godkänna, ångra, hoppa över
// ---------------------------------------------------------------------------

/** För över ett Broadcasts faktiska läge i Resend till raden */
async function markDelivered(supabase: SupabaseClient, id: number, state: BroadcastState): Promise<NewsletterIssue> {
  return patchIssue(
    supabase,
    id,
    state.state === 'sent'
      ? { status: 'sent', sent_at: state.sentAt ?? new Date().toISOString(), error: null }
      : { status: 'scheduled', scheduled_for: state.scheduledAt, error: null }
  )
}

export interface ApprovalResult {
  row: NewsletterIssue
  /** scheduled = går ut torsdag 07:00, sent = skickades direkt */
  outcome: 'scheduled' | 'sent'
  /** Sådant som inte stoppade utskicket men är värt att veta (t.ex. en adress som inte gick att synka) */
  warnings: string[]
}

/**
 * Godkänner brevet: synkar prenumeranterna till Resend-segmentet, skapar ett
 * Broadcast och schemalägger det till torsdag 07:00 svensk tid. Godkänns det
 * efter 07:00 skickas det direkt.
 *
 * Raden låses med status 'approved' medan det pågår, så att två godkännanden
 * aldrig kan ge två utskick. Går något fel markeras raden 'failed' och ett
 * skapat men oskickat Broadcast tas bort.
 */
export async function approveIssue(supabase: SupabaseClient, row: NewsletterIssue, draft?: NewsletterDraft): Promise<ApprovalResult> {
  const missing = missingSendConfig()
  if (missing.length > 0) {
    throw new NewsletterError(`Brevet kan inte skickas än. Saknas: ${missing.join(', ')}`, 409)
  }
  const stuck = isApprovalStuck(row)
  if (!EDITABLE.includes(row.status) && !stuck) {
    const reason: Partial<Record<NewsletterIssueStatus, string>> = {
      approved: 'Godkännandet pågår redan – vänta en stund',
      scheduled: 'Brevet är redan schemalagt',
      sent: 'Brevet är redan skickat',
      skipped: 'Veckans brev är överhoppat – ångra först',
    }
    throw new NewsletterError(reason[row.status] ?? 'Brevet går inte att godkänna i det här läget', 409)
  }
  if (Date.now() > approvalDeadlineFor(row.issue_date).getTime()) {
    throw new NewsletterError('Det är för sent att skicka veckans brev – helgen är redan igång', 409)
  }

  const proposal = requireProposal(row)
  const source = draft ?? (row.content ? draftFromContent(row.content) : null)
  if (!source) throw new NewsletterError('Brevet saknar innehåll', 400)
  const clean = normalizeDraft(proposal, source)
  const validation = validateDraft(proposal, clean)
  if (validation.errors.length > 0) throw new NewsletterError(validation.errors.join('. '), 400)

  // Lås raden. Bara ett anrop vinner – det andra får 409.
  const lock = supabase
    .from('newsletter_issues')
    .update({ status: 'approved', approved_at: new Date().toISOString(), error: null })
    .eq('id', row.id)
  const { data: locked, error: lockError } = await (
    stuck ? lock.eq('status', 'approved').eq('approved_at', row.approved_at!) : lock.in('status', EDITABLE)
  ).select('id')
  if (lockError) throw new Error(`Kunde inte låsa utskicket: ${lockError.message}`)
  if (!locked || locked.length === 0) throw new NewsletterError('Någon annan hann före – ladda om sidan', 409)

  let broadcastId: string | null = row.resend_broadcast_id ?? null
  try {
    // Rest från ett avbrutet försök: gick det Broadcastet i själva verket iväg?
    if (broadcastId) {
      const leftover = await getBroadcastState(broadcastId)
      if (leftover.state === 'scheduled' || leftover.state === 'sent') {
        return { row: await markDelivered(supabase, row.id, leftover), outcome: leftover.state, warnings: [] }
      }
      if (leftover.state === 'draft') await removeBroadcast(broadcastId)
      broadcastId = null
    }

    await ensureEmailImages(supabase, proposal, clean.pickEventIds)
    const content = buildContent(proposal, clean, row.content)

    const sync = await syncSubscribersToResend(supabase)
    if (sync.recipients === 0) throw new Error('Det finns inga aktiva prenumeranter i Resend-segmentet')

    broadcastId = await createBroadcast(content)
    await patchIssue(supabase, row.id, {
      content,
      proposal,
      resend_broadcast_id: broadcastId,
      recipient_count: sync.recipients,
    })

    const sendAt = sendTimeFor(row.issue_date)
    const immediate = Date.now() >= sendAt.getTime() - IMMEDIATE_MARGIN_MS
    await sendBroadcast(broadcastId, immediate ? undefined : sendAt)

    const updated = await patchIssue(
      supabase,
      row.id,
      immediate
        ? { status: 'sent', sent_at: new Date().toISOString(), scheduled_for: null }
        : { status: 'scheduled', scheduled_for: sendAt.toISOString(), sent_at: null }
    )

    getPostHogClient().capture({
      distinctId: 'newsletter-bot',
      event: 'newsletter_approved',
      properties: {
        issue_date: row.issue_date,
        outcome: immediate ? 'sent' : 'scheduled',
        recipients: sync.recipients,
        picks: content.picks.length,
        contacts_created: sync.created,
        sync_warnings: sync.warnings.length,
      },
    })
    console.log(
      `📨 Torsdagsbrevet ${row.issue_date} ${immediate ? 'skickat direkt' : `schemalagt till ${sendAt.toISOString()}`} (${sync.recipients} mottagare)`
    )
    return { row: updated, outcome: immediate ? 'sent' : 'scheduled', warnings: sync.warnings }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Godkännandet av Torsdagsbrevet misslyckades:', error)

    // Vad hände med Broadcastet? Har det gått iväg får raden inte stå som
    // misslyckad – då riskerar ett nytt försök att ge ett andra utskick.
    let keepBroadcastId = broadcastId
    if (broadcastId) {
      try {
        const state = await getBroadcastState(broadcastId)
        if (state.state === 'scheduled' || state.state === 'sent') {
          return { row: await markDelivered(supabase, row.id, state), outcome: state.state, warnings: [message] }
        }
        if (state.state === 'draft') await removeBroadcast(broadcastId)
        keepBroadcastId = null
      } catch (cleanupError) {
        // Okänt läge: behåll id:t så att nästa försök börjar med att kontrollera det
        console.error('Kunde inte kontrollera Broadcastet efter felet:', cleanupError)
      }
    }
    await patchIssue(supabase, row.id, { status: 'failed', error: message, resend_broadcast_id: keepBroadcastId }).catch((e) =>
      console.error('Kunde inte markera utskicket som misslyckat:', e)
    )
    await alertService.alert({
      severity: 'warning',
      category: 'api',
      title: '⚠️ Torsdagsbrevet kunde inte schemaläggas',
      message: `Godkännandet av brevet ${row.issue_date} misslyckades: ${message}. Försök igen från godkännandesidan.`,
      details: { issue_date: row.issue_date },
      source: 'newsletter',
    })
    throw error
  }
}

/**
 * Ångrar: ett schemalagt utskick avbokas i Resend och brevet går tillbaka
 * till förslag. En överhoppad vecka går också att ångra. Ett skickat brev går
 * inte att ta tillbaka.
 */
export async function undoIssue(supabase: SupabaseClient, row: NewsletterIssue): Promise<NewsletterIssue> {
  if (row.status === 'sent') throw new NewsletterError('Brevet är redan skickat och går inte att ångra', 409)

  if (row.status === 'skipped') {
    if (!row.content) throw new NewsletterError('Det finns inget förslag att gå tillbaka till', 409)
    const { data, error } = await supabase
      .from('newsletter_issues')
      .update({ status: 'proposed', error: null })
      .eq('id', row.id)
      .eq('status', 'skipped')
      .select('*')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new NewsletterError('Brevet ändrades på annat håll – ladda om sidan', 409)
    return data as NewsletterIssue
  }

  if (row.status !== 'scheduled' && row.status !== 'approved') {
    throw new NewsletterError('Det finns inget godkännande att ångra', 409)
  }
  if (row.status === 'approved' && !isApprovalStuck(row)) {
    throw new NewsletterError('Godkännandet pågår – vänta en stund och försök igen', 409)
  }

  if (row.resend_broadcast_id) {
    const state = await getBroadcastState(row.resend_broadcast_id)
    if (state.state === 'sent') {
      await markDelivered(supabase, row.id, state)
      throw new NewsletterError('Brevet har redan gått ut och går inte att ångra', 409)
    }
    if (state.state !== 'missing') await removeBroadcast(row.resend_broadcast_id)
  }

  const { data, error } = await supabase
    .from('newsletter_issues')
    .update({
      status: 'proposed',
      approved_at: null,
      scheduled_for: null,
      resend_broadcast_id: null,
      recipient_count: null,
      error: null,
    })
    .eq('id', row.id)
    .in('status', ['scheduled', 'approved'])
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new NewsletterError('Brevet ändrades på annat håll – ladda om sidan', 409)
  console.log(`↩️  Torsdagsbrevet ${row.issue_date}: godkännandet ångrat, utskicket avbokat`)
  return data as NewsletterIssue
}

/** Hoppar över veckan: inget brev, inga fler påminnelser. Går att ångra. */
export async function skipIssue(supabase: SupabaseClient, row: NewsletterIssue): Promise<NewsletterIssue> {
  if (!EDITABLE.includes(row.status)) throw new NewsletterError('Brevet går inte att hoppa över i det här läget', 409)
  const { data, error } = await supabase
    .from('newsletter_issues')
    .update({ status: 'skipped', error: 'Överhoppat manuellt' })
    .eq('id', row.id)
    .in('status', EDITABLE)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new NewsletterError('Brevet ändrades på annat håll – ladda om sidan', 409)
  return data as NewsletterIssue
}

/**
 * Ett schemalagt utskick vars tid har passerat: läs av i Resend om det gått
 * ut och markera raden 'sent'. Kastar aldrig – vid fel lämnas raden orörd.
 */
export async function refreshIssueStatus(supabase: SupabaseClient, row: NewsletterIssue): Promise<NewsletterIssue> {
  if (row.status !== 'scheduled' || !row.resend_broadcast_id || !row.scheduled_for) return row
  if (Date.now() < new Date(row.scheduled_for).getTime() + 60_000) return row
  if (!process.env.RESEND_API_KEY) return row
  try {
    const state = await getBroadcastState(row.resend_broadcast_id)
    if (state.state === 'sent') return await markDelivered(supabase, row.id, state)
    if (state.state === 'missing') {
      return await patchIssue(supabase, row.id, { status: 'failed', error: 'Det schemalagda utskicket finns inte längre i Resend' })
    }
    return row
  } catch (error) {
    console.warn('⚠️ Kunde inte läsa av utskickets status i Resend:', error instanceof Error ? error.message : error)
    return row
  }
}
