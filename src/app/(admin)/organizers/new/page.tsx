'use client'

import { PageHeader } from '@/components/ui/page-header'
import { OrganizerForm } from '@/components/organizers/OrganizerForm'

export default function NewOrganizerPage() {
  return (
    <>
      <PageHeader title="Ny arrangör" description="Fyll i uppgifterna. Alias hjälper scrapern att koppla rätt event." />
      <OrganizerForm />
    </>
  )
}
