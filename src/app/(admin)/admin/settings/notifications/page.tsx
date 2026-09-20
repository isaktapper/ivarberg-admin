'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mail, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { EmailRecipient } from '@/types/database'
import { formatDay } from '@/lib/format'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Checkbox } from '@/components/ui/input'
import { Banner, EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states'
import { IconButton } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function NotificationsPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [recipients, setRecipients] = useState<EmailRecipient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase.from('email_recipients').select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setRecipients((data as EmailRecipient[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const add = async () => {
    const e = email.trim().toLowerCase()
    if (!e) return setFormError('E-postadress krävs')
    if (!EMAIL_RE.test(e)) return setFormError('Ogiltig e-postadress')
    if (recipients.some((r) => r.email.toLowerCase() === e)) return setFormError('Adressen finns redan i listan')
    setFormError(null)
    setBusy(true)
    const { error } = await supabase.from('email_recipients').insert({ email: e, name: name.trim() || null, notification_types: ['daily_report'], enabled: true })
    setBusy(false)
    if (error) {
      setFormError(error.code === '23505' ? 'Adressen finns redan i listan' : error.message)
      return
    }
    setEmail('')
    setName('')
    toast.success('Mottagare tillagd', e)
    load()
  }

  const toggle = async (r: EmailRecipient) => {
    setRecipients((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: !r.enabled } : x)))
    const { error } = await supabase.from('email_recipients').update({ enabled: !r.enabled }).eq('id', r.id)
    if (error) {
      setRecipients((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: r.enabled } : x)))
      toast.error('Kunde inte uppdatera', error.message)
    }
  }

  const remove = async (r: EmailRecipient) => {
    const ok = await confirm({ title: 'Ta bort mottagare?', description: `${r.email} får inte längre några utskick.`, confirmLabel: 'Ta bort', destructive: true })
    if (!ok) return
    const { error } = await supabase.from('email_recipients').delete().eq('id', r.id)
    if (error) toast.error('Kunde inte ta bort', error.message)
    else {
      toast.success('Mottagare borttagen', r.email)
      load()
    }
  }

  return (
    <>
      <PageHeader title="Inställningar" description="Vem som får de automatiska e-postutskicken." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Mottagare av dagliga rapporter" description={`${recipients.filter((r) => r.enabled).length} aktiva av ${recipients.length}`} />

          <CardBody className="border-b border-line bg-sand-soft">
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_170px_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                add()
              }}
            >
              <Field label="E-post" htmlFor="new-email" required error={formError}>
                <Input id="new-email" type="email" autoComplete="off" value={email} onChange={(e) => { setEmail(e.target.value); setFormError(null) }} placeholder="namn@exempel.se" aria-invalid={!!formError} />
              </Field>
              <Field label="Namn" htmlFor="new-name">
                <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Valfritt" />
              </Field>
              <Field label="Typ av utskick" htmlFor="new-type">
                <Select id="new-type" value="daily_report" disabled>
                  <option value="daily_report">Daglig rapport</option>
                </Select>
              </Field>
              <Button type="submit" loading={busy} className="h-10">
                <Plus strokeWidth={2.5} /> Lägg till
              </Button>
            </form>
          </CardBody>

          {error ? (
            <CardBody><ErrorState title="Kunde inte hämta mottagare" description={error} onRetry={load} /></CardBody>
          ) : loading ? (
            <TableSkeleton rows={3} />
          ) : recipients.length === 0 ? (
            <EmptyState icon={<Mail />} title="Inga mottagare" description="Lägg till en adress ovan för att börja skicka den dagliga rapporten." />
          ) : (
            <div className="flex flex-col">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_90px_110px_44px] items-center gap-3 border-b border-line bg-sand-soft px-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted" style={{ height: 36 }}>
                <span>E-post</span><span>Namn</span><span>Aktiv</span><span>Tillagd</span><span />
              </div>
              {recipients.map((r) => (
                <div key={r.id} className="grid min-h-12 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_90px_110px_44px] items-center gap-3 border-b border-line-soft px-5 text-[13px] last:border-b-0">
                  <span className={r.enabled ? 'truncate font-medium text-ink' : 'truncate text-ink-muted line-through'}>{r.email}</span>
                  <span className="truncate text-ink-soft">{r.name || '–'}</span>
                  <Checkbox checked={r.enabled} onChange={() => toggle(r)} aria-label={`Aktivera ${r.email}`} />
                  <span className="font-mono text-xs text-ink-soft">{formatDay(r.created_at)}</span>
                  <IconButton label="Ta bort" onClick={() => remove(r)} className="hover:bg-poppy-light hover:text-poppy"><Trash2 /></IconButton>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Om utskicken" />
          <CardBody className="flex flex-col gap-3 text-[13px] leading-relaxed text-ink-soft">
            <p>Den dagliga rapporten skickas efter morgonens scraper-körning och sammanfattar nya event, dubletter som hoppats över och eventuella fel.</p>
            <p>Avaktivera en mottagare för att pausa utskicken utan att ta bort adressen.</p>
            <Banner tone="info">Fler utskickstyper (t.ex. larm via e-post) kan läggas till senare. Just nu finns bara den dagliga rapporten.</Banner>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
