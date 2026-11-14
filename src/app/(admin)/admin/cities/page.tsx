'use client'

import Link from 'next/link'
import { Building2, ExternalLink, Plus } from 'lucide-react'
import { useTenant } from '@/contexts/TenantContext'
import { TENANT_STATUS_LABEL, tenantSiteUrl, type TenantStatus } from '@/lib/tenants'
import type { StatusTone } from '@/lib/status'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Banner, EmptyState } from '@/components/ui/states'
import { ToneBadge } from '@/components/ui/status-badge'

const STATUS_TONE: Record<TenantStatus, StatusTone> = { live: 'ok', draft: 'neutral', paused: 'wait' }

export default function CitiesPage() {
  const { tenants, tenant, isPlatformAdmin, switchTenant } = useTenant()

  if (!tenant) {
    return (
      <>
        <PageHeader title="Städer" description="En rad per sajt. Alla städer delar samma admin." />
        <Banner tone="info" title="Databasen är inte förberedd för flera städer än">
          Kör <code className="font-mono text-xs">database/migrations/scale/001_tenants.sql</code> och sedan <code className="font-mono text-xs">002_tenant_columns.sql</code> i Supabase SQL-editorn. Ladda om sidan efteråt. Rutinen finns i docs/NY-STAD.md.
        </Banner>
      </>
    )
  }

  if (!isPlatformAdmin) {
    return (
      <>
        <PageHeader title="Städer" />
        <Banner tone="wait">Du har inte behörighet att hantera städer.</Banner>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Städer"
        description="En rad per sajt. Alla städer delar samma admin."
        actions={
          <Button asChild>
            <Link href="/admin/cities/new">
              <Plus strokeWidth={2.5} /> Ny stad
            </Link>
          </Button>
        }
      />

      <Card>
        {tenants.length === 0 ? (
          <EmptyState icon={<Building2 />} title="Inga städer" />
        ) : (
          <div className="flex flex-col">
            <div className="hidden h-9 grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_90px_100px_180px] items-center gap-3 border-b border-line bg-sand-soft px-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted md:grid">
              <span>Stad</span>
              <span>Domän</span>
              <span>Kommun</span>
              <span>Status</span>
              <span />
            </div>
            {tenants.map((t) => (
              <div key={t.id} className="grid gap-x-3 gap-y-2 border-b border-line-soft px-5 py-3 text-[13px] last:border-b-0 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_90px_100px_180px] md:items-center">
                <Link href={`/admin/cities/${t.id}`} className="flex min-w-0 items-center gap-2.5 font-medium text-ink hover:text-sea">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: t.theme?.colors?.primary || '#0F5AA6' }} />
                  <span className="truncate">{t.city_name}</span>
                  {t.id === tenant.id ? <span className="shrink-0 rounded-md bg-sea-light px-1.5 py-0.5 text-[11px] font-medium text-sea-dark">Vald</span> : null}
                </Link>
                <a href={tenantSiteUrl(t)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 text-ink-soft hover:text-sea">
                  <span className="truncate">{t.primary_domain}</span>
                  <ExternalLink className="size-3.5 shrink-0" />
                </a>
                <span className="font-mono text-xs text-ink-soft">{t.municipality_codes.join(', ')}</span>
                <ToneBadge tone={STATUS_TONE[t.status]}>{TENANT_STATUS_LABEL[t.status]}</ToneBadge>
                <div className="flex items-center gap-2 md:justify-end">
                  {t.id !== tenant.id ? (
                    <Button variant="secondary" size="sm" onClick={() => switchTenant(t.slug)}>
                      Byt till
                    </Button>
                  ) : null}
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/admin/cities/${t.id}`}>Redigera</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
