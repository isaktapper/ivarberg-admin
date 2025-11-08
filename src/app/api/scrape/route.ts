import { NextRequest, NextResponse } from 'next/server';
import { getScrapers } from '@/lib/scrapers/scraper-registry';
import { EventImporter } from '@/lib/services/event-importer';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300; // 5 minuter

// Service role client för att logga
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Optional: Lägg till auth här
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.SCRAPER_API_TOKEN}`) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    
    // Hämta user email och scraper names från request body (skickas från admin)
    const body = await request.json().catch(() => ({}));
    const triggerUserEmail = body.userEmail || null;
    const scraperNames = body.scraperNames || null; // Array av scraper-namn att köra
    
    let scrapers = getScrapers();
    
    // Filtrera till endast valda scrapers om specificerat
    if (scraperNames && Array.isArray(scraperNames) && scraperNames.length > 0) {
      scrapers = scrapers.filter(s => scraperNames.includes(s.config.name));
    }
    
    if (scrapers.length === 0) {
      return NextResponse.json(
        { error: 'No scrapers to run' },
        { status: 400 }
      );
    }
    
    const importer = new EventImporter();
    const results = [];
    
    for (const scraper of scrapers) {
      const startTime = Date.now();
      let logId: number | null = null;
      
      try {
        console.log(`Starting scrape: ${scraper.config.name}`);
        
        // Skapa log entry med status 'running'
        const { data: logData, error: logError } = await supabase
          .from('scraper_logs')
          .insert({
            scraper_name: scraper.config.name,
            scraper_url: scraper.config.url,
            organizer_id: scraper.config.organizerId,
            status: 'running',
            started_at: new Date().toISOString(),
            events_found: 0,
            events_imported: 0,
            duplicates_skipped: 0,
            triggered_by: 'manual',
            trigger_user_email: triggerUserEmail
          })
          .select()
          .single();
        
        if (logError) {
          console.error('Error creating log entry:', logError);
        } else {
          logId = logData?.id;
        }
        
        const events = await scraper.scrape();
        console.log(`Found ${events.length} events from ${scraper.config.name}`);

        const result = await importer.importEvents(
          events,
          scraper.config.name,
          scraper.config.organizerId,
          logId || undefined // Skicka med logId för progress tracking
        );
        
        results.push(result);
        
        // Uppdatera log entry med resultat
        if (logId) {
          const endTime = Date.now();
          const status = result.errors.length > 0 
            ? (result.eventsImported > 0 ? 'partial' : 'failed')
            : 'success';
          
          await supabase
            .from('scraper_logs')
            .update({
              status,
              completed_at: new Date().toISOString(),
              duration_ms: endTime - startTime,
              events_found: result.eventsFound,
              events_imported: result.eventsImported,
              duplicates_skipped: result.duplicatesSkipped,
              errors: result.errors.length > 0 ? result.errors : null
            })
            .eq('id', logId);
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isCancelled = errorMsg.includes('cancelled') || errorMsg.includes('Process cancelled by user');
        
        const result = {
          source: scraper.config.name,
          success: false,
          eventsFound: 0,
          eventsImported: 0,
          duplicatesSkipped: 0,
          errors: [errorMsg]
        };
        results.push(result);
        
        // Uppdatera log entry med fel eller avbrytning
        if (logId) {
          const endTime = Date.now();
          const status = isCancelled ? 'cancelled' : 'failed';
          await supabase
            .from('scraper_logs')
            .update({
              status,
              completed_at: new Date().toISOString(),
              duration_ms: endTime - startTime,
              errors: [errorMsg]
            })
            .eq('id', logId);
        }
      }
    }
    
    // Sammanfattning
    const summary = {
      timestamp: new Date().toISOString(),
      totalSources: scrapers.length,
      totalFound: results.reduce((sum, r) => sum + r.eventsFound, 0),
      totalImported: results.reduce((sum, r) => sum + r.eventsImported, 0),
      totalDuplicates: results.reduce((sum, r) => sum + r.duplicatesSkipped, 0),
      results
    };
    
    return NextResponse.json(summary);
    
  } catch (error) {
    console.error('Scraping error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', details: errorMsg },
      { status: 500 }
    );
  }
}

// GET för att se status
export async function GET() {
  const scrapers = getScrapers();
  return NextResponse.json({
    message: 'Event scraper API',
    scrapers: scrapers.map(s => ({
      name: s.config.name,
      url: s.config.url,
      enabled: s.config.enabled,
      organizerId: s.config.organizerId
    }))
  });
}
