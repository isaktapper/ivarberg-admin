'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Send,
  SkipForward,
  Sparkles,
  Star,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ApprovalView } from '@/lib/services/instagram-approval'
import {
  CAPTION_MAX_LENGTH,
  InstagramFormatKey,
  PROPOSAL_FORMATS,
  PROPOSAL_MAX_SLIDES,
  ProposalCandidate,
  defaultFormatFor,
  formatLabel,
  validateSelection,
} from '@/lib/services/instagram-proposal'

const ASPECT: Record<InstagramFormatKey, string> = {
  square: '1 / 1',
  portrait: '4 / 5',
  landscape: '1.91 / 1',
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function ApprovalClient({ token, initial }: { token: string; initial: ApprovalView }) {
  const [view, setView] = useState<ApprovalView>(initial)
  const proposal = view.proposal
  const suggestion = proposal?.suggestion ?? null

  const candidatesById = useMemo(
    () => new Map((proposal?.candidates ?? []).map((c) => [c.eventId, c])),
    [proposal]
  )

  // Kandidater i visningsordning: AI-förslaget först, sedan vision-rank
  const orderedCandidates = useMemo(() => {
    const list = [...(proposal?.candidates ?? [])]
    const suggestedOrder = new Map<number, number>()
    if (suggestion) {
      suggestedOrder.set(suggestion.primaryEventId, 0)
      suggestion.slideEventIds.forEach((id, i) => suggestedOrder.set(id, i + 1))
    }
    return list.sort((a, b) => {
      const sa = suggestedOrder.get(a.eventId) ?? 99
      const sb = suggestedOrder.get(b.eventId) ?? 99
      if (sa !== sb) return sa - sb
      const va = a.visionRank ?? 99
      const vb = b.visionRank ?? 99
      if (va !== vb) return va - vb
      return Number(b.isPrimaryCandidate) - Number(a.isPrimaryCandidate)
    })
  }, [proposal, suggestion])

  const [primaryId, setPrimaryId] = useState<number | null>(suggestion?.primaryEventId ?? orderedCandidates[0]?.eventId ?? null)
  const [format, setFormat] = useState<InstagramFormatKey>(suggestion?.format ?? 'square')
  const [slideIds, setSlideIds] = useState<number[]>(suggestion?.slideEventIds ?? [])
  const [caption, setCaption] = useState<string>(suggestion?.caption ?? '')
  const [busy, setBusy] = useState<'publish' | 'skip' | 'caption' | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  const primary = primaryId != null ? candidatesById.get(primaryId) ?? null : null

  const availableFormats = useMemo(() => {
    if (!primary) return []
    return PROPOSAL_FORMATS.filter((f) => primary.fits[f.key].ok || (primary.fits[f.key].relaxedOk && slideIds.length === 0))
  }, [primary, slideIds.length])

  const isEligibleSlide = (c: ProposalCandidate) => c.eventId !== primaryId && c.fits[format].ok

  function choosePrimary(c: ProposalCandidate) {
    setPrimaryId(c.eventId)
    const keepFormat = c.fits[format].ok ? format : defaultFormatFor(c) ?? format
    setFormat(keepFormat)
    setSlideIds((prev) => prev.filter((id) => id !== c.eventId && candidatesById.get(id)?.fits[keepFormat].ok))
    setMessage(
      c.eventId === suggestion?.primaryEventId
        ? null
        : { kind: 'info', text: 'Huvudeventet är ändrat - generera gärna en ny caption så att texten stämmer.' }
    )
  }

  function chooseFormat(key: InstagramFormatKey) {
    setFormat(key)
    setSlideIds((prev) => prev.filter((id) => candidatesById.get(id)?.fits[key].ok))
  }

  function toggleSlide(id: number) {
    setSlideIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= PROPOSAL_MAX_SLIDES - 1) return prev
      return [...prev, id]
    })
  }

  function moveSlide(id: number, dir: -1 | 1) {
    setSlideIds((prev) => {
      const i = prev.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const validation = useMemo(() => {
    if (!proposal || primaryId == null) return { ok: false as const, error: 'Välj ett huvudevent' }
    return validateSelection(proposal, { primaryEventId: primaryId, slideEventIds: slideIds, format, caption })
  }, [proposal, primaryId, slideIds, format, caption])

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
    const slidesCount = 1 + slideIds.length
    if (!window.confirm(`Publicera ${slidesCount} slide${slidesCount > 1 ? 's' : ''} på Instagram nu?`)) return
    setBusy('publish')
    setMessage(null)
    try {
      const data = await call(`/api/instagram/approve/${token}`, {
        action: 'publish',
        source: 'manual',
        primaryEventId: primaryId,
        slideEventIds: slideIds,
        format,
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

  async function regenerateCaption() {
    if (primaryId == null) return
    setBusy('caption')
    setMessage(null)
    try {
      const data = await call(`/api/instagram/approve/${token}/caption`, { primaryEventId: primaryId, slideEventIds: slideIds })
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
              <img key={url} src={url} alt={`Slide ${i + 1}`} className="h-40 rounded-lg border object-cover shrink-0" />
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
        {suggestion && (
          <p className="text-sm text-gray-600">
            Ångrade du dig? Du kan fortfarande publicera nedan.
          </p>
        )}
        {suggestion && <Editor />}
      </Shell>
    )
  }

  if (!proposal || !suggestion) {
    return (
      <Shell title={formatDate(view.postDate)} subtitle="Inget förslag">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 items-start">
          <TriangleAlert className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-900">
            {view.error || 'AI:n hittade ingen användbar bild bland dagens event, så det finns inget att godkänna.'}
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
      <Editor />
    </Shell>
  )

  // ------------------------------------------------------------------
  // Redigeraren (delas av pending/failed/skipped)
  // ------------------------------------------------------------------
  function Editor() {
    if (!proposal) return null
    const slideCandidates = orderedCandidates.filter((c) => c.eventId !== primaryId)
    const chosen = slideIds.map((id) => candidatesById.get(id)).filter((c): c is ProposalCandidate => !!c)
    const previewSlides = primary ? [primary, ...chosen] : chosen

    return (
      <div className="space-y-8">
        {/* Förhandsvisning */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Förhandsvisning · {formatLabel(format)}</h2>
          <div className="flex gap-2 overflow-x-auto py-1 -mx-4 px-4">
            {previewSlides.map((c, i) => (
              <div key={c.eventId} className="shrink-0 w-40 space-y-1">
                <div className="relative rounded-lg overflow-hidden border bg-gray-100" style={{ aspectRatio: ASPECT[format] }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl} alt={c.name} className="absolute inset-0 w-full h-full object-cover" />
                  <span className="absolute top-1 left-1 text-[10px] font-semibold bg-black/60 text-white rounded px-1.5 py-0.5">
                    {i === 0 ? 'Featured' : `Slide ${i + 1}`}
                  </span>
                </div>
                <p className="text-xs text-gray-700 truncate">{c.name}</p>
              </div>
            ))}
          </div>
          {availableFormats.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {availableFormats.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => chooseFormat(f.key)}
                  className={`text-xs rounded-full px-3 py-1 border ${format === f.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Huvudevent */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Huvudevent (featured)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {orderedCandidates.map((c) => {
              const selected = c.eventId === primaryId
              const usable = PROPOSAL_FORMATS.some((f) => c.fits[f.key].ok || c.fits[f.key].relaxedOk)
              const isSuggested = c.eventId === suggestion?.primaryEventId
              return (
                <button
                  key={c.eventId}
                  type="button"
                  disabled={!usable}
                  onClick={() => choosePrimary(c)}
                  className={`text-left rounded-xl border overflow-hidden bg-white transition disabled:opacity-40 ${selected ? 'ring-2 ring-pink-500 border-pink-500' : 'border-gray-200'}`}
                >
                  <div className="relative aspect-square bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.imageUrl} alt={c.name} className="absolute inset-0 w-full h-full object-cover" />
                    {isSuggested && (
                      <span className="absolute top-1 left-1 inline-flex items-center gap-1 text-[10px] font-semibold bg-pink-600 text-white rounded px-1.5 py-0.5">
                        <Sparkles className="size-3" /> AI-förslag
                      </span>
                    )}
                    {selected && <Star className="absolute top-1 right-1 size-5 text-white fill-pink-500 drop-shadow" />}
                  </div>
                  <div className="p-2 space-y-0.5">
                    <p className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">{c.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {c.timeLabel}
                      {c.venueName ? ` · ${c.venueName}` : ''}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {PROPOSAL_FORMATS.map((f) => `${f.label} ${c.fits[f.key].ok ? '✓' : c.fits[f.key].relaxedOk ? '~' : '✗'}`).join('  ')}
                    </p>
                    {c.timesShownThisWeek > 0 && (
                      <p className="text-[10px] text-amber-700">Visad {c.lastShown} ({c.timesShownThisWeek} ggr senaste veckan)</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Övriga slides */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Övriga slides ({slideIds.length}/{PROPOSAL_MAX_SLIDES - 1})
          </h2>
          <p className="text-xs text-gray-500">Alla slides måste klara formatet {formatLabel(format)}. Byt format ovan om något saknas.</p>
          <ul className="divide-y rounded-xl border bg-white">
            {chosen.map((c, i) => (
              <SlideRow key={c.eventId} c={c} index={i} total={chosen.length} onToggle={() => toggleSlide(c.eventId)} onMove={(d) => moveSlide(c.eventId, d)} checked />
            ))}
            {slideCandidates
              .filter((c) => !slideIds.includes(c.eventId))
              .map((c) => (
                <SlideRow
                  key={c.eventId}
                  c={c}
                  checked={false}
                  disabled={!isEligibleSlide(c) || slideIds.length >= PROPOSAL_MAX_SLIDES - 1}
                  reason={!c.fits[format].ok ? `Bilden klarar inte ${formatLabel(format)}` : c.slideRepeatBlocked ? 'Visad nyligen' : undefined}
                  onToggle={() => toggleSlide(c.eventId)}
                />
              ))}
          </ul>
          {proposal.eventsWithoutImage.length > 0 && (
            <p className="text-xs text-gray-500">
              Utan bild (nämns bara i captionen): {proposal.eventsWithoutImage.map((e) => e.name).join(', ')}
            </p>
          )}
        </section>

        {/* Caption */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Caption</h2>
            <Button type="button" variant="outline" size="sm" onClick={regenerateCaption} disabled={busy !== null}>
              {busy === 'caption' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Generera ny med AI
            </Button>
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={12}
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
          <Button type="button" className="flex-1 bg-pink-600 hover:bg-pink-700" onClick={publish} disabled={!validation.ok || busy !== null}>
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

function SlideRow({
  c,
  checked,
  disabled,
  reason,
  index,
  total,
  onToggle,
  onMove,
}: {
  c: ProposalCandidate
  checked: boolean
  disabled?: boolean
  reason?: string
  index?: number
  total?: number
  onToggle: () => void
  onMove?: (dir: -1 | 1) => void
}) {
  return (
    <li className={`flex items-center gap-3 p-2 ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} className="size-4 accent-pink-600" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.imageUrl} alt="" className="size-12 rounded-md object-cover bg-gray-100 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {checked && index != null ? `${index + 2}. ` : ''}
          {c.name}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {c.timeLabel}
          {c.venueName ? ` · ${c.venueName}` : ''}
          {reason ? ` · ${reason}` : ''}
        </p>
      </div>
      {checked && onMove && (
        <div className="flex flex-col">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="p-1 text-gray-500 disabled:opacity-30" aria-label="Flytta upp">
            <ArrowUp className="size-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === (total ?? 0) - 1} className="p-1 text-gray-500 disabled:opacity-30" aria-label="Flytta ner">
            <ArrowDown className="size-4" />
          </button>
        </div>
      )}
    </li>
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
