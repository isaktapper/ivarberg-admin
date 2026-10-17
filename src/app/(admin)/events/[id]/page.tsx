import { redirect } from 'next/navigation'

/** Detaljvyn är ersatt av editorn (förhandsvisning, kvalitet och historik finns där). */
export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/events/${id}/edit`)
}
