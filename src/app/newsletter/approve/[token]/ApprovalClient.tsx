'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  Eye,
  ImageOff,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Send,
  SkipForward,
  Sparkles,
  TriangleAlert,
  Undo2,
  X,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NewsletterApprovalView } from '@/lib/newsletter/issues'
import { eventDay, eventWhenLabel, formatStockholm, formatWeekendRange } from '@/lib/newsletter/dates'
import {
  COMMENT_TARGET_LENGTH,
  MAX_PICKS,
  NewsletterCandidate,
  NewsletterDraft,
  SUBJECT_TARGET_LENGTH,
  draftFromContent,
  draftFromSuggestion,
  validateDraft,
} from '@/lib/newsletter/proposal'

type Action = 'save' | 'preview' | 'test' | 'approve' | 'undo' | 'skip' | 'reload'
type Message = { kind: 'error' | 'info' | 'ok'; text: string }

/** Så många kandidater visas innan man väljer "Visa alla" */
const CANDIDATES_SHOWN = 10
const TEST_EMAIL_KEY = 'torsdagsbrevet-testadress'
const FIELD =
  'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base leading-relaxed text-gray-900 focus:outline-none focus:ring-2 focus:ring-sea'

/** Utkastet sidan startar med: det sparade innehållet, annars AI:ns förslag */
function initialDraft(view: NewsletterApprovalView): NewsletterDraft {
  const suggestion = view.proposal?.suggestion ?? null
  if (view.content) {
    const saved = draftFromContent(view.content)
    // Reservernas AI-rader följer med, så att ett byte av evenemang har en rad att utgå från
    return { ...saved, comments: { ...(suggestion?.comments ?? {}), ...saved.comments } }
  }
  if (suggestion) return draftFromSuggestion(suggestion, '')
  return { pickEventIds: [], comments: {}, subject: '', preheader: '', intro: '', signoff: '', ps: null }
}

function dayCount(c: NewsletterCandidate): number {
  return new Set(c.occurrences.map((o) => eventDay(o.dateTime))).size
}

function metaLine(c: NewsletterCandidate): string {
  return [eventWhenLabel(c.dateTime), c.venue, c.price].filter(Boolean).join(' · ')
}

