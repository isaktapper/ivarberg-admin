import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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
    // Bygg query - använd separat query eftersom foreign key kan saknas
    let query = supabase
      .from('event_audit_log')
      .select('*')
      .order('created_at', { ascending: false });

    // Applicera filter
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }
    if (action && action !== 'all') {
      query = query.eq('action', action);
    }

    const { data: auditData, error } = await query;

    if (error) throw error;

    // Hämta events separat om vi behöver filtrera på organisatör
    let data = auditData || [];
    
    if (organizerId && data.length > 0) {
      const eventIds = data.map(log => log.event_id).filter(Boolean);
      const { data: eventsData } = await supabase
        .from('events')
        .select('event_id, organizer_id')
        .in('event_id', eventIds)
        .eq('organizer_id', parseInt(organizerId));
      
      const allowedEventIds = new Set(eventsData?.map(e => e.event_id) || []);
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

