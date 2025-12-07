import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
    return { session: null, supabase }
  }

  return { session, supabase }
}

/**
 * GET /api/admin/tips
 * Hämta alla tips med filter och pagination
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const { session, supabase } = await verifyAuth()
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    // Bygg query
    let query = supabase
      .from('event_tips')
      .select('*', { count: 'exact' })

    // Status filter
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Pagination
    const offset = (page - 1) * limit
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: tips, error, count } = await query

    if (error) throw error

    return NextResponse.json({
      tips: tips || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    })
  } catch (error) {
    console.error('Error fetching tips:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tips', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/tips
 * Skapa nytt tips (för testning)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { session, supabase } = await verifyAuth()
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()

    const { data, error } = await supabase
      .from('event_tips')
      .insert([{
        event_name: body.event_name,
        event_date: body.event_date,
        date_time: body.date_time,
        event_location: body.event_location,
        venue_name: body.venue_name,
        event_description: body.event_description,
        categories: body.categories,
        category: body.category,
        image_url: body.image_url,
        website_url: body.website_url,
        submitter_email: body.submitter_email,
        submitter_name: body.submitter_name,
        status: 'pending'
      }])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error creating tip:', error)
    return NextResponse.json(
      { error: 'Failed to create tip', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
