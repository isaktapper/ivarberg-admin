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
 * POST /api/admin/tips/:id/reject
 * Avböj ett tips
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

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
    const reason = body.reason || 'No reason provided'

    // Uppdatera status till rejected
    const { data, error } = await supabase
      .from('event_tips')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // TODO: Lägg till logging/reason till eventuell log-tabell
    console.log(`Tip ${id} rejected. Reason: ${reason}`)

    return NextResponse.json({
      success: true,
      data,
      message: 'Tip rejected successfully'
    })
  } catch (error) {
    console.error('Error rejecting tip:', error)
    return NextResponse.json(
      { error: 'Failed to reject tip', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
