import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // ==================== SCRAPER STATS ====================
    
    // Hämta alla scraper logs för senaste 30 dagarna
    const { data: scraperLogs, error: scraperError } = await supabase
      .from('scraper_logs')
      .select('*')
      .gte('started_at', thirtyDaysAgo.toISOString())
      .order('started_at', { ascending: true });

    if (scraperError) throw scraperError;

    // Beräkna scraper statistik per scraper
    const scraperStats: Record<string, {
      name: string;
      total: number;
      success: number;
      failed: number;
      partial: number;
      cancelled: number;
      successRate: number;
      totalEventsFound: number;
      totalEventsImported: number;
      totalDuplicates: number;
      avgDuration: number;
      lastRun: string | null;
      lastStatus: string | null;
      errors: string[];
    }> = {};

    scraperLogs?.forEach(log => {
      if (!scraperStats[log.scraper_name]) {
        scraperStats[log.scraper_name] = {
          name: log.scraper_name,
          total: 0,
          success: 0,
          failed: 0,
          partial: 0,
          cancelled: 0,
          successRate: 0,
          totalEventsFound: 0,
          totalEventsImported: 0,
          totalDuplicates: 0,
          avgDuration: 0,
          lastRun: null,
          lastStatus: null,
          errors: []
        };
      }

      const stats = scraperStats[log.scraper_name];
      stats.total++;
      stats.totalEventsFound += log.events_found || 0;
      stats.totalEventsImported += log.events_imported || 0;
      stats.totalDuplicates += log.duplicates_skipped || 0;
      
      if (log.status === 'success') stats.success++;
      else if (log.status === 'failed') stats.failed++;
      else if (log.status === 'partial') stats.partial++;
      else if (log.status === 'cancelled') stats.cancelled++;

      if (log.duration_ms) {
        stats.avgDuration = ((stats.avgDuration * (stats.total - 1)) + log.duration_ms) / stats.total;
      }

      // Uppdatera senaste körning
      if (!stats.lastRun || new Date(log.started_at) > new Date(stats.lastRun)) {
        stats.lastRun = log.started_at;
        stats.lastStatus = log.status;
      }

      // Samla fel
      if (log.errors && log.errors.length > 0) {
        stats.errors.push(...log.errors);
      }
    });

    // Beräkna success rate
    Object.values(scraperStats).forEach(stats => {
      stats.successRate = stats.total > 0 
        ? Math.round(((stats.success + stats.partial) / stats.total) * 100)
        : 0;
    });

    // Trend data för diagram (körningar per dag)
    const scraperTrend: { date: string; imported: number; found: number; duplicates: number }[] = [];
    const dailyData: Record<string, { imported: number; found: number; duplicates: number }> = {};

    scraperLogs?.forEach(log => {
      const date = log.started_at.split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { imported: 0, found: 0, duplicates: 0 };
      }
      dailyData[date].imported += log.events_imported || 0;
      dailyData[date].found += log.events_found || 0;
      dailyData[date].duplicates += log.duplicates_skipped || 0;
    });

    Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, data]) => {
        scraperTrend.push({ date, ...data });
      });

    // Vanligaste felen
    const errorCounts: Record<string, number> = {};
    Object.values(scraperStats).forEach(stats => {
      stats.errors.forEach(error => {
        const key = error.substring(0, 80);
        errorCounts[key] = (errorCounts[key] || 0) + 1;
      });
    });

    const topErrors = Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([error, count]) => ({ error, count }));

    // ==================== EVENT STATS ====================

    // Hämta alla events
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, status, date_time, categories, organizer_id, created_at, quality_score, image_url, description');

    if (eventsError) throw eventsError;

    // Hämta organizers för namn
    const { data: organizers } = await supabase
      .from('organizers')
      .select('id, name');

    const organizerMap = new Map(organizers?.map(o => [o.id, o.name]) || []);

    // Grundläggande event-statistik
    const eventStats = {
      total: events?.length || 0,
      published: events?.filter(e => e.status === 'published').length || 0,
      pending: events?.filter(e => e.status === 'pending_approval').length || 0,
      draft: events?.filter(e => e.status === 'draft').length || 0,
      cancelled: events?.filter(e => e.status === 'cancelled').length || 0,
      active: events?.filter(e => new Date(e.date_time) >= now && e.status === 'published').length || 0,
      passed: events?.filter(e => new Date(e.date_time) < now).length || 0,
      addedLast24h: events?.filter(e => new Date(e.created_at) >= oneDayAgo).length || 0,
      addedLast7d: events?.filter(e => new Date(e.created_at) >= sevenDaysAgo).length || 0,
    };

    // Events per kategori
    const categoryStats: Record<string, number> = {};
    events?.forEach(event => {
      if (event.status !== 'published') return;
      event.categories?.forEach((cat: string) => {
        categoryStats[cat] = (categoryStats[cat] || 0) + 1;
      });
    });

    const categoryData = Object.entries(categoryStats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Events per källa/organizer
    const sourceStats: Record<number, { name: string; count: number }> = {};
    events?.forEach(event => {
      if (event.status !== 'published' || !event.organizer_id) return;
      if (!sourceStats[event.organizer_id]) {
        sourceStats[event.organizer_id] = {
          name: organizerMap.get(event.organizer_id) || 'Okänd',
          count: 0
        };
      }
      sourceStats[event.organizer_id].count++;
    });

    const sourceData = Object.values(sourceStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Kommande events per vecka (8 veckor)
    const weeklyForecast: { week: string; count: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() + (i * 7) - weekStart.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const count = events?.filter(e => {
        const eventDate = new Date(e.date_time);
        return eventDate >= weekStart && eventDate < weekEnd && e.status === 'published';
      }).length || 0;

      const weekLabel = `V${getWeekNumber(weekStart)}`;
      weeklyForecast.push({ week: weekLabel, count });
    }

    // Events tillagda per dag (trend)
    const eventTrend: { date: string; added: number }[] = [];
    const eventsByDay: Record<string, number> = {};

    events?.forEach(event => {
      const date = event.created_at.split('T')[0];
      if (new Date(date) >= thirtyDaysAgo) {
        eventsByDay[date] = (eventsByDay[date] || 0) + 1;
      }
    });

    Object.entries(eventsByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, added]) => {
        eventTrend.push({ date, added });
      });

    // ==================== DATA QUALITY ====================

    const publishedEvents = events?.filter(e => e.status === 'published') || [];

    const qualityStats = {
      noCategory: publishedEvents.filter(e => !e.categories || e.categories.length === 0).length,
      noImage: publishedEvents.filter(e => !e.image_url).length,
      noDescription: publishedEvents.filter(e => !e.description || e.description.length < 20).length,
      lowQuality: publishedEvents.filter(e => e.quality_score && e.quality_score < 50).length,
      avgQualityScore: publishedEvents.length > 0
        ? Math.round(
            publishedEvents.reduce((sum, e) => sum + (e.quality_score || 0), 0) / 
            publishedEvents.filter(e => e.quality_score).length || 1
          )
        : 0,
    };

    // ==================== RESPONSE ====================

    return NextResponse.json({
      scrapers: {
        stats: Object.values(scraperStats),
        trend: scraperTrend,
        topErrors,
        summary: {
          totalRuns: scraperLogs?.length || 0,
          totalFound: scraperLogs?.reduce((sum, l) => sum + (l.events_found || 0), 0) || 0,
          totalImported: scraperLogs?.reduce((sum, l) => sum + (l.events_imported || 0), 0) || 0,
          totalDuplicates: scraperLogs?.reduce((sum, l) => sum + (l.duplicates_skipped || 0), 0) || 0,
          overallSuccessRate: scraperLogs?.length 
            ? Math.round(
                (scraperLogs.filter(l => l.status === 'success' || l.status === 'partial').length / 
                scraperLogs.length) * 100
              )
            : 0,
        }
      },
      events: {
        stats: eventStats,
        categories: categoryData,
        sources: sourceData,
        weeklyForecast,
        trend: eventTrend,
      },
      quality: qualityStats,
      generatedAt: now.toISOString(),
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    );
  }
}

// Helper för att få veckonummer
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

