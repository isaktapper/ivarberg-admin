'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { OrganizerPage } from '@/types/database'
import { PageHeader } from '@/components/ui/page-header'
import { OrganizerPageForm } from '@/components/organizers/OrganizerPageForm'
import { LoadingState, EmptyState } from '@/components/ui/states'
import { Button } from '@/components/ui/button'

export default function EditOrganizerPagePage() {
  const params = useParams()
  const id = params.id as string
  const [page, setPage] = useState<OrganizerPage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    supabase
      .from('organizer_pages')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setPage(data ?? null)
        setLoading(false)
      })
  }, [id])

  if (loading) return <LoadingState />
  if (!page) {
    return (
      <EmptyState
        title="Sidan hittades inte"
        description="Den har tagits bort eller så är länken fel."
        action={
          <Button asChild variant="secondary">
            <Link href="/organizer-pages">Till arrangörssidor</Link>
          </Button>
        }
      />
    )
  }

  return (
    <>
      <PageHeader title={page.name} description="Redigera arrangörssida" />
      <OrganizerPageForm page={page} />
    </>
  )
}
