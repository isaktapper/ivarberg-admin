'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Organizer } from '@/types/database'
import { PageHeader } from '@/components/ui/page-header'
import { OrganizerForm } from '@/components/organizers/OrganizerForm'
import { LoadingState, EmptyState } from '@/components/ui/states'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'

export default function EditOrganizerPage() {
  const params = useParams()
  const id = parseInt(params.id as string)
  const [organizer, setOrganizer] = useState<Organizer | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    supabase
      .from('organizers')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setOrganizer(data ?? null)
        setLoading(false)
      })
  }, [id])

  if (loading) return <LoadingState />
  if (!organizer) {
    return (
      <EmptyState
        title="Arrangören hittades inte"
        description="Den har tagits bort eller så är länken fel."
        action={
          <Button asChild variant="secondary">
            <Link href="/organizers">Till arrangörer</Link>
          </Button>
        }
      />
    )
  }

  return (
    <>
      <PageHeader title={organizer.name} description="Redigera arrangör" actions={<StatusBadge domain="organizer" value={organizer.status} />} />
      <OrganizerForm organizer={organizer} />
    </>
  )
}
