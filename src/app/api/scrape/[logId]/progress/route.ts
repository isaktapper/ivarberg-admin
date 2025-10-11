import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/scrape/[logId]/progress
 *
 * Hämta progress logs för en specifik scraper-körning
 * Används för real-time uppdateringar i admin UI
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ logId: string }> }
) {
  try {
    // Next.js 15: params måste awaitas
    const { logId: logIdStr } = await params;
    const logId = parseInt(logIdStr);

    if (isNaN(logId)) {
      return NextResponse.json(
        { error: 'Invalid logId' },
        { status: 400 }
      );
    }

    // Hämta scraper log info
    const { data: scraperLog, error: logError } = await supabase
      .from('scraper_logs')
      .select('id, scraper_name, status, started_at, completed_at, duration_ms')
      .eq('id', logId)
      .single();

    if (logError || !scraperLog) {
      return NextResponse.json(
        { error: 'Scraper log not found' },
        { status: 404 }
      );
    }

    // Hämta alla progress logs för denna körning
    const { data: progressLogs, error: progressError } = await supabase
      .from('scraper_progress_logs')
      .select('*')
      .eq('log_id', logId)
      .order('created_at', { ascending: true });

    if (progressError) {
      console.error('Error fetching progress logs:', progressError);
      return NextResponse.json(
        { error: 'Failed to fetch progress logs' },
        { status: 500 }
      );
    }

    // Beräkna total progress
    const latestLog = progressLogs && progressLogs.length > 0
      ? progressLogs[progressLogs.length - 1]
      : null;

    const totalProgress = latestLog?.progress_total
      ? {
          current: latestLog.progress_current || 0,
          total: latestLog.progress_total,
          percentage: Math.round(
            ((latestLog.progress_current || 0) / latestLog.progress_total) * 100
          ),
        }
      : null;

    return NextResponse.json({
      scraperLog,
      progressLogs: progressLogs || [],
      totalProgress,
      isRunning: scraperLog.status === 'running',
      estimatedTimeRemaining: latestLog?.estimated_time_remaining_ms || null,
    });

  } catch (error) {
    console.error('Error in progress endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
