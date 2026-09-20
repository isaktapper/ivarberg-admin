/**
 * Hjälpfunktioner för godkännandesidan och dess API - hämtar dagens rad via
 * engångstoken och formar en vy som klienten kan rendera.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { InstagramPost } from '@/types/database'
import { InstagramProposal } from './instagram-proposal'

export interface ApprovalView {
  postDate: string
  status: InstagramPost['status']
  proposal: InstagramProposal | null
  approvalSource: InstagramPost['approval_source'] | null
  postedAt: string | null
  publishedEventId: number | null
  publishedCaption: string | null
  publishedSlideUrls: string[]
  error: string | null
}

export function approvalServiceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function loadPostByToken(supabase: SupabaseClient, token: string): Promise<InstagramPost | null> {
  if (!token || token.length < 16 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null
  const { data, error } = await supabase.from('instagram_posts').select('*').eq('approval_token', token).maybeSingle()
  if (error) throw new Error(`Kunde inte läsa förslaget: ${error.message}`)
  return (data as InstagramPost | null) ?? null
}

export function toApprovalView(row: InstagramPost): ApprovalView {
  return {
    postDate: row.post_date,
    status: row.status,
    proposal: (row.proposal as InstagramProposal | null) ?? null,
    approvalSource: row.approval_source ?? null,
    postedAt: row.posted_at ?? null,
    publishedEventId: row.event_id ?? null,
    publishedCaption: row.status === 'published' ? (row.caption ?? null) : null,
    publishedSlideUrls: row.status === 'published' ? (row.slide_image_urls ?? []) : [],
    error: row.error ?? null,
  }
}
