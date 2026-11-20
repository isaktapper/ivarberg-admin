'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  SkipForward,
  Sparkles,
  Star,
  TriangleAlert,
  X,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ApprovalView } from '@/lib/services/instagram-approval'
import {
  CAPTION_MAX_LENGTH,
  HEADLINE_MAX_LENGTH,
  PROPOSAL_LIST_MAX,
  PROPOSAL_LIST_TOP,
  PROPOSAL_MAX_EXTRA_SLIDES,
  ProposalEvent,
  validateSelection,
} from '@/lib/services/instagram-proposal'

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
}

function timeText(e: ProposalEvent): string {
  return e.timeLabel === 'Heldag' ? 'Hela dagen' : e.timeLabel
}

export default function ApprovalClient({ token, initial }: { token: string; initial: ApprovalView }) {
  const [view, setView] = useState<ApprovalView>(initial)
  const proposal = view.proposal
  const suggestion = proposal?.suggestion ?? null

  const eventsById = useMemo(() => new Map((proposal?.events ?? []).map((e) => [e.eventId, e])), [proposal])

  // Möjliga huvudevent: bild som räcker till vykort. AI-förslaget först,
  // sedan vision-rank och huvudkandidater.
  const primaryOptions = useMemo(() => {
    const list = (proposal?.events ?? []).filter((e) => e.imageUsable && e.imageUrl)
    return list.sort((a, b) => {
      const sa = a.eventId === suggestion?.primaryEventId ? 0 : 1
      const sb = b.eventId === suggestion?.primaryEventId ? 0 : 1
      if (sa !== sb) return sa - sb
      const va = a.visionRank ?? 99
      const vb = b.visionRank ?? 99
      if (va !== vb) return va - vb
      return Number(b.isPrimaryCandidate) - Number(a.isPrimaryCandidate)
    })
  }, [proposal, suggestion])

  const [primaryId, setPrimaryId] = useState<number | null>(suggestion?.primaryEventId ?? primaryOptions[0]?.eventId ?? null)
  const [headline, setHeadline] = useState<string>(suggestion?.headline ?? '')
  const [listIds, setListIds] = useState<number[]>(suggestion?.listEventIds ?? [])
  const [extraIds, setExtraIds] = useState<number[]>(suggestion?.extraSlideEventIds ?? [])
  const [caption, setCaption] = useState<string>(suggestion?.caption ?? '')
  const [busy, setBusy] = useState<'publish' | 'skip' | 'caption' | 'headline' | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewRequest = useRef(0)

  const primary = primaryId != null ? eventsById.get(primaryId) ?? null : null
  const listEvents = useMemo(
    () => listIds.map((id) => eventsById.get(id)).filter((e): e is ProposalEvent => !!e),
    [listIds, eventsById]
  )

  const validation = useMemo(() => {
    if (!proposal || primaryId == null) return { ok: false as const, error: 'Välj ett huvudevent' }
    return validateSelection(proposal, { primaryEventId: primaryId, headline, listEventIds: listIds, extraSlideEventIds: extraIds, caption })
  }, [proposal, primaryId, headline, listIds, extraIds, caption])

  // Rita om förhandsvisningen när slidesens innehåll ändras (inte captionen)
  const editable = view.status !== 'published' && !!proposal && !!suggestion
  useEffect(() => {
    if (!editable || primaryId == null || !headline.trim()) return
    const id = ++previewRequest.current
    const timer = setTimeout(async () => {
      setPreviewState('loading')
      try {
        const res = await fetch(`/api/instagram/approve/${token}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ primaryEventId: primaryId, headline, listEventIds: listIds, extraSlideEventIds: extraIds }),
        })
        const data = await res.json().catch(() => ({}))
        if (id !== previewRequest.current) return
        if (!res.ok) throw new Error(data.error || `Fel ${res.status}`)
        setPreviews(data.slides ?? [])
        setPreviewState('idle')
        setPreviewError(null)
      } catch (error) {
        if (id !== previewRequest.current) return
        setPreviewState('error')
        setPreviewError(error instanceof Error ? error.message : String(error))
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [editable, token, primaryId, headline, listIds, extraIds])

  function choosePrimary(e: ProposalEvent) {
    setPrimaryId(e.eventId)
    setListIds((prev) => prev.filter((id) => id !== e.eventId))
    setExtraIds((prev) => prev.filter((id) => id !== e.eventId))
    setMessage(
      e.eventId === suggestion?.primaryEventId
        ? null
        : { kind: 'info', text: 'Huvudeventet är ändrat - skriv en ny rubrik och caption (eller låt AI:n göra det) så att texterna stämmer.' }
    )
  }

  function addToList(id: number) {
    setListIds((prev) => (prev.includes(id) || prev.length >= PROPOSAL_LIST_MAX ? prev : [...prev, id]))
    setExtraIds((prev) => prev.filter((x) => x !== id))
  }

  function removeFromList(id: number) {
    setListIds((prev) => prev.filter((x) => x !== id))
  }

  function moveInList(id: number, dir: -1 | 1) {
    setListIds((prev) => {
      const i = prev.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function toggleExtra(id: number) {
    setExtraIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= PROPOSAL_MAX_EXTRA_SLIDES) return prev
      return [...prev, id]
    })
    setListIds((prev) => prev.filter((x) => x !== id))
  }

  async function call(path: string, body: unknown) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (data.view) setView(data.view)
      throw new Error(data.error || `Fel ${res.status}`)
    }
    return data
  }

  async function publish() {
    if (!validation.ok || primaryId == null) return
    const count = 1 + (listIds.length > 0 ? 1 : 0) + extraIds.length
    if (!window.confirm(`Publicera ${count} slide${count > 1 ? 's' : ''} på Instagram nu?`)) return
    setBusy('publish')
    setMessage(null)
    try {
      const data = await call(`/api/instagram/approve/${token}`, {
        action: 'publish',
        source: 'manual',
        primaryEventId: primaryId,
        headline,
        listEventIds: listIds,
        extraSlideEventIds: extraIds,
        caption,
      })
      if (data.view) setView(data.view)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
    }
  }

  async function skip() {
    if (!window.confirm('Hoppa över dagens Instagram-post?')) return
    setBusy('skip')
    setMessage(null)
    try {
      const data = await call(`/api/instagram/approve/${token}`, { action: 'skip', source: 'manual' })
      if (data.view) setView(data.view)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
    }
  }

  async function regenerateHeadline() {
    if (primaryId == null) return
    setBusy('headline')
    setMessage(null)
    try {
      const data = await call(`/api/instagram/approve/${token}/headline`, {
        primaryEventId: primaryId,
        avoid: headline.trim() ? [headline.trim()] : [],
      })
      setHeadline(data.headline)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
    }
  }

  async function regenerateCaption() {
    if (primaryId == null) return
    setBusy('caption')
    setMessage(null)
    try {
      const data = await call(`/api/instagram/approve/${token}/caption`, { primaryEventId: primaryId, listEventIds: listIds })
      setCaption(data.caption)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
    }
  }

  // ------------------------------------------------------------------
  // Färdiga tillstånd
  // ------------------------------------------------------------------
  if (view.status === 'published') {
    return (
      <Shell title={formatDate(view.postDate)} subtitle="Publicerad på Instagram">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex gap-3 items-start">
          <CheckCircle2 className="text-green-600 mt-0.5 shrink-0" />
          <div className="text-sm text-green-900">
            <p className="font-medium">Posten är skickad till Instagram.</p>
            <p className="text-green-800">
              {view.approvalSource === 'auto'
                ? 'Publicerades automatiskt eftersom ingen svarade på förslaget.'
                : view.approvalSource === 'ntfy'
                  ? 'Godkänd via knappen i notisen.'
                  : view.approvalSource === 'direct'
                    ? 'Publicerad direkt av skriptet.'
                    : 'Godkänd här på sidan.'}
              {view.postedAt ? ` (${new Date(view.postedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })})` : ''}
            </p>
          </div>
        </div>
        {view.publishedSlideUrls.length > 0 && (
          <div className="flex gap-2 overflow-x-auto py-2">
            {view.publishedSlideUrls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={`Slide ${i + 1}`} className="h-64 aspect-[4/5] rounded-lg border object-cover shrink-0" />
            ))}
          </div>
        )}
        {view.publishedCaption && (
          <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-white rounded-xl border p-4 font-sans">{view.publishedCaption}</pre>
        )}
      </Shell>
    )
  }

  if (view.status === 'skipped') {
    return (
      <Shell title={formatDate(view.postDate)} subtitle="Ingen post idag">
        <div className="rounded-xl border border-gray-200 bg-white p-4 flex gap-3 items-start">
          <SkipForward className="text-gray-500 mt-0.5 shrink-0" />
          <div className="text-sm text-gray-800">
            <p className="font-medium">Dagens post är överhoppad.</p>
            {view.error && <p className="text-gray-600">{view.error}</p>}
          </div>
        </div>
        {suggestion && <p className="text-sm text-gray-600">Ångrade du dig? Du kan fortfarande publicera nedan.</p>}
        {suggestion && renderEditor()}
      </Shell>
    )
  }

  if (!proposal || !suggestion) {
    return (
      <Shell title={formatDate(view.postDate)} subtitle="Inget förslag">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 items-start">
          <TriangleAlert className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-900">
            {view.error || 'AI:n hittade ingen bild som räcker till ett vykort bland dagens event, så det finns inget att godkänna.'}
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      title={formatDate(view.postDate)}
      subtitle={view.status === 'failed' ? 'Publiceringen misslyckades - försök igen' : 'Godkänn dagens Instagram-post'}
    >
      {view.status === 'failed' && view.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3 items-start">
          <XCircle className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-900">{view.error}</p>
        </div>
      )}
      {renderEditor()}
    </Shell>
  )

  // ------------------------------------------------------------------
  // Redigeraren (delas av pending/failed/skipped). Anropas som funktion,
  // inte som komponent, så att fälten inte monteras om vid varje tangent.
  // ------------------------------------------------------------------
  function renderEditor() {
    if (!proposal) return null
    const addable = proposal.events.filter((e) => e.eventId !== primaryId && !listIds.includes(e.eventId))
    const extraOptions = primaryOptions.filter((e) => e.eventId !== primaryId)
    const slideLabels = ['Vykort', ...(listIds.length ? ['Mer i dag'] : []), ...extraIds.map(() => 'Extra vykort')]

    return (
      <div className="space-y-8">
        {/* Förhandsvisning */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Förhandsvisning</h2>
            {previewState === 'loading' && <Loader2 className="size-4 animate-spin text-gray-400" />}
          </div>
          <div className="flex gap-3 overflow-x-auto py-1 -mx-4 px-4 snap-x">
            {previews.length === 0 && previewState !== 'error' && (
              <div className="shrink-0 w-56 aspect-[4/5] rounded-lg border bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                Ritar slides…
              </div>
            )}
            {previews.map((src, i) => (
              <div key={i} className="shrink-0 w-56 space-y-1 snap-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={slideLabels[i] ?? `Slide ${i + 1}`} className={`w-full aspect-[4/5] rounded-lg border object-cover ${previewState === 'loading' ? 'opacity-60' : ''}`} />
                <p className="text-xs text-gray-600">
                  {i + 1}. {slideLabels[i] ?? 'Slide'}
                </p>
              </div>
            ))}
          </div>
          {previewState === 'error' && previewError && <p className="text-xs text-red-700">Förhandsvisningen misslyckades: {previewError}</p>}
        </section>

        {/* Rubrik */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Rubrik på vykortet</h2>
            <Button type="button" variant="outline" size="sm" onClick={regenerateHeadline} disabled={busy !== null || primaryId == null}>
              {busy === 'headline' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Ny rubrik med AI
            </Button>
          </div>
          <input
            id="headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={HEADLINE_MAX_LENGTH + 10}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base font-medium focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
          <p className={`text-xs ${headline.length > HEADLINE_MAX_LENGTH ? 'text-red-600' : 'text-gray-500'}`}>
            {headline.length} / {HEADLINE_MAX_LENGTH} tecken · 2-5 ord brukar bli bäst. Datum, tid och plats står redan på vykortet.
          </p>
        </section>

        {/* Huvudevent */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Huvudevent (vykortet)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {primaryOptions.map((e) => {
              const selected = e.eventId === primaryId
              const isSuggested = e.eventId === suggestion?.primaryEventId
              return (
                <button
                  key={e.eventId}
                  type="button"
                  onClick={() => choosePrimary(e)}
                  className={`text-left rounded-xl border overflow-hidden bg-white transition ${selected ? 'ring-2 ring-pink-500 border-pink-500' : 'border-gray-200'}`}
                >
                  <div className="relative aspect-square bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.imageUrl!} alt={e.name} className="absolute inset-0 w-full h-full object-contain" />
                    {isSuggested && (
                      <span className="absolute top-1 left-1 inline-flex items-center gap-1 text-[10px] font-semibold bg-pink-600 text-white rounded px-1.5 py-0.5">
                        <Sparkles className="size-3" /> AI-förslag
                      </span>
                    )}
                    {selected && <Star className="absolute top-1 right-1 size-5 text-white fill-pink-500 drop-shadow" />}
                  </div>
                  <div className="p-2 space-y-0.5">
                    <p className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">{e.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {timeText(e)}
                      {e.venueName ? ` · ${e.venueName}` : ''}
                    </p>
                    {e.timesShownThisWeek > 0 && (
                      <p className="text-[10px] text-amber-700">Visad {e.lastShown} ({e.timesShownThisWeek} ggr senaste veckan)</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Listan */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Mer i dag ({listIds.length}/{PROPOSAL_LIST_MAX})
          </h2>
          <p className="text-xs text-gray-500">
            De {PROPOSAL_LIST_TOP} första visas stort med bild som dagens topp tre, resten som korta rader. Event utan bild får tiden i frimärket.
            Tom lista = ingen listslide.
          </p>
          <ul className="divide-y rounded-xl border bg-white">
            {listEvents.map((e, i) => (
              <li key={e.eventId} className="flex items-center gap-3 p-2">
                <span className={`w-6 text-center text-xs font-semibold ${i < PROPOSAL_LIST_TOP ? 'text-pink-600' : 'text-gray-400'}`}>{i + 1}</span>
                <Thumb e={e} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {timeText(e)}
                    {e.venueName ? ` · ${e.venueName}` : ''}
                    {i < PROPOSAL_LIST_TOP ? ' · topp tre' : ''}
                  </p>
                </div>
                <div className="flex items-center">
                  <button type="button" onClick={() => moveInList(e.eventId, -1)} disabled={i === 0} className="p-1 text-gray-500 disabled:opacity-30" aria-label="Flytta upp">
                    <ArrowUp className="size-4" />
                  </button>
                  <button type="button" onClick={() => moveInList(e.eventId, 1)} disabled={i === listEvents.length - 1} className="p-1 text-gray-500 disabled:opacity-30" aria-label="Flytta ner">
                    <ArrowDown className="size-4" />
                  </button>
                  <button type="button" onClick={() => removeFromList(e.eventId)} className="p-1 text-gray-500 hover:text-red-600" aria-label="Ta bort ur listan">
                    <X className="size-4" />
                  </button>
                </div>
              </li>
            ))}
            {listEvents.length === 0 && <li className="p-3 text-sm text-gray-500">Ingen listslide - lägg till event nedan.</li>}
          </ul>
          {addable.length > 0 && (
            <details className="rounded-xl border bg-white">
              <summary className="cursor-pointer select-none p-3 text-sm font-medium text-gray-700">Lägg till fler av dagens event ({addable.length})</summary>
              <ul className="divide-y border-t">
                {addable.map((e) => {
                  const full = listIds.length >= PROPOSAL_LIST_MAX
                  return (
                    <li key={e.eventId} className={`flex items-center gap-3 p-2 ${full ? 'opacity-50' : ''}`}>
                      <Thumb e={e} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{e.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {timeText(e)}
                          {e.venueName ? ` · ${e.venueName}` : ''}
                          {extraIds.includes(e.eventId) ? ' · extra vykort' : ''}
                          {e.timesShownThisWeek > 0 ? ` · visad ${e.timesShownThisWeek} ggr i veckan` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addToList(e.eventId)}
                        disabled={full}
                        className="p-1.5 rounded-md border text-gray-600 disabled:opacity-40"
                        aria-label="Lägg till i listan"
                      >
                        <Plus className="size-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </details>
          )}
        </section>

        {/* Extra vykort */}
        {extraOptions.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Extra vykort ({extraIds.length}/{PROPOSAL_MAX_EXTRA_SLIDES})
            </h2>
            <p className="text-xs text-gray-500">Läggs efter listan. Bara för riktigt snygga foton - eventet tas då bort ur listan.</p>
            <ul className="divide-y rounded-xl border bg-white">
              {extraOptions.map((e) => {
                const checked = extraIds.includes(e.eventId)
                const disabled = !checked && extraIds.length >= PROPOSAL_MAX_EXTRA_SLIDES
                return (
                  <li key={e.eventId} className={`flex items-center gap-3 p-2 ${disabled ? 'opacity-50' : ''}`}>
                    <input
                      id={`extra-${e.eventId}`}
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleExtra(e.eventId)}
                      className="size-4 accent-pink-600"
                    />
                    <Thumb e={e} />
                    <label htmlFor={`extra-${e.eventId}`} className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{e.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {timeText(e)}
                        {e.standout ? ' · AI: snyggt foto' : ''}
                        {e.slideRepeatBlocked ? ' · visad nyligen' : ''}
                      </p>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Caption */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Caption</h2>
            <Button type="button" variant="outline" size="sm" onClick={regenerateCaption} disabled={busy !== null}>
              {busy === 'caption' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Generera ny med AI
            </Button>
          </div>
          <textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={10}
            className="w-full rounded-xl border border-gray-300 bg-white p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
          <p className={`text-xs ${caption.length > CAPTION_MAX_LENGTH ? 'text-red-600' : 'text-gray-500'}`}>
            {caption.length} / {CAPTION_MAX_LENGTH} tecken
          </p>
        </section>

        {message && (
          <div
            className={`rounded-xl border p-3 text-sm ${message.kind === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}
          >
            {message.text}
          </div>
        )}
        {!validation.ok && <p className="text-sm text-amber-700">{validation.error}</p>}

        <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-gray-50/95 backdrop-blur border-t flex gap-2">
          <Button type="button" className="flex-1 bg-pink-600 hover:bg-pink-700" onClick={publish} disabled={!validation.ok || busy !== null || !primary}>
            {busy === 'publish' ? <Loader2 className="animate-spin" /> : <Send />} Publicera på Instagram
          </Button>
          <Button type="button" variant="outline" onClick={skip} disabled={busy !== null}>
            {busy === 'skip' ? <Loader2 className="animate-spin" /> : <SkipForward />} Hoppa över
          </Button>
        </div>
      </div>
    )
  }
}

/** Liten bild, eller tiden i ett "frimärke" för event utan bild (som på listsliden) */
function Thumb({ e }: { e: ProposalEvent }) {
  if (e.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={e.imageUrl} alt="" className="size-12 rounded-md object-cover bg-gray-100 shrink-0" />
  }
  return (
    <div className="size-12 rounded-md border border-dashed border-gray-300 bg-white shrink-0 flex items-center justify-center text-[11px] font-semibold text-gray-600 text-center leading-tight">
      {e.timeLabel === 'Heldag' ? 'Hela dagen' : e.timeLabel}
    </div>
  )
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <header className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-pink-600 uppercase">iVarberg · Instagram</p>
          <h1 className="text-2xl font-bold text-gray-900 capitalize">{title}</h1>
          <p className="text-gray-600">{subtitle}</p>
        </header>
        {children}
      </div>
    </main>
  )
}
