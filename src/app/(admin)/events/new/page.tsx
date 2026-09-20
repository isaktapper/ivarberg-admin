'use client'

import { useRouter } from 'next/navigation'
import { EventForm } from '@/components/events/EventForm'

export default function NewEventPage() {
  const router = useRouter()
  return <EventForm mode="create" onSaved={(id) => router.push(`/events/${id}/edit`)} />
}
