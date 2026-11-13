/**
 * Torsdagsbrevet – pipelinen som cronen kör.
 *
 * Körs schemalagt av GitHub Actions via scripts/run-newsletter.ts (se
 * .github/workflows/weekly-newsletter.yml) och manuellt från adminsidan
 * Nyhetsbrev. Idempotent per torsdag, dubbletter är omöjliga.
 *
 * FLÖDET
 *   1. Onsdag från kl 15 (svensk tid): veckans FÖRSLAG skapas. Helgens
 *      publicerade evenemang hämtas, upprepade tillfällen slås ihop och
 *      poängsätts, AI:n föreslår tre evenemang med en rad var samt ämnesrad,
 *      preheader och intro. Förslaget sparas i newsletter_issues med status
 *      'proposed' och en engångstoken, och en ntfy-notis skickas med länk
 *      till godkännandesidan (/newsletter/approve/<token>).
 *   2. Onsdag kväll (från kl 20) och torsdag morgon (från kl 06): en
 *      påminnelse om förslaget fortfarande väntar.
 *   3. En människa godkänner på sidan. Då, och bara då, schemaläggs ett
 *      Broadcast till torsdag 07:00 (se approveIssue i issues.ts).
 *
 * Runnern skickar ALDRIG brevet. Utan godkännande blir det inget brev den
 * veckan, och förslaget markeras 'skipped' när helgen har börjat.
 *
 * Allt ligger bakom NEWSLETTER_ENABLED=true. Utan den gör cronen ingenting.
 */
import { SupabaseClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'
import { NewsletterIssue, NewsletterReminder } from '@/types/database'
import { alertService } from '../services/alert-service'
import { sendNtfy } from '../services/ntfy'
import { getPostHogClient } from '../services/openai-client'
import { suggestNewsletter } from './ai'
import { approvalApiUrlFor, approvalUrlFor, envSignoff, newsletterEnabled } from './config'
import {
  SEND_HOUR,
  addDays,
  approvalDeadlineFor,
  formatWeekendRange,
  sendTimeFor,
  stockholmNow,
  upcomingIssueDate,
  weekendFor,
} from './dates'
import { ensureEmailImages } from './images'
import { countSubscribers, loadIssueByDate, newsletterServiceClient, refreshIssueStatus } from './issues'
import { NewsletterProposal, buildContent, draftFromSuggestion } from './proposal'
import { NewsletterContent } from './types'
import { buildCandidates, getWeekendEvents } from './weekend-events'

/** Onsdag: förslaget skapas tidigast då (svensk tid) */
export const PROPOSAL_HOUR = 15
/** Onsdag: kvällspåminnelse tidigast då */
export const EVENING_REMINDER_HOUR = 20
/** Torsdag: morgonpåminnelse tidigast då */
export const MORNING_REMINDER_HOUR = 6
/** Torsdag: efter det här klockslaget skapas inget förslag och skickas ingen påminnelse automatiskt */
export const THURSDAY_CUTOFF_HOUR = 12
/** En påminnelse skickas inte tätare än så här efter förslaget eller förra notisen */
const REMINDER_MIN_GAP_MS = 90 * 60_000

export interface NewsletterRunOptions {
  /** Kringgå tidsfönstret (skapa förslaget oavsett veckodag och klockslag) */
  force?: boolean
  /** Ta fram förslaget och skriv ut det, men spara inget och skicka ingen notis */
  dryRun?: boolean
}

export type NewsletterRunStatus =
  | 'disabled' // NEWSLETTER_ENABLED är inte satt
  | 'proposed' // förslag skapat, notis skickad
  | 'reminded' // påminnelse skickad
  | 'awaiting-approval' // förslag väntar, inget att göra just nu
  | 'scheduled'
  | 'sent'
  | 'skipped'
  | 'outside-window' // varken onsdag eftermiddag eller torsdag morgon
  | 'dry-run'

export interface NewsletterRunResult {
  ok: boolean
  status: NewsletterRunStatus
  issueDate: string
  reason?: string
  subject?: string
  picks?: string[]
  approvalUrl?: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} environment variable`)
  return value
}

// ---------------------------------------------------------------------------
// Förslaget
// ---------------------------------------------------------------------------

/** Avslutningen brukar vara densamma vecka efter vecka: ta den från förra brevet, annars standard */
async function defaultSignoff(supabase: SupabaseClient, issueDate: string): Promise<string> {
  const { data } = await supabase
    .from('newsletter_issues')
    .select('content')
    .lt('issue_date', issueDate)
    .not('content', 'is', null)
    .order('issue_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const previous = (data?.content as NewsletterContent | null | undefined)?.signoff?.trim()
  return previous || envSignoff()
}

/**
 * Tar fram veckans förslag: kandidater, AI:ns urval och text, mejlbilder för
 * de föreslagna evenemangen och det första utkastet till innehåll.
 * content är null om helgen saknar publicerade evenemang.
 */
export async function buildProposal(
  supabase: SupabaseClient,
  issueDate: string,
  options: { skipImages?: boolean } = {}
): Promise<{ proposal: NewsletterProposal; content: NewsletterContent | null }> {
  const weekend = weekendFor(issueDate)
  console.log(`📅 Hämtar publicerade evenemang ${weekend.start} till ${weekend.end}...`)
  const events = await getWeekendEvents(supabase, issueDate)
  const candidates = buildCandidates(events)
  console.log(`   ${events.length} evenemang, ${candidates.length} efter sammanslagning av upprepade tillfällen\n`)

  const proposal: NewsletterProposal = {
    version: 1,
    generatedAt: new Date().toISOString(),
    issueDate,
    weekendStart: weekend.start,
    weekendEnd: weekend.end,
    candidates,
    totalWeekendCount: candidates.length,
    rawEventCount: events.length,
    suggestion: null,
  }
  if (candidates.length === 0) return { proposal, content: null }

  console.log('🤖 AI föreslår urval och text...')
  proposal.suggestion = await suggestNewsletter({
    candidates,
    weekendStart: weekend.start,
    weekendEnd: weekend.end,
    totalWeekendCount: candidates.length,
  })
  const byId = new Map(candidates.map((c) => [c.eventId, c]))
  console.log(`   Källa: ${proposal.suggestion.source === 'ai' ? 'AI' : 'reserv (högst rankade, tomma rader)'}`)
  console.log(`   Veckans tre: ${proposal.suggestion.pickEventIds.map((id) => byId.get(id)?.name).join(' | ')}\n`)

  if (!options.skipImages) {
    console.log('🖼️  Skapar mejlbilder (JPEG 1200×675)...')
    await ensureEmailImages(supabase, proposal, proposal.suggestion.pickEventIds)
  }

  const signoff = await defaultSignoff(supabase, issueDate)
  const content = buildContent(proposal, draftFromSuggestion(proposal.suggestion, signoff))
  return { proposal, content }
}

async function notifyProposal(supabase: SupabaseClient, issue: NewsletterIssue): Promise<boolean> {
  const content = issue.content
  const token = issue.approval_token
  if (!content || !token) return false
  const url = approvalUrlFor(token)
  const subscribers = await countSubscribers(supabase)
    .then((c) => c.active)
    .catch(() => null)
  const afterSendTime = Date.now() >= sendTimeFor(issue.issue_date).getTime()

  const lines = content.picks.map((p, i) => `${i + 1}. ${p.name}`)
  lines.push(`${content.totalWeekendCount} evenemang i helgen ${formatWeekendRange(content.weekendStart, content.weekendEnd)}.`)
  lines.push(
    afterSendTime
      ? `Klockan har passerat ${String(SEND_HOUR).padStart(2, '0')}:00. Brevet skickas direkt när du godkänner${subscribers != null ? `, till ${subscribers} prenumeranter` : ''}.`
      : `Går ut torsdag ${String(SEND_HOUR).padStart(2, '0')}:00${subscribers != null ? ` till ${subscribers} prenumeranter` : ''} om du godkänner.`
  )
  lines.push('Utan godkännande skickas inget.')

  return sendNtfy({
    title: `Torsdagsbrevet ${issue.issue_date}: förslag klart`,
    message: lines.join('\n'),
    click: url,
    attach: content.picks.find((p) => p.imageUrl)?.imageUrl ?? undefined,
    priority: 4,
    tags: ['email'],
    actions: [
      { action: 'view', label: 'Granska & godkänn', url },
      {
        action: 'http',
        label: 'Hoppa över veckan',
        url: approvalApiUrlFor(token),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip' }),
        clear: true,
      },
    ],
  })
}

export interface CreateProposalResult {
  issue: NewsletterIssue
  /** false om raden redan fanns (en annan körning hann före) */
  created: boolean
}

/**
 * Skapar veckans förslag och sparar det. Används av cronen och av knappen
 * på adminsidan (då med regenerate för att göra om ett befintligt förslag).
 *
 * Ett förslag som redan är godkänt, schemalagt eller skickat rörs aldrig.
 */
export async function createProposal(
  supabase: SupabaseClient,
  issueDate: string,
  options: { notify: boolean; regenerate?: boolean }
): Promise<CreateProposalResult> {
  const existing = await loadIssueByDate(supabase, issueDate)
  if (existing) {
    const replaceable = existing.status === 'proposed' || existing.status === 'failed' || existing.status === 'skipped'
    if (!options.regenerate || !replaceable) return { issue: existing, created: false }
  }

  const { proposal, content } = await buildProposal(supabase, issueDate)
  const noEvents = content === null
  const fields = {
    status: noEvents ? ('skipped' as const) : ('proposed' as const),
    proposal,
    content,
    error: noEvents ? 'Inga publicerade evenemang i helgen' : null,
    approved_at: null,
    scheduled_for: null,
    resend_broadcast_id: null,
    sent_at: null,
    recipient_count: null,
  }

  let issue: NewsletterIssue
  if (existing) {
    const { data, error } = await supabase
      .from('newsletter_issues')
      .update(fields)
      .eq('id', existing.id)
      .in('status', ['proposed', 'failed', 'skipped'])
      .select('*')
      .maybeSingle()
    if (error) throw new Error(`Kunde inte spara förslaget: ${error.message}`)
    if (!data) return { issue: (await loadIssueByDate(supabase, issueDate)) ?? existing, created: false }
    issue = data as NewsletterIssue
  } else {
    const { data, error } = await supabase
      .from('newsletter_issues')
      .insert({ issue_date: issueDate, approval_token: nanoid(32), ...fields })
      .select('*')
      .single()
    if (error) {
      // UNIQUE(issue_date): en annan körning hann skapa veckans rad
      if (error.code === '23505') {
        const other = await loadIssueByDate(supabase, issueDate)
        if (other) return { issue: other, created: false }
      }
      throw new Error(`Kunde inte spara förslaget: ${error.message}`)
    }
    issue = data as NewsletterIssue
  }

  getPostHogClient().capture({
    distinctId: 'newsletter-bot',
    event: noEvents ? 'newsletter_skipped' : 'newsletter_proposed',
    properties: {
      issue_date: issueDate,
      candidates: proposal.candidates.length,
      raw_events: proposal.rawEventCount,
      source: proposal.suggestion?.source ?? null,
      regenerated: !!existing,
    },
  })

  if (options.notify) {
    const notified = noEvents
      ? await sendNtfy({
          title: `Torsdagsbrevet ${issueDate}: inget brev`,
          message: 'Det finns inga publicerade evenemang i helgen, så inget förslag skapades.',
          priority: 3,
          tags: ['warning'],
        })
      : await notifyProposal(supabase, issue)
    if (notified) {
      await supabase.from('newsletter_issues').update({ notified_at: new Date().toISOString() }).eq('id', issue.id)
    } else if (!noEvents) {
      await alertService.alert({
        severity: 'warning',
        category: 'api',
        title: '⚠️ Torsdagsbrevet: förslag utan notis',
        message: `Förslaget för ${issueDate} sparades men ntfy-notisen kunde inte skickas. Granska här: ${approvalUrlFor(issue.approval_token!)}`,
        details: { issue_date: issueDate },
        source: 'newsletter-runner',
      })
    }
  }

  return { issue, created: true }
}

// ---------------------------------------------------------------------------
// Påminnelser
// ---------------------------------------------------------------------------

/** Får veckans förslag skapas automatiskt nu? Onsdag från kl 15, eller torsdag förmiddag om onsdagen missades. */
export function proposalWindowOpen(today: { date: string; hour: number }, issueDate: string): boolean {
  const wednesday = today.date === addDays(issueDate, -1) && today.hour >= PROPOSAL_HOUR
  const thursdayMorning = today.date === issueDate && today.hour < THURSDAY_CUTOFF_HOUR
  return wednesday || thursdayMorning
}

/** Vilken påminnelse som ska gå ut nu, om någon */
export function dueReminder(
  issue: Pick<NewsletterIssue, 'issue_date' | 'reminders_sent' | 'notified_at' | 'created_at'>,
  today: { date: string; hour: number },
  nowMs: number = Date.now()
): NewsletterReminder | null {
  const sent = issue.reminders_sent ?? []
  const last = issue.notified_at ?? issue.created_at
  if (last && nowMs - new Date(last).getTime() < REMINDER_MIN_GAP_MS) return null

  if (today.date === addDays(issue.issue_date, -1) && today.hour >= EVENING_REMINDER_HOUR && !sent.includes('evening')) {
    return 'evening'
  }
  if (
    today.date === issue.issue_date &&
    today.hour >= MORNING_REMINDER_HOUR &&
    today.hour < THURSDAY_CUTOFF_HOUR &&
    !sent.includes('morning')
  ) {
    return 'morning'
  }
  return null
}

async function sendReminder(supabase: SupabaseClient, issue: NewsletterIssue, reminder: NewsletterReminder): Promise<boolean> {
  // Ta påminnelsen atomärt, så att två körningar aldrig skickar samma
  // påminnelse två gånger
  const { data: claimed, error } = await supabase
    .from('newsletter_issues')
    .update({ reminders_sent: [...(issue.reminders_sent ?? []), reminder], notified_at: new Date().toISOString() })
    .eq('id', issue.id)
    .in('status', ['proposed', 'failed'])
    .not('reminders_sent', 'cs', `{${reminder}}`)
    .select('id')
  if (error) throw new Error(`Kunde inte registrera påminnelsen: ${error.message}`)
  if (!claimed || claimed.length === 0) return false

  const url = approvalUrlFor(issue.approval_token!)
  const range = issue.content ? formatWeekendRange(issue.content.weekendStart, issue.content.weekendEnd) : ''
  const afterSendTime = Date.now() >= sendTimeFor(issue.issue_date).getTime()
  const sendTime = `${String(SEND_HOUR).padStart(2, '0')}:00`
  const message =
    reminder === 'evening'
      ? `Brevet för helgen ${range} är inte godkänt. Godkänn i kväll eller tidigt i morgon så går det ut torsdag ${sendTime}.`
      : afterSendTime
        ? `Brevet för helgen ${range} är inte godkänt och klockan har passerat ${sendTime}. Godkänner du nu skickas det direkt.`
        : `Sista chansen före ${sendTime}. Brevet för helgen ${range} är inte godkänt. Godkänner du senare i dag skickas det direkt.`

  return sendNtfy({
    title:
      issue.status === 'failed'
        ? `Torsdagsbrevet ${issue.issue_date}: utskicket misslyckades`
        : `Torsdagsbrevet ${issue.issue_date} väntar på godkännande`,
    message: `${message}\nUtan godkännande skickas inget.`,
    click: url,
    priority: reminder === 'morning' ? 5 : 4,
    tags: ['alarm_clock'],
    actions: [{ action: 'view', label: 'Granska & godkänn', url }],
  })
}

// ---------------------------------------------------------------------------
// Städning
// ---------------------------------------------------------------------------

/**
 * Förslag som aldrig godkändes: när tidsgränsen (fredag kl 18) har passerat
 * markeras de 'skipped'. Inget godkännande betyder inget brev den veckan.
 */
async function closeExpiredIssues(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from('newsletter_issues')
    .select('id, issue_date, status')
    .in('status', ['proposed', 'approved'])
  if (error) {
    console.warn('⚠️ Kunde inte läsa äldre utskick:', error.message)
    return
  }
  for (const row of (data ?? []) as Pick<NewsletterIssue, 'id' | 'issue_date' | 'status'>[]) {
    if (Date.now() <= approvalDeadlineFor(row.issue_date).getTime()) continue
    const patch =
      row.status === 'approved'
        ? { status: 'failed', error: 'Godkännandet avbröts innan brevet schemalades' }
        : { status: 'skipped', error: 'Inget godkännande – inget brev den veckan' }
    await supabase.from('newsletter_issues').update(patch).eq('id', row.id).eq('status', row.status)
    console.log(`🧹 Utskicket ${row.issue_date} stängt (${patch.status})`)
  }
}

// ---------------------------------------------------------------------------
// Huvudflödet
// ---------------------------------------------------------------------------

export async function runNewsletter(options: NewsletterRunOptions = {}): Promise<NewsletterRunResult> {
  const force = options.force ?? false
  const dryRun = options.dryRun ?? false
  const today = stockholmNow()
  const issueDate = upcomingIssueDate()

  console.log(`📬 Torsdagsbrevet: utskick ${issueDate}`)

  if (!newsletterEnabled() && !dryRun) {
    console.log('⏸️  NEWSLETTER_ENABLED är inte "true" - gör ingenting.')
    return { ok: true, status: 'disabled', issueDate, reason: 'NEWSLETTER_ENABLED är inte satt till true' }
  }

  requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const supabase = newsletterServiceClient()

  try {
    if (dryRun) {
      const { proposal, content } = await buildProposal(supabase, issueDate, { skipImages: true })
      console.log('🧪 DRY RUN - inget sparas och ingen notis skickas.')
      console.log(JSON.stringify({ suggestion: proposal.suggestion, candidates: proposal.candidates.length }, null, 2))
      return {
        ok: true,
        status: 'dry-run',
        issueDate,
        subject: content?.subject,
        picks: content?.picks.map((p) => p.name),
      }
    }

    await closeExpiredIssues(supabase)

    let existing = await loadIssueByDate(supabase, issueDate)
    if (existing) {
      existing = await refreshIssueStatus(supabase, existing)
      const approvalUrl = existing.approval_token ? approvalUrlFor(existing.approval_token) : undefined
      const base = { issueDate, subject: existing.content?.subject, approvalUrl }

      if (existing.status === 'sent') {
        console.log(`✅ Brevet ${issueDate} är skickat - avslutar.`)
        return { ok: true, status: 'sent', ...base }
      }
      if (existing.status === 'scheduled') {
        console.log(`🗓️  Brevet ${issueDate} är godkänt och schemalagt till ${existing.scheduled_for} - avslutar.`)
        return { ok: true, status: 'scheduled', ...base }
      }
      if (existing.status === 'skipped') {
        console.log(`⏭️  Veckans brev är överhoppat (${existing.error ?? 'ingen orsak'}) - avslutar.`)
        return { ok: true, status: 'skipped', ...base, reason: existing.error ?? undefined }
      }
      if (existing.status === 'approved') {
        console.log('⏳ Godkännandet pågår - avslutar.')
        return { ok: true, status: 'awaiting-approval', ...base }
      }

      // proposed / failed: påminn om det är dags. Skicka aldrig själv.
      const reminder = dueReminder(existing, today)
      if (reminder && (await sendReminder(supabase, existing, reminder))) {
        console.log(`🔔 Påminnelse (${reminder === 'evening' ? 'onsdag kväll' : 'torsdag morgon'}) skickad: ${approvalUrl}`)
        return { ok: true, status: 'reminded', ...base }
      }
      console.log(`⏳ Förslaget väntar på godkännande: ${approvalUrl}`)
      return { ok: true, status: 'awaiting-approval', ...base }
    }

    // Ingen rad för veckan: skapa förslaget om det är dags
    if (!proposalWindowOpen(today, issueDate) && !force) {
      console.log(`⏭️  Utanför fönstret (onsdag från kl ${PROPOSAL_HOUR}, torsdag före kl ${THURSDAY_CUTOFF_HOUR}) - hoppar över. Använd force för att kringgå.`)
      return { ok: true, status: 'outside-window', issueDate, reason: `${today.date} kl ${today.hour}` }
    }

    const { issue, created } = await createProposal(supabase, issueDate, { notify: true })
    const approvalUrl = issue.approval_token ? approvalUrlFor(issue.approval_token) : undefined
    if (issue.status === 'skipped') {
      console.log(`⏭️  Inget brev den här veckan: ${issue.error}`)
      return { ok: true, status: 'skipped', issueDate, reason: issue.error ?? undefined }
    }
    console.log(`📨 Förslag ${created ? 'sparat' : 'fanns redan'}: ${approvalUrl}\n`)
    return {
      ok: true,
      status: created ? 'proposed' : 'awaiting-approval',
      issueDate,
      subject: issue.content?.subject,
      picks: issue.content?.picks.map((p) => p.name),
      approvalUrl,
    }
  } catch (error) {
    // Fatalt fel: larma här så att både Vercel-routen och GitHub-skriptet
    // får larmet utan egen duplicerad logik, kasta sedan vidare.
    console.error('\n💥 Fatal error:')
    console.error(error)
    await alertService.alert({
      severity: 'critical',
      category: 'api',
      title: '🚨 Torsdagsbrevet: körningen misslyckades',
      message: error instanceof Error ? error.message : String(error),
      details: { issue_date: issueDate, stack: error instanceof Error ? error.stack : undefined },
      source: 'newsletter-runner',
    })
    throw error
  }
}
