import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    // Hämta main featured event
    const { data: mainData, error: mainError } = await supabase
      .from('hero_featured_events')
      .select(`
        *,
        event:events!inner(
          *,
          organizer:organizers(*)
        )
      `)
      .eq('position', 'main')
      .eq('event.status', 'published')
      .single()

    if (mainError && mainError.code !== 'PGRST116') {
      console.error('Error fetching main featured event:', mainError)
    }

    // Hämta secondary featured events
    const { data: secondaryData, error: secondaryError } = await supabase
      .from('hero_featured_events')
      .select(`
        *,
        event:events!inner(
          *,
          organizer:organizers(*)
        )
      `)
      .eq('position', 'secondary')
      .eq('event.status', 'published')
      .order('priority', { ascending: true })
      .limit(5)

    if (secondaryError) {
      console.error('Error fetching secondary featured events:', secondaryError)
    }

    return NextResponse.json({
      main: mainData?.event || null,
      secondary: secondaryData?.map(item => item.event) || []
    })
  } catch (error) {
    console.error('Error fetching hero featured events:', error)
    return NextResponse.json(
      { error: 'Internal server error', main: null, secondary: [] }, 
      { status: 500 }
    )
  }
}


