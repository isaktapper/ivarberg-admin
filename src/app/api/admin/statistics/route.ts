import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { fetchAllRows } from '@/lib/supabase-fetch-all';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const action = searchParams.get('action');
  const organizerId = searchParams.get('organizerId');

  try {
    // Hämta alla loggar paginerat - Supabase cappar annars vid 1000 rader
    // och totalsiffran fastnar på "1000"
    const auditData = await fetchAllRows<any>((from, to) => {
      let query = supabase
        .from('event_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }
      if (action && action !== 'all') {
        query = query.eq('action', action);
      }

      return query.range(from, to);
    });

    // Filtrera på organisatör: hämta organisatörens event-id:n direkt
    // (istället för .in() med tusentals id:n som slår i URL-gränsen)
    let data = auditData;

    if (organizerId && data.length > 0) {
      const eventsData = await fetchAllRows<{ event_id: string }>((from, to) =>
        supabase
          .from('events')
          .select('event_id')
          .eq('organizer_id', parseInt(organizerId))
          .order('id', { ascending: true })
          .range(from, to)
      );

      const allowedEventIds = new Set(eventsData.map(e => e.event_id));
      data = data.filter(log => allowedEventIds.has(log.event_id));
    }

    // Beräkna statistik
    const stats = {
      total: data.length,
      autoPublished: data.filter(d => d.action === 'auto_published').length,
      manuallyApproved: data.filter(d => d.action === 'approved').length,
      rejected: data.filter(d => d.action === 'rejected').length,
      avgQualityScore: data.length > 0 ? Math.round(
        data.reduce((sum, d) => sum + (d.quality_score || 0), 0) / data.length
      ) : 0,
      byOrganizer: {} as Record<number, number>,
      byCategory: {} as Record<string, number>,
    };

    // Note: byOrganizer och byCategory kan hämtas från events-tabellen om behövs senare

    return NextResponse.json({
      logs: data,
      stats
    });

  } catch (error) {
    console.error('Statistics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}

