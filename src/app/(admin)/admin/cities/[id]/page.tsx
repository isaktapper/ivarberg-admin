'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { useTenant } from '@/contexts/TenantContext'
import { VARBERG_TENANT_ID, tenantSiteUrl, type Tenant } from '@/lib/tenants'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/states'
import { CityForm } from '@/components/cities/CityForm'

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sand-deep font-mono text-xs font-medium text-ink-soft">{n}</span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <div className="text-[13px] leading-relaxed text-ink-soft">{children}</div>
      </div>
    </li>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-sand-deep px-1 py-0.5 font-mono text-xs text-ink">{children}</code>
}

/** Det som återstår utanför admin för att sajten ska gå att besöka. */
function SetupSteps({ tenant }: { tenant: Tenant }) {
  return (
    <Card>
      <CardHeader title="Koppla sajten" description="Görs en gång per stad, utanför admin. Hela rutinen finns i docs/NY-STAD.md." />
      <CardBody>
        <ol className="flex flex-col gap-4">
          <Step n={1} title="Skapa ett Vercel-projekt">
            Importera samma repo som ivarberg.nu (ivarberg-events-hub). Kopiera miljövariablerna från ivarberg.nu-projektet och lägg till <Code>SITE_SLUG={tenant.slug}</Code>.
          </Step>
          <Step n={2} title="Koppla domänen">
            Lägg till <Code>{tenant.primary_domain}</Code> under Domains i projektet och peka DNS enligt Vercels anvisning.
          </Step>
          <Step n={3} title="Kontrollera sajten">
            Öppna sajten och se att namn, färger och logga stämmer. Den är tom tills staden har event.
          </Step>
          <Step n={4} title="Lägg in event">
            Byt till {tenant.city_name} i stadsväljaren och skapa event, eller publicera tips som kommer in via sajten. Automatiska källor läggs till i nästa steg av bygget.
          </Step>
          <Step n={5} title="Sätt status Live">
            Utkast göms för sökmotorer. Byt till Live när sajten har innehåll och lägg sedan till domänen i Google Search Console.
          </Step>
        </ol>
      </CardBody>
    </Card>
  )
}

export default function CityPage() {
  const { id } = useParams<{ id: string }>()
  const { tenants, tenant: active, isPlatformAdmin } = useTenant()
  const tenant = tenants.find((t) => t.id === id)

  if (!active) {
    return (
      <>
        <PageHeader title="Stad" />
        <Banner tone="info">Databasen är inte förberedd för flera städer än. Se sidan Städer.</Banner>
      </>
    )
  }
  if (!isPlatformAdmin) {
    return (
      <>
        <PageHeader title="Stad" />
        <Banner tone="wait">Du har inte behörighet att hantera städer.</Banner>
      </>
    )
  }
  if (!tenant) {
    return (
      <>
        <PageHeader title="Stad" />
        <Banner tone="bad">Staden finns inte.</Banner>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={tenant.city_name}
        description={tenant.primary_domain}
        actions={
          <Button asChild variant="secondary">
            <a href={tenantSiteUrl(tenant)} target="_blank" rel="noreferrer">
              <ExternalLink /> Öppna sajten
            </a>
          </Button>
        }
      />
      {tenant.id === VARBERG_TENANT_ID ? (
        <Banner tone="info">
          ivarberg.nu läser sina färger och texter härifrån först när <Code>SITE_SLUG=varberg</Code> är satt i sajtens Vercel-projekt. Tills dess gäller värdena i koden.
        </Banner>
      ) : (
        <SetupSteps tenant={tenant} />
      )}
      <CityForm key={tenant.id + tenant.updated_at} tenant={tenant} />
    </>
  )
}
