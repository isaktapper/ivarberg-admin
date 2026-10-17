'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, AlertTriangle, Sparkles, RefreshCw, ImageIcon } from 'lucide-react'
import * as stringSimilarity from 'string-similarity'
import { supabase } from '@/lib/supabase'
import { Card, CardBody, SectionLabel } from '@/components/ui/card'
import { Banner } from '@/components/ui/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { QualityDot } from '@/components/ui/status-badge'
import { useToast } from '@/components/ui/toast'
import { formatDay, formatTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { assessQualityLocal } from './quality'
import type { EventCategory } from '@/types/database'

export interface SidebarValues {
  name: string
  description: string
  date_time: string
  venue_name: string
  location: string
  image_url: string
  price: string
  is_free: 'auto' | 'free' | 'paid'
  categories: EventCategory[]
}

/* ---------- Förhandsvisning ---------- */
export function PreviewCard({ v }: { v: SidebarValues }) {
  const [broken, setBroken] = React.useState(false)
  React.useEffect(() => setBroken(false), [v.image_url])
  const priceLabel = v.is_free === 'free' ? 'Gratis' : v.price || (v.is_free === 'paid' ? 'Se arrangör' : '')
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <SectionLabel>Så ser det ut på ivarberg.nu</SectionLabel>
      </div>
      <div className="bg-sand p-4">
        <div className="overflow-hidden rounded-[12px] bg-white shadow-[0_2px_8px_rgba(15,90,166,0.08)]">
          <div className="relative flex h-[150px] items-center justify-center bg-amber-light text-amber">
            {v.image_url && !broken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.image_url} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
            ) : (
              <ImageIcon className="size-7" strokeWidth={1.5} />
            )}
            {v.categories[0] ? <span className="absolute left-3 top-3 rounded-full bg-sea px-2.5 py-0.5 text-[11px] font-semibold text-white">{v.categories[0]}</span> : null}
            {v.is_free === 'free' ? <span className="absolute right-3 top-3 rounded-full bg-kelp px-2.5 py-0.5 text-[11px] font-semibold text-white">Gratis</span> : null}
          </div>
          <div className="flex flex-col gap-1.5 px-4 py-3.5">
            <span className="font-display text-base font-semibold text-ink">{v.name || 'Eventets namn'}</span>
            <span className="text-[13px] text-ink-soft">
              {v.date_time ? `${formatDay(v.date_time)} · ${formatTime(v.date_time)}` : 'Datum saknas'}
              {v.venue_name ? ` · ${v.venue_name}` : ''}
            </span>
            {priceLabel ? <span className="text-[13px] font-medium text-ink">{priceLabel}</span> : null}
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ---------- Kvalitet ---------- */
export function QualityCard({ v }: { v: SidebarValues }) {
  const q = React.useMemo(() => assessQualityLocal({ ...v, image_url: v.image_url || null }), [v])
  return (
    <Card>
      <CardBody className="flex flex-col gap-3 px-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Kvalitet</SectionLabel>
          <QualityDot score={q.score} className="text-sm font-medium" />
        </div>
        <ul className="flex flex-col gap-2">
          {q.items.map((it) => (
            <li key={it.label} className={cn('flex items-center gap-2 text-[13px]', it.ok ? 'text-ink' : it.severity === 'bad' ? 'text-poppy' : 'text-amber')}>
              {it.ok ? <Check className="size-3.5 shrink-0 text-kelp" strokeWidth={2.5} /> : <AlertTriangle className="size-3.5 shrink-0" />}
              {it.label}
            </li>
          ))}
        </ul>
        <span className="text-xs text-ink-muted">Samma poängsättning som scrapern använder, utan innehållsmoderering. ≥ 80 kan auto-publiceras från betrodda källor.</span>
      </CardBody>
    </Card>
  )
}

