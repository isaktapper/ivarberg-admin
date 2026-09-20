'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, Sparkles, XCircle, CheckCircle2, Calendar, MapPin, Mail } from 'lucide-react'
import type { EventTip } from '@/types/database'
import { formatDateTime, formatDay, formatRelative } from '@/lib/format'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardBody, CardHeader, SectionLabel } from '@/components/ui/card'
import { StatusBadge, CategoryChip } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { convertTip, markTipsReviewed, rejectTip } from '@/components/admin/tip-actions'

export default function TipDetailPage() {
  const params = useParams<{ id: string }>()
  const id = Number(params.id)
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()

  const [tip, setTip] = useState<EventTip | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [imgBroken, setImgBroken] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/tips/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.details || json.error || 'Kunde inte hämta tipset')
      setTip(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Okänt fel')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (!Number.isNaN(id)) load()
  }, [id, load])

  const doConvert = async () => {
    if (!tip) return
    const ok = await confirm({ title: 'Konvertera till event?', description: `”${tip.event_name}” skapas som utkast.`, confirmLabel: 'Konvertera' })
    if (!ok) return
    setBusy(true)
    try {
      const result = await convertTip(tip.id)
      toast.toast({
        kind: 'success',
        title: 'Event skapat som utkast',
        description: tip.event_name,
        action: { label: 'Öppna eventet', onClick: () => router.push(`/events/${result.event.id}/edit`) },
      })
      load()
    } catch (e) {
      toast.error('Kunde inte konvertera', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const doReject = async () => {
    if (!tip) return
    setBusy(true)
    try {
      await rejectTip(tip.id, reason.trim())
      toast.success('Tipset avvisat')
      setRejectOpen(false)
      load()
    } catch (e) {
      toast.error('Kunde inte avvisa', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const doReviewed = async () => {
    if (!tip) return
    setBusy(true)
    try {
      await markTipsReviewed([tip.id])
      toast.success('Markerat som granskat')
      load()
    } catch (e) {
      toast.error('Kunde inte uppdatera', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState title="Kunde inte hämta tipset" description={error} onRetry={load} />
  if (!tip) return <EmptyState title="Tipset hittades inte" action={<Button asChild variant="secondary"><Link href="/admin/tips">Tillbaka till tips</Link></Button>} />

  const cats = tip.categories?.length ? tip.categories : tip.category ? [tip.category] : []
  const when = tip.date_time || tip.event_date
  const isFinal = tip.status === 'converted' || tip.status === 'rejected'

  return (
    <>
      <Link href="/admin/tips" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink">
        <ArrowLeft className="size-3.5" /> Tips från besökare
      </Link>

      <PageHeader
        title={tip.event_name}
        description={`Inkom ${formatRelative(tip.created_at)}`}
        actions={
          <>
            {tip.status === 'pending' ? (
              <Button variant="secondary" disabled={busy} onClick={doReviewed}>
                <CheckCircle2 /> Markera som granskad
              </Button>
            ) : null}
            {!isFinal ? (
              <Button variant="destructive" disabled={busy} onClick={() => { setReason(''); setRejectOpen(true) }}>
                <XCircle /> Avvisa
              </Button>
            ) : null}
            {tip.status !== 'converted' ? (
              <Button loading={busy} onClick={doConvert}>
                <Sparkles /> Konvertera till event
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          {tip.image_url && !imgBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tip.image_url} alt="" onError={() => setImgBroken(true)} className="aspect-[16/7] w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/7] w-full items-center justify-center bg-poppy-light font-mono text-xs text-poppy">Ingen bild bifogad</div>
          )}
          <CardBody className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-soft">
              <span className="inline-flex items-center gap-1.5"><Calendar className="size-4 text-ink-muted" /> {tip.date_time ? formatDateTime(tip.date_time) : formatDay(when)}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-ink-muted" /> {[tip.venue_name, tip.event_location].filter(Boolean).join(' · ') || '–'}</span>
            </div>
            {cats.length ? (
              <div className="flex flex-wrap gap-1.5">
                {cats.map((c, i) => <CategoryChip key={c} muted={i > 0}>{c}</CategoryChip>)}
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Beskrivning</SectionLabel>
              {tip.event_description ? <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{tip.event_description}</p> : <p className="text-sm text-ink-faint">Ingen beskrivning</p>}
            </div>
            {tip.website_url ? (
              <div className="flex flex-col gap-1.5">
                <SectionLabel>Webbplats</SectionLabel>
                <a href={tip.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-sea hover:text-sea-dark">
                  {tip.website_url} <ExternalLink className="size-3.5" />
                </a>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Status" />
            <CardBody className="flex flex-col gap-3 text-[13px]">
              <StatusBadge domain="tip" value={tip.status} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-ink-soft">
                <dt>Inkom</dt><dd className="font-mono text-xs text-ink">{formatDateTime(tip.created_at)}</dd>
                <dt>Uppdaterad</dt><dd className="font-mono text-xs text-ink">{formatDateTime(tip.updated_at)}</dd>
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Inlämnare" />
            <CardBody className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium text-ink">{tip.submitter_name || 'Anonym'}</span>
              <a href={`mailto:${tip.submitter_email}`} className="inline-flex items-center gap-1.5 text-sea hover:text-sea-dark">
                <Mail className="size-3.5" /> {tip.submitter_email}
              </a>
            </CardBody>
          </Card>
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent
          size="sm"
          title="Avvisa tips"
          description="Anledningen loggas och används inte i något utskick."
          footer={
            <>
              <Button variant="ghost" onClick={() => setRejectOpen(false)}>Avbryt</Button>
              <Button variant="destructive" loading={busy} onClick={doReject}>Avvisa</Button>
            </>
          }
        >
          <Field label="Anledning" htmlFor="reject-reason" help="Valfritt">
            <Textarea id="reject-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="T.ex. dublett, utanför Varberg, otillräcklig info…" />
          </Field>
        </DialogContent>
      </Dialog>
    </>
  )
}
