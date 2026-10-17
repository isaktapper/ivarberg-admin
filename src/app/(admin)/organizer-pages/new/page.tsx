'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { OrganizerPageForm } from '@/components/organizers/OrganizerPageForm'

export default function NewOrganizerPagePage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const searchParams = useSearchParams()
  const raw = searchParams.get('organizer_id')
  const presetOrganizerId = raw && !isNaN(parseInt(raw)) ? parseInt(raw) : null
  return (
    <>
      <PageHeader title="Ny arrangörssida" description="En publik sida på ivarberg.nu med arrangörens info, bilder och kommande event." />
      <OrganizerPageForm presetOrganizerId={presetOrganizerId} />
    </>
  )
}
