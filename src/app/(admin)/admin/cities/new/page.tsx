'use client'

import { useTenant } from '@/contexts/TenantContext'
import { PageHeader } from '@/components/ui/page-header'
import { Banner } from '@/components/ui/states'
import { CityForm } from '@/components/cities/CityForm'

export default function NewCityPage() {
  const { tenant, isPlatformAdmin } = useTenant()

  return (
    <>
      <PageHeader title="Ny stad" description="Skapar staden i admin. Sajten kopplas sedan till en domän i Vercel." />
      {!tenant ? (
        <Banner tone="info">Databasen är inte förberedd för flera städer än. Se sidan Städer.</Banner>
      ) : !isPlatformAdmin ? (
        <Banner tone="wait">Du har inte behörighet att hantera städer.</Banner>
      ) : (
        <CityForm />
      )}
    </>
  )
}
