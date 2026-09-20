'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/types/database'
import { EventForm } from '@/components/events/EventForm'
import { LoadingState, EmptyState } from '@/components/ui/states'
import { Button } from '@/components/ui/button'

export default function EditEventPage() {
  const params = useParams()
  const id = Number(params.id)
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let alive = true
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!alive) return
        setEvent(data ?? null)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  if (loading) return <LoadingState label="Hämtar event…" />
  if (!event)
    return (
      <EmptyState
        icon={<Calendar />}
        title="Eventet hittades inte"
        description="Det kan ha tagits bort, eller så är länken fel."
        action={
          <Button asChild variant="secondary">
            <Link href="/events">Till alla events</Link>
          </Button>
        }
      />
    )

  return (
    <EventForm
      mode="edit"
      event={event}
      onSaved={async () => {
        const { data } = await supabase.from('events').select('*').eq('id', id).single()
        if (data) setEvent(data)
      }}
    />
  )
}
