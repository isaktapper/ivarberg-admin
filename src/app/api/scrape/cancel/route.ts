import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role client för att uppdatera databas
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/scrape/cancel
 * 
 * Avbryt alla pågående scraping processer
 */
export async function POST(request: NextRequest) {
  try {
    // Hämta alla pågående scraping processer
    const { data: runningLogs, error: fetchError } = await supabase
      .from('scraper_logs')
      .select('id, scraper_name, started_at')
      .eq('status', 'running');

    if (fetchError) {
      console.error('Error fetching running logs:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch running processes' },
        { status: 500 }
      );
    }

    if (!runningLogs || runningLogs.length === 0) {
      return NextResponse.json({
        message: 'No running scraping processes found',
        cancelledCount: 0
      });
    }

    // Uppdatera alla pågående processer till 'cancelled'
    let { error: updateError, data: updateData } = await supabase
      .from('scraper_logs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        errors: ['Process cancelled by user']
      })
      .eq('status', 'running')
      .select();

    // Fallback: om 'cancelled' status inte finns, använd 'failed' istället
    if (updateError && updateError.message.includes('cancelled')) {
      console.warn('Cancelled status not available, falling back to failed status');
      const fallbackResult = await supabase
        .from('scraper_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          errors: ['Process cancelled by user']
        })
        .eq('status', 'running')
        .select();
      
      updateError = fallbackResult.error;
      updateData = fallbackResult.data;
    }

    if (updateError) {
      console.error('Error cancelling processes:', updateError);
      console.error('Update error details:', JSON.stringify(updateError, null, 2));
      return NextResponse.json(
        { 
          error: 'Failed to cancel processes', 
          details: updateError.message,
          hint: updateError.hint || 'Check if database migration has been run'
        },
        { status: 500 }
      );
    }

    console.log('Successfully updated processes:', updateData);

    return NextResponse.json({
      message: `Successfully cancelled ${runningLogs.length} scraping process(es)`,
      cancelledCount: runningLogs.length,
      cancelledProcesses: runningLogs.map(log => ({
        id: log.id,
        scraperName: log.scraper_name,
        startedAt: log.started_at
      }))
    });

  } catch (error) {
    console.error('Cancel scraping error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', details: errorMsg },
      { status: 500 }
    );
  }
}

/**
 * En scrape tar max ~5 min (maxDuration = 300 på /api/scrape). En running-rad
 * äldre än så är en död process - t.ex. en avbruten/timeoutad GitHub Actions-
 * körning som aldrig hann uppdatera sin status. Utan städning ligger raden
 * kvar som 'running' för evigt och UI:t visar permanent "Kör scraping".
 */
const STALE_RUNNING_MINUTES = 15;

/**
 * GET /api/scrape/cancel
 *
 * Hämta status för pågående scraping processer.
 * Självläkande: markerar döda running-rader som failed innan räkningen.
 */
export async function GET() {
  try {
    const now = Date.now();
    const staleCutoff = new Date(now - STALE_RUNNING_MINUTES * 60 * 1000).toISOString();

    // Städa döda processer först
    const { error: staleError } = await supabase
      .from('scraper_logs')
      .update({
        status: 'failed',
        completed_at: new Date(now).toISOString(),
        errors: [`Processen rapporterade aldrig klart - automatiskt markerad som failed efter ${STALE_RUNNING_MINUTES} min`]
      })
      .eq('status', 'running')
      .lt('started_at', staleCutoff);

    if (staleError) {
      // Logga men fortsätt - räkningen nedan filtrerar ändå bort gamla rader
      console.error('Error cleaning stale running logs:', staleError);
    }

    const { data: runningLogs, error } = await supabase
      .from('scraper_logs')
      .select('id, scraper_name, started_at, events_found, events_imported')
      .eq('status', 'running')
      .gte('started_at', staleCutoff)
      .order('started_at', { ascending: false });

    if (error) {
      console.error('Error fetching running logs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch running processes' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      runningCount: runningLogs?.length || 0,
      processes: runningLogs || []
    });

  } catch (error) {
    console.error('Get running processes error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', details: errorMsg },
      { status: 500 }
    );
  }
}