export default function ApprovalClient({ token, initial }: { token: string; initial: NewsletterApprovalView }) {
  const [view, setView] = useState<NewsletterApprovalView>(initial)
  const [draft, setDraft] = useState<NewsletterDraft>(() => initialDraft(initial))
  const [dirty, setDirty] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewStale, setPreviewStale] = useState(false)
  const [busy, setBusy] = useState<Action | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [testEmail, setTestEmail] = useState(initial.defaultTestEmail ?? '')
  const [showAll, setShowAll] = useState(false)
  const [filter, setFilter] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const proposal = view.proposal
  const suggestion = proposal?.suggestion ?? null
  const editable = view.status === 'proposed' || view.status === 'failed'

  // Klockan: avgör om brevet schemaläggs eller skickas direkt
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // Senast använda testadress (per webbläsare)
  useEffect(() => {
    if (initial.defaultTestEmail) return
    try {
      const saved = window.localStorage.getItem(TEST_EMAIL_KEY)
      if (saved) setTestEmail(saved)
    } catch {
      // localStorage kan vara avstängt - då får adressen skrivas in för hand
    }
  }, [initial.defaultTestEmail])

  const candidatesById = useMemo(() => new Map((proposal?.candidates ?? []).map((c) => [c.eventId, c])), [proposal])
  const picks = useMemo(
    () => draft.pickEventIds.map((id) => candidatesById.get(id)).filter((c): c is NewsletterCandidate => !!c),
    [draft.pickEventIds, candidatesById]
  )
  const validation = useMemo(
    () => (proposal ? validateDraft(proposal, draft) : { errors: ['Förslag saknas'], warnings: [] }),
    [proposal, draft]
  )

  const sendsNow = now >= new Date(view.sendAt).getTime() - 2 * 60_000
  const expired = now > new Date(view.deadline).getTime()
  const sendTimeLabel = formatStockholm(view.sendAt)
  const weekendLabel = formatWeekendRange(view.weekendStart, view.weekendEnd)
  const recipients = view.activeSubscribers
  const recipientsLabel = recipients == null ? 'prenumeranterna' : `${recipients} prenumerant${recipients === 1 ? '' : 'er'}`

  const call = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/newsletter/approve/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (data.view) setView(data.view)
      if (!res.ok) throw new Error(data.error || `Fel ${res.status}`)
      return data
    },
    [token]
  )

  // Första förhandsvisningen: brevet som det är sparat
  const hasContent = !!initial.content
  useEffect(() => {
    if (!hasContent) return
    let alive = true
    call({ action: 'preview' })
      .then((data) => {
        if (alive && typeof data.html === 'string') setPreviewHtml(data.html)
      })
      .catch(() => {
        // Förhandsvisningen går att hämta igen med knappen
      })
    return () => {
      alive = false
    }
  }, [call, hasContent])

  function change(patch: Partial<NewsletterDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
    setDirty(true)
    setPreviewStale(true)
  }

  function addPick(id: number) {
    if (draft.pickEventIds.includes(id) || draft.pickEventIds.length >= MAX_PICKS) return
    change({ pickEventIds: [...draft.pickEventIds, id] })
  }

  function removePick(id: number) {
    change({ pickEventIds: draft.pickEventIds.filter((x) => x !== id) })
  }

  function movePick(id: number, dir: -1 | 1) {
    const i = draft.pickEventIds.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= draft.pickEventIds.length) return
    const next = [...draft.pickEventIds]
    ;[next[i], next[j]] = [next[j], next[i]]
    change({ pickEventIds: next })
  }

  async function run(action: Action, fn: () => Promise<void>) {
    setBusy(action)
    setMessage(null)
    try {
      await fn()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
    }
  }

  const save = () =>
    run('save', async () => {
      await call({ action: 'save', draft })
      setDirty(false)
      setMessage({ kind: 'ok', text: 'Ändringarna är sparade.' })
    })

  const preview = () =>
    run('preview', async () => {
      const data = await call(editable ? { action: 'preview', draft } : { action: 'preview' })
      setPreviewHtml(data.html)
      setPreviewStale(false)
      if (editable) setDirty(false)
    })

  const sendTest = () =>
    run('test', async () => {
      const to = testEmail.trim()
      if (!to) throw new Error('Skriv in adressen som testmejlet ska gå till')
      await call(editable ? { action: 'test', to, draft } : { action: 'test', to })
      if (editable) setDirty(false)
      try {
        window.localStorage.setItem(TEST_EMAIL_KEY, to)
      } catch {
        // spelar ingen roll om adressen inte kan sparas
      }
      setMessage({ kind: 'ok', text: `Testmejl skickat till ${to}.` })
    })

  const approve = () => {
    const notes = validation.warnings.length ? `\n\nObs:\n- ${validation.warnings.join('\n- ')}` : ''
    const question = sendsNow
      ? `Skicka brevet NU till ${recipientsLabel}? Det går inte att ångra.${notes}`
      : `Godkänn brevet? Det går ut ${sendTimeLabel} till ${recipientsLabel}.${notes}`
    if (!window.confirm(question)) return
    return run('approve', async () => {
      const data = await call({ action: 'approve', draft })
      setDirty(false)
      const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : []
      setMessage(
        warnings.length
          ? { kind: 'info', text: `Brevet är ${data.outcome === 'sent' ? 'skickat' : 'schemalagt'}, men: ${warnings.join(' · ')}` }
          : null
      )
    })
  }

  const undo = (question: string) => {
    if (!window.confirm(question)) return
    return run('undo', async () => {
      await call({ action: 'undo' })
    })
  }

  const skip = () => {
    if (!window.confirm('Hoppa över veckans brev? Inget skickas och påminnelserna slutar.')) return
    return run('skip', async () => {
      await call({ action: 'skip' })
    })
  }

  const reload = () =>
    run('reload', async () => {
      const res = await fetch(`/api/newsletter/approve/${token}`)
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) throw new Error(data?.error || `Fel ${res.status}`)
      setView(data)
    })

  // ------------------------------------------------------------------
  // Delar som återkommer i flera lägen
  // ------------------------------------------------------------------
  const messageBox = message ? (
    <div
      className={`rounded-xl border p-3 text-sm ${
        message.kind === 'error'
          ? 'border-red-200 bg-red-50 text-red-900'
          : message.kind === 'ok'
            ? 'border-green-200 bg-green-50 text-green-900'
            : 'border-blue-200 bg-blue-50 text-blue-900'
      }`}
    >
      {message.text}
    </div>
  ) : null

  const previewSection = (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Förhandsvisning</h2>
        <Button type="button" variant="outline" size="sm" onClick={preview} disabled={busy !== null}>
          {busy === 'preview' ? <Loader2 className="animate-spin" /> : <Eye />} {editable ? 'Uppdatera' : 'Visa igen'}
        </Button>
      </div>
      {previewStale && previewHtml && (
        <p className="text-xs text-amber-700">Förhandsvisningen visar inte dina senaste ändringar. Tryck på Uppdatera.</p>
      )}
      {previewHtml ? (
        <iframe
          title="Förhandsvisning av mejlet"
          // Länkar i mejlet öppnas i ny flik i stället för att ersätta förhandsvisningen
          srcDoc={previewHtml.replace('<head>', '<head><base target="_blank">')}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          className="w-full h-[70vh] min-h-[480px] rounded-xl border bg-white"
        />
      ) : (
        <div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-gray-500">
          {busy === 'preview' ? 'Hämtar förhandsvisningen…' : 'Tryck på knappen för att se mejlet som det kommer att se ut.'}
        </div>
      )}
    </section>
  )

  const testSection = (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Testmejl</h2>
      <p className="text-xs text-gray-500">
        Skickas bara till adressen du anger, aldrig till prenumeranterna. Avregistreringslänken i testet leder till sajten.
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          placeholder="din@adress.se"
          className={`${FIELD} min-w-0 flex-1`}
        />
        <Button type="button" variant="outline" size="lg" onClick={sendTest} disabled={busy !== null || !view.canSendTest}>
          {busy === 'test' ? <Loader2 className="animate-spin" /> : <Mail />} Skicka test
        </Button>
      </div>
      {!view.canSendTest && <p className="text-xs text-amber-700">Testmejl kräver att RESEND_API_KEY är satt.</p>}
    </section>
  )

  const title = `Helgen ${weekendLabel}`

  // ------------------------------------------------------------------
  // Färdiga tillstånd
  // ------------------------------------------------------------------
  if (view.status === 'sent') {
    return (
      <Shell title={title} subtitle="Brevet är skickat">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex gap-3 items-start">
          <CheckCircle2 className="text-green-600 mt-0.5 shrink-0" />
          <div className="text-sm text-green-900">
            <p className="font-medium">Torsdagsbrevet har gått ut.</p>
            <p className="text-green-800">
              {view.sentAt ? `Skickat ${formatStockholm(view.sentAt)}` : 'Skickat'}
              {view.recipientCount != null ? ` till ${view.recipientCount} mottagare.` : '.'}
            </p>
          </div>
        </div>
        {messageBox}
        {previewSection}
      </Shell>
    )
  }

  if (view.status === 'scheduled') {
    return (
      <Shell title={title} subtitle="Godkänt och schemalagt">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex gap-3 items-start">
          <CalendarClock className="text-green-600 mt-0.5 shrink-0" />
          <div className="text-sm text-green-900 space-y-2">
            <p className="font-medium">
              Brevet går ut {view.scheduledFor ? formatStockholm(view.scheduledFor) : sendTimeLabel}
              {view.recipientCount != null ? ` till ${view.recipientCount} mottagare` : ''}.
            </p>
            <p className="text-green-800">Vill du ändra något? Ångra godkännandet, gör ändringen och godkänn igen.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => undo('Ångra godkännandet? Det schemalagda utskicket avbokas och brevet går tillbaka till förslag.')}
            >
              {busy === 'undo' ? <Loader2 className="animate-spin" /> : <Undo2 />} Ångra godkännandet
            </Button>
          </div>
        </div>
        {messageBox}
        {previewSection}
        {testSection}
      </Shell>
    )
  }

  if (view.status === 'approved') {
    return (
      <Shell title={title} subtitle={view.approvalStuck ? 'Godkännandet avbröts' : 'Godkännandet pågår'}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 items-start">
          {view.approvalStuck ? <TriangleAlert className="text-amber-600 mt-0.5 shrink-0" /> : <Loader2 className="text-amber-600 mt-0.5 shrink-0 animate-spin" />}
          <div className="text-sm text-amber-900 space-y-2">
            {view.approvalStuck ? (
              <>
                <p className="font-medium">Brevet godkändes men blev aldrig schemalagt.</p>
                <p>Inget har skickats. Gå tillbaka till förslaget och godkänn igen.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => undo('Gå tillbaka till förslaget? Ett eventuellt påbörjat utskick avbokas.')}
                >
                  {busy === 'undo' ? <Loader2 className="animate-spin" /> : <Undo2 />} Tillbaka till förslaget
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium">Prenumeranterna synkas och utskicket schemaläggs.</p>
                <p>Det brukar ta under en minut.</p>
                <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={reload}>
                  {busy === 'reload' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Uppdatera
                </Button>
              </>
            )}
          </div>
        </div>
        {messageBox}
      </Shell>
    )
  }

  if (view.status === 'skipped') {
    return (
      <Shell title={title} subtitle="Inget brev den här veckan">
        <div className="rounded-xl border border-gray-200 bg-white p-4 flex gap-3 items-start">
          <SkipForward className="text-gray-500 mt-0.5 shrink-0" />
          <div className="text-sm text-gray-800 space-y-2">
            <p className="font-medium">Veckans brev är överhoppat.</p>
            {view.error && <p className="text-gray-600">{view.error}</p>}
            {view.content && !expired && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => undo('Ta tillbaka veckans brev som förslag? Inget skickas förrän du godkänner.')}
              >
                {busy === 'undo' ? <Loader2 className="animate-spin" /> : <Undo2 />} Ångra
              </Button>
            )}
          </div>
        </div>
        {messageBox}
      </Shell>
    )
  }

  if (!proposal || proposal.candidates.length === 0) {
    return (
      <Shell title={title} subtitle="Inget förslag">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 items-start">
          <TriangleAlert className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-900">{view.error || 'Det finns inga publicerade evenemang i helgen, så det finns inget att godkänna.'}</p>
        </div>
      </Shell>
    )
  }

  // ------------------------------------------------------------------
  // Redigeraren (proposed / failed)
  // ------------------------------------------------------------------
  const full = picks.length >= MAX_PICKS
  const query = filter.trim().toLowerCase()
  const others = proposal.candidates.filter((c) => !draft.pickEventIds.includes(c.eventId))
  const matching = query
    ? others.filter((c) => `${c.name} ${c.venue ?? ''} ${c.categories.join(' ')}`.toLowerCase().includes(query))
    : others
  const visible = query || showAll ? matching : matching.slice(0, CANDIDATES_SHOWN)
  const canApprove = !expired && validation.errors.length === 0 && view.missingConfig.length === 0 && busy === null

  return (
    <Shell title={title} subtitle={view.status === 'failed' ? 'Utskicket misslyckades - försök igen' : 'Godkänn veckans brev'}>
      {view.status === 'failed' && view.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3 items-start">
          <XCircle className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-900">{view.error}</p>
        </div>
      )}

      {/* När och till hur många */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex gap-3 items-start">
        <CalendarClock className="text-sea mt-0.5 shrink-0" />
        <div className="text-sm text-gray-800 space-y-1">
          {expired ? (
            <p className="font-medium">Tiden för veckans brev har gått ut. Helgen är redan igång.</p>
          ) : sendsNow ? (
            <p className="font-medium">Klockan har passerat utskickstiden. Brevet skickas direkt när du godkänner, till {recipientsLabel}.</p>
          ) : (
            <p className="font-medium">
              Går ut {sendTimeLabel} till {recipientsLabel}.
            </p>
          )}
          <p className="text-gray-600">Inget skickas förrän du har godkänt. Utan godkännande blir det inget brev den här veckan.</p>
          {view.missingConfig.length > 0 && (
            <p className="text-amber-700">
              Utskick är inte påslaget än. Saknas: {view.missingConfig.join(', ')}. Du kan redigera, förhandsvisa och skicka testmejl.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-8">
        {/* Veckans tre */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Veckans tre ({picks.length}/{MAX_PICKS})
          </h2>
          {suggestion?.source === 'fallback' && (
            <p className="text-xs text-amber-700">
              AI:n svarade inte, så urvalet är de högst rankade evenemangen och raderna är tomma. Skriv en rad om varje.
            </p>
          )}
          {picks.length === 0 && (
            <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-gray-500">Välj evenemang i listan nedan.</p>
          )}
          <ol className="space-y-3">
            {picks.map((c, i) => {
              const comment = draft.comments[String(c.eventId)] ?? ''
              const suggested = suggestion?.comments[String(c.eventId)]
              return (
                <li key={c.eventId} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="flex gap-3 p-3">
                    <Thumb c={c} className="w-24 sm:w-32" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold text-gray-900 leading-tight">
                        {i + 1}. {c.name}
                      </p>
                      <p className="text-xs text-gray-500">{metaLine(c)}</p>
                      {dayCount(c) > 1 && <p className="text-[11px] text-gray-500">{dayCount(c)} dagar i helgen</p>}
                    </div>
                    <div className="flex flex-col items-center shrink-0">
                      <button type="button" onClick={() => movePick(c.eventId, -1)} disabled={i === 0} className="p-1.5 text-gray-500 disabled:opacity-30" aria-label="Flytta upp">
                        <ArrowUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePick(c.eventId, 1)}
                        disabled={i === picks.length - 1}
                        className="p-1.5 text-gray-500 disabled:opacity-30"
                        aria-label="Flytta ner"
                      >
                        <ArrowDown className="size-4" />
                      </button>
                      <button type="button" onClick={() => removePick(c.eventId)} className="p-1.5 text-gray-500" aria-label={`Ta bort ${c.name}`}>
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="px-3 pb-3 space-y-1.5">
                    {c.excerpt && <p className="text-xs text-gray-500 line-clamp-3">{c.excerpt}</p>}
                    <textarea
                      value={comment}
                      onChange={(e) => change({ comments: { ...draft.comments, [String(c.eventId)]: e.target.value } })}
                      rows={3}
                      placeholder="En rad om varför det här är värt att gå på"
                      aria-label={`Rad om ${c.name}`}
                      className={FIELD}
                    />
                    <p className="flex items-center justify-between gap-2 text-xs">
                      <span className={comment.trim().length > COMMENT_TARGET_LENGTH ? 'text-amber-700' : 'text-gray-500'}>
                        {comment.trim().length} / {COMMENT_TARGET_LENGTH} tecken
                      </span>
                      {suggested && suggested === comment && (
                        <span className="inline-flex items-center gap-1 text-gray-500">
                          <Sparkles className="size-3" /> AI-förslag, läs och justera
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        {/* Övriga kandidater */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Byt eller lägg till</h2>
          <p className="text-xs text-gray-500">
            {proposal.totalWeekendCount} evenemang i helgen, högst rankade först. Det du inte väljer hamnar under ”Mer i helgen” i brevet.
            {full ? ' Ta bort ett av de tre för att kunna välja ett annat.' : ''}
          </p>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Sök evenemang eller plats"
            aria-label="Sök bland helgens evenemang"
            className={FIELD}
          />
          <ul className="divide-y rounded-xl border bg-white">
            {visible.map((c) => (
              <li key={c.eventId} className="flex items-center gap-3 p-2">
                <Thumb c={c} className="w-16" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-500 truncate">{metaLine(c)}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {[
                      c.categories[0],
                      dayCount(c) > 1 ? `${dayCount(c)} dagar` : null,
                      c.ongoing ? 'pågår länge' : null,
                      c.imageUrl ? null : 'utan bild',
                      suggestion?.comments[String(c.eventId)] ? 'AI-rad finns' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addPick(c.eventId)}
                  disabled={full}
                  aria-label={`Välj ${c.name}`}
                >
                  <Plus /> Välj
                </Button>
              </li>
            ))}
            {visible.length === 0 && <li className="p-4 text-sm text-gray-500">Inga evenemang matchar sökningen.</li>}
          </ul>
          {!query && matching.length > CANDIDATES_SHOWN && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-sm font-medium text-sea">
              {showAll ? 'Visa färre' : `Visa alla ${matching.length}`}
            </button>
          )}
        </section>

        {/* Texterna */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Texter</h2>
          <Field
            label="Ämnesrad"
            hint={`${draft.subject.trim().length} / ${SUBJECT_TARGET_LENGTH} tecken`}
            warn={draft.subject.trim().length > SUBJECT_TARGET_LENGTH}
          >
            <input type="text" value={draft.subject} onChange={(e) => change({ subject: e.target.value })} className={FIELD} />
          </Field>
          <Field label="Preheader" hint="Texten som syns efter ämnesraden i inkorgen">
            <input type="text" value={draft.preheader} onChange={(e) => change({ preheader: e.target.value })} className={FIELD} />
          </Field>
          <Field label="Intro" hint="En eller två meningar överst. Ny rad ger nytt stycke.">
            <textarea value={draft.intro} onChange={(e) => change({ intro: e.target.value })} rows={3} className={FIELD} />
          </Field>
          <Field label="Avslutning" hint="Hälsning och namn, en rad var">
            <textarea value={draft.signoff} onChange={(e) => change({ signoff: e.target.value })} rows={2} className={FIELD} />
          </Field>
          <Field label="P.S." hint="Valfritt. En länk skrivs [text](https://…)">
            <textarea value={draft.ps ?? ''} onChange={(e) => change({ ps: e.target.value || null })} rows={2} className={FIELD} />
          </Field>
        </section>

        {previewSection}
        {testSection}

        {messageBox}
        {validation.errors.length > 0 && (
          <ul className="text-sm text-red-700 space-y-0.5">
            {validation.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {validation.warnings.length > 0 && (
          <ul className="text-sm text-amber-700 space-y-0.5">
            {validation.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-gray-50/95 backdrop-blur border-t flex gap-2">
          <Button type="button" size="lg" className="flex-1" onClick={approve} disabled={!canApprove}>
            {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Send />} {sendsNow ? 'Godkänn och skicka nu' : 'Godkänn'}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={save} disabled={busy !== null || !dirty}>
            {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />} Spara
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={skip} disabled={busy !== null} aria-label="Hoppa över veckan" title="Hoppa över veckan">
            {busy === 'skip' ? <Loader2 className="animate-spin" /> : <SkipForward />}
          </Button>
        </div>
      </div>
    </Shell>
  )
}

function Thumb({ c, className }: { c: NewsletterCandidate; className: string }) {
  return (
    <div className={`relative aspect-video shrink-0 self-start overflow-hidden rounded-md bg-gray-100 ${className}`}>
      {c.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.emailImageUrl ?? c.imageUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-gray-400">
          <ImageOff className="size-4" />
        </span>
      )}
    </div>
  )
}

function Field({ label, hint, warn, children }: { label: string; hint?: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-900">{label}</span>
      {children}
      {hint && <span className={`block text-xs ${warn ? 'text-amber-700' : 'text-gray-500'}`}>{hint}</span>}
    </label>
  )
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <header className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-sea uppercase">iVarberg · Torsdagsbrevet</p>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-600">{subtitle}</p>
        </header>
        {children}
      </div>
    </main>
  )
}
