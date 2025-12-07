import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-server'
import { generateUniqueEventId } from '@/lib/event-id-generator'

/**
 * Verify server-side authentication
 */
async function verifyAuth() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  const { data: { session }, error } = await supabase.auth.getSession()

  if (!session || error) {
    return null
  }

  return session
}

/**
 * Helper function för att generera category scores
 */
function generateCategoryScores(categories?: string[]): Record<string, number> {
  if (!categories || categories.length === 0) {
    return { 'Okategoriserad': 1.0 }
  }

  return categories.reduce((scores, category, index) => {
    scores[category] = 1.0 - (index * 0.1)
    return scores
  }, {} as Record<string, number>)
}

/**
 * POST /api/admin/tips/:id/convert
 * Konvertera tips till event
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // Verify authentication
    const session = await verifyAuth()
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Hämta tipset
    const { data: tip, error: tipError } = await supabaseAdmin
      .from('event_tips')
      .select('*')
      .eq('id', id)
      .single()

    if (tipError) throw tipError

    if (!tip) {
      return NextResponse.json(
        { error: 'Tip not found' },
        { status: 404 }
      )
    }

    if (tip.status === 'converted') {
      return NextResponse.json(
        { error: 'Tip already converted' },
        { status: 400 }
      )
    }

    // Generera unikt event ID
    const eventId = await generateUniqueEventId(
      tip.event_name,
      `tip-${tip.id}`,
      supabaseAdmin
    )

    // Förbered categories
    const categories = tip.categories && tip.categories.length > 0
      ? tip.categories
      : tip.category
        ? [tip.category]
        : ['Okategoriserad']

    // Skapa event från tips
    const eventData = {
      event_id: eventId,
      name: tip.event_name,
      date_time: tip.date_time || tip.event_date,
      location: tip.event_location || '',
      venue_name: tip.venue_name,
      description: tip.event_description,
      description_format: 'plaintext' as const,
      categories: categories,
      category_scores: generateCategoryScores(categories),
      image_url: tip.image_url,
      organizer_event_url: tip.website_url,
      status: 'draft' as const, // Väntar på admin approval
      tags: ['tips', 'user-submitted'],
      price: null,
      organizer_id: null,
      is_featured: false,
      featured: false,
      max_participants: null,
      quality_score: null,
      quality_issues: null,
      auto_published: false
    }

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .insert([eventData])
      .select()
      .single()

    if (eventError) throw eventError

    // Uppdatera tip status till converted
    const { error: updateError } = await supabaseAdmin
      .from('event_tips')
      .update({
        status: 'converted',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      event_id: eventId,
      event,
      message: 'Tip converted to event successfully'
    })
  } catch (error) {
    console.error('Error converting tip:', error)
    return NextResponse.json(
      {
        error: 'Failed to convert tip',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
