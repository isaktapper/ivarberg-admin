'use client'

import * as React from 'react'
import { useTenant } from '@/contexts/TenantContext'
import { isVarberg } from '@/lib/tenants'
import { PageHeader } from '@/components/ui/page-header'
import { Banner } from '@/components/ui/states'

/**
 * Sidor som bara finns för Varberg än (Instagram, nyhetsbrev, scrapers).
 * För andra städer visas rubriken och en förklaring i stället för innehållet.
 * `feature` är början på meningen, t.ex. "Instagram-flödet".
 */
export function VarbergOnly({ title, feature, children }: { title: string; feature: string; children: React.ReactNode }) {
  const { tenant } = useTenant()
  if (tenant && !isVarberg(tenant)) {
    return (
      <>
        <PageHeader title={title} />
        <Banner tone="info">
          {feature} finns bara för Varberg än. {tenant.city_name} får det i ett senare steg.
        </Banner>
      </>
    )
  }
  return <>{children}</>
}