/* ---------- AI-hjälp ---------- */
export function AiHelpCard({
  v,
  onCategories,
  onDescription,
}: {
  v: SidebarValues
  onCategories: (cats: EventCategory[], scores: Record<string, number>) => void
  onDescription: (text: string) => void
}) {
  const toast = useToast()
  const [busy, setBusy] = React.useState<'cats' | 'desc' | null>(null)
  const [proposal, setProposal] = React.useState<string | null>(null)

  const suggest = async () => {
    if (!v.name) return toast.info('Skriv ett namn först')
    setBusy('cats')
    try {
      const res = await fetch('/api/admin/events/suggest-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: v.name, description: v.description, venue_name: v.venue_name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Fel')
      const cats = (json.categories as string[]).filter((c) => c !== 'Okategoriserad') as EventCategory[]
      if (cats.length === 0) return toast.info('AI:n kunde inte föreslå någon kategori')
      onCategories(cats.slice(0, 3), json.scores || {})
      toast.success('Kategorier föreslagna', cats.join(', '))
    } catch (e) {
      toast.error('Kunde inte föreslå kategorier', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  const rewrite = async () => {
    if (!v.name) return toast.info('Skriv ett namn först')
    setBusy('desc')
    try {
      const res = await fetch('/api/admin/events/rewrite-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: v.name, description: v.description, venue_name: v.venue_name, date_time: v.date_time }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Fel')
      setProposal(json.description)
    } catch (e) {
      toast.error('Kunde inte skriva om beskrivningen', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-2 px-4">
        <SectionLabel className="mb-1">AI-hjälp</SectionLabel>
        <Button type="button" variant="secondary" className="justify-start" loading={busy === 'cats'} onClick={suggest}>
          <Sparkles className="text-sea" />
          Föreslå kategorier
        </Button>
        <Button type="button" variant="secondary" className="justify-start" loading={busy === 'desc'} onClick={rewrite}>
          <RefreshCw className="text-sea" />
          Skriv om beskrivningen
        </Button>
      </CardBody>
      <Dialog open={!!proposal} onOpenChange={(o) => !o && setProposal(null)}>
        {proposal ? (
          <DialogContent
            title="Förslag på ny beskrivning"
            description="Skrivet av AI utifrån namn, plats och nuvarande text. Inga fakta är påhittade, men läs igenom."
            footer={
              <>
                <Button variant="ghost" onClick={() => setProposal(null)}>
                  Avbryt
                </Button>
                <Button
                  onClick={() => {
                    onDescription(proposal)
                    setProposal(null)
                  }}
                >
                  Använd
                </Button>
              </>
            }
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{proposal}</p>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  )
}

/* ---------- Dubletter ---------- */
interface DupMatch {
  id: number
  name: string
  status: string
  organizer?: { name: string } | null
  similarity: number
}

export function DuplicateWarning({ name, dateTime, excludeId }: { name: string; dateTime: string; excludeId?: number }) {
  const [matches, setMatches] = React.useState<DupMatch[]>([])

  React.useEffect(() => {
    if (!name || name.length < 4 || !dateTime) {
      setMatches([])
      return
    }
    let alive = true
    const t = setTimeout(async () => {
      const day = dateTime.slice(0, 10)
      const { data } = await supabase
        .from('events')
        .select('id, name, status, organizer:organizers(name)')
        .gte('date_time', `${day}T00:00:00`)
        .lt('date_time', `${day}T23:59:59.999`)
        .limit(200)
      if (!alive || !data) return
      const found = (data as unknown as Omit<DupMatch, 'similarity'>[])
        .filter((e) => e.id !== excludeId)
        .map((e) => ({ ...e, similarity: stringSimilarity.compareTwoStrings(name.toLowerCase(), e.name.toLowerCase()) }))
        .filter((e) => e.similarity >= 0.8)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3)
      setMatches(found)
    }, 500)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [name, dateTime, excludeId])

  if (matches.length === 0) return null
  return (
    <Banner tone="wait" title={`Möjlig dublett · ${Math.round(matches[0].similarity * 100)} % likhet`}>
      <ul className="flex flex-col gap-1">
        {matches.map((m) => (
          <li key={m.id} className="text-[13px]">
            <Link href={`/events/${m.id}/edit`} className="font-medium text-amber hover:underline">
              ”{m.name}”
            </Link>
            <span className="text-ink-soft">
              {' '}
              · {m.organizer?.name ?? 'okänd arrangör'} · {m.status} · samma dag
            </span>
          </li>
        ))}
      </ul>
    </Banner>
  )
}

/* ---------- Historik ---------- */
interface AuditRow {
  id: string
  action: string | null
  changed_by: string | null
  created_at: string
  new_status: string | null
  quality_score: number | null
}

const ACTION_LABELS: Record<string, string> = {
  auto_published: 'Auto-publicerad',
  created: 'Skapad',
  updated: 'Uppdaterad',
  status_changed: 'Status ändrad',
  deleted: 'Borttagen',
}

export function HistoryCard({ eventId }: { eventId: string }) {
  const [rows, setRows] = React.useState<AuditRow[] | null>(null)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    supabase
      .from('event_audit_log')
      .select('id, action, changed_by, created_at, new_status, quality_score')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setError(true)
        else setRows((data as AuditRow[]) ?? [])
      })
    return () => {
      alive = false
    }
  }, [eventId])

  return (
    <Card>
      <CardBody className="flex flex-col gap-2.5 px-4">
        <SectionLabel>Historik</SectionLabel>
        {error ? (
          <span className="text-xs text-ink-muted">Historiken kunde inte hämtas.</span>
        ) : rows === null ? (
          <span className="text-xs text-ink-muted">Hämtar…</span>
        ) : rows.length === 0 ? (
          <span className="text-xs text-ink-muted">Ingen historik än.</span>
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id} className="flex gap-2.5 text-xs text-ink-soft">
                <span className="shrink-0 whitespace-nowrap font-mono text-ink-faint">{formatRelative(r.created_at)}</span>
                <span>
                  {ACTION_LABELS[r.action ?? ''] ?? r.action ?? 'Ändring'}
                  {r.new_status ? ` → ${r.new_status}` : ''}
                  {r.quality_score != null ? ` · poäng ${r.quality_score}` : ''}
                  {r.changed_by ? ` · ${r.changed_by === 'service_role' ? 'scraper' : r.changed_by}` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  )
}
