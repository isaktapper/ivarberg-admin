import { createClient } from '@supabase/supabase-js';

/**
 * Service för real-time progress logging av scraper-körningar
 * Används för att visa status i admin UI med tidsuppskattning
 */

export type ProgressStep =
  | 'starting'
  | 'scraping'
  | 'deduplicating'
  | 'categorizing'
  | 'matching_organizers'
  | 'importing'
  | 'completed'
  | 'failed';

interface ProgressLogEntry {
  logId: number;
  step: ProgressStep;
  message: string;
  progressCurrent?: number;
  progressTotal?: number;
  estimatedTimeRemainingMs?: number;
  metadata?: Record<string, any>;
}

interface TimeEstimator {
  startTime: number;
  itemsProcessed: number;
  totalItems: number;
}

export class ProgressLogger {
  private supabase;
  private timeEstimators: Map<number, TimeEstimator> = new Map();

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Logga ett progress-meddelande
   */
  async log(entry: ProgressLogEntry): Promise<void> {
    const { logId, step, message, progressCurrent, progressTotal, metadata } = entry;

    // Beräkna uppskattad tid om progress finns
    let estimatedTimeRemainingMs = entry.estimatedTimeRemainingMs;

    if (progressCurrent !== undefined && progressTotal !== undefined && progressTotal > 0) {
      estimatedTimeRemainingMs = this.calculateEstimatedTime(
        logId,
        progressCurrent,
        progressTotal
      );
    }

    // Logga till console (för development)
    const progressStr = progressTotal
      ? ` [${progressCurrent}/${progressTotal}]`
      : '';

    const timeStr = estimatedTimeRemainingMs
      ? ` ~${Math.round(estimatedTimeRemainingMs / 1000)}s kvar`
      : '';

    console.log(`  📊 ${message}${progressStr}${timeStr}`);

    // Spara till databas
    try {
      await this.supabase
        .from('scraper_progress_logs')
        .insert({
          log_id: logId,
          step,
          message,
          progress_current: progressCurrent,
          progress_total: progressTotal,
          estimated_time_remaining_ms: estimatedTimeRemainingMs,
          metadata: metadata || null,
        });
    } catch (error) {
      console.error('Failed to log progress:', error);
      // Don't throw - progress logging shouldn't break scraping
    }
  }

  /**
   * Initialisera tidsuppskattning för en log
   */
  initTimeEstimator(logId: number, totalItems: number): void {
    this.timeEstimators.set(logId, {
      startTime: Date.now(),
      itemsProcessed: 0,
      totalItems,
    });
  }

  /**
   * Beräkna uppskattad kvarstående tid baserat på genomsnittlig hastighet
   */
  private calculateEstimatedTime(
    logId: number,
    current: number,
    total: number
  ): number | undefined {
    const estimator = this.timeEstimators.get(logId);
    if (!estimator || current === 0) return undefined;

    const elapsed = Date.now() - estimator.startTime;
    const itemsPerMs = current / elapsed;
    const remaining = total - current;
    const estimatedMs = remaining / itemsPerMs;

    return Math.round(estimatedMs);
  }

  /**
   * Helper: Logga start av scraping
   */
  async logStart(logId: number, scraperName: string): Promise<void> {
    await this.log({
      logId,
      step: 'starting',
      message: `Startar scraping av ${scraperName}...`,
    });
  }

  /**
   * Helper: Logga att scraping pågår
   */
  async logScraping(logId: number, current: number, total: number): Promise<void> {
    await this.log({
      logId,
      step: 'scraping',
      message: `Scrapar events...`,
      progressCurrent: current,
      progressTotal: total,
    });
  }

  /**
   * Helper: Logga hittade events
   */
  async logEventsFound(logId: number, count: number): Promise<void> {
    await this.log({
      logId,
      step: 'scraping',
      message: `Hittade ${count} events`,
      metadata: { eventsFound: count },
    });
  }

  /**
   * Helper: Logga deduplicering
   */
  async logDeduplicating(
    logId: number,
    current: number,
    total: number,
    duplicatesFound: number
  ): Promise<void> {
    await this.log({
      logId,
      step: 'deduplicating',
      message: `Kontrollerar dubletter... (${duplicatesFound} hittills)`,
      progressCurrent: current,
      progressTotal: total,
      metadata: { duplicatesFound },
    });
  }

  /**
   * Helper: Logga AI-kategorisering
   */
  async logCategorizing(
    logId: number,
    current: number,
    total: number,
    useCache: boolean = false
  ): Promise<void> {
    const cacheStr = useCache ? ' (cache)' : '';
    await this.log({
      logId,
      step: 'categorizing',
      message: `Kategoriserar med AI${cacheStr}...`,
      progressCurrent: current,
      progressTotal: total,
    });
  }

  /**
   * Helper: Logga arrangörsmatchning
   */
  async logMatchingOrganizers(
    logId: number,
    current: number,
    total: number
  ): Promise<void> {
    await this.log({
      logId,
      step: 'matching_organizers',
      message: `Matchar arrangörer...`,
      progressCurrent: current,
      progressTotal: total,
    });
  }

  /**
   * Helper: Logga import till databas
   */
  async logImporting(
    logId: number,
    current: number,
    total: number
  ): Promise<void> {
    await this.log({
      logId,
      step: 'importing',
      message: `Sparar till databas...`,
      progressCurrent: current,
      progressTotal: total,
    });
  }

  /**
   * Helper: Logga slutresultat
   */
  async logCompleted(
    logId: number,
    stats: {
      imported: number;
      duplicates: number;
      published: number;
      pending: number;
      draft: number;
    }
  ): Promise<void> {
    await this.log({
      logId,
      step: 'completed',
      message: `Klar! ${stats.imported} events importerade (${stats.published} auto-publicerade)`,
      metadata: stats,
    });
  }

  /**
   * Helper: Logga fel
   */
  async logError(logId: number, error: string): Promise<void> {
    await this.log({
      logId,
      step: 'failed',
      message: `Fel: ${error}`,
      metadata: { error },
    });
  }

  /**
   * Rensa time estimator när körningen är klar
   */
  cleanup(logId: number): void {
    this.timeEstimators.delete(logId);
  }
}

export const progressLogger = new ProgressLogger();
