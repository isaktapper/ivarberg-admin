import { createClient } from '@supabase/supabase-js';
import { ScrapedEvent, ScraperResult } from '../scrapers/types';
import { generateUniqueEventId } from '../event-id-generator';
import { aiCategorizer } from './aiCategorizer';
import { eventQualityChecker } from './eventQualityChecker';
import { organizerMatcher } from './organizerMatcher';
import { progressLogger } from './progressLogger';
import * as stringSimilarity from 'string-similarity';

// Interface för duplicate logging
interface DuplicateLog {
  scraper_name: string;
  scraped_event_name: string;
  scraped_event_url: string;
  existing_event_id: number;
  existing_event_name: string;
  existing_event_url: string;
  similarity_score: number;
  match_type: 'url' | 'fuzzy_name';
  scraped_at: string;
}

export class EventImporter {
  private supabase;
  private duplicateLogs: DuplicateLog[] = [];
  private categoryCache: Map<string, { categories: string[], scores: Record<string, number> }> = new Map(); // Cache för AI-kategorisering
  private logId?: number; // För progress logging
  private isCancelled: boolean = false; // För avbrytning

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role key för server-side
    );
  }

  /**
   * Kontrollera om processen är avbruten
   */
  private async checkCancellation(): Promise<boolean> {
    if (this.isCancelled) return true;
    
    if (this.logId) {
      const { data: logData } = await this.supabase
        .from('scraper_logs')
        .select('status')
        .eq('id', this.logId)
        .single();
      
      if (logData && (logData.status === 'cancelled' || logData.status === 'failed')) {
        this.isCancelled = true;
        return true;
      }
    }
    
    return false;
  }

  async importEvents(
    events: ScrapedEvent[],
    source: string,
    organizerId: number,
    logId?: number // Optional: scraper_logs ID för progress tracking
  ): Promise<ScraperResult> {
    this.logId = logId;
    const result: ScraperResult = {
      source,
      success: true,
      eventsFound: events.length,
      eventsImported: 0,
      duplicatesSkipped: 0,
      errors: []
    };
    
    this.duplicateLogs = []; // Reset logs

    console.log(`\n📦 Importerar ${events.length} events...`);

    // Progress: Hittade events
    if (this.logId) {
      await progressLogger.logEventsFound(this.logId, events.length);
      progressLogger.initTimeEstimator(this.logId, events.length);
    }

    // 1. Deduplicate internt först (samma scrape-session)
    if (this.logId) {
      await progressLogger.log({
        logId: this.logId,
        step: 'deduplicating',
        message: 'Rensar interna dubletter...',
      });
    }
    const internallyUnique = await this.deduplicateInternally(events);
    console.log(`✓ Efter intern deduplicering: ${internallyUnique.length} unika events`);

    // 2. Enhanced duplicate check mot databasen
    if (this.logId) {
      await progressLogger.log({
        logId: this.logId,
        step: 'deduplicating',
        message: 'Kontrollerar mot databas...',
        progressCurrent: 0,
        progressTotal: internallyUnique.length,
      });
    }
    const uniqueEvents = await this.checkDatabaseDuplicates(internallyUnique);
    console.log(`✓ Efter databas-deduplicering: ${uniqueEvents.length} nya events`);
    result.duplicatesSkipped = events.length - uniqueEvents.length;

    if (this.logId) {
      await progressLogger.log({
        logId: this.logId,
        step: 'deduplicating',
        message: `Rensade bort ${result.duplicatesSkipped} dubletter`,
        metadata: { duplicatesSkipped: result.duplicatesSkipped },
      });
    }
    
    // 2. Kategorisera och bedöm kvalitet med AI (endast unika events)
    console.log('\n🤖 Startar AI-kategorisering och kvalitetsbedömning...');
    if (this.logId) {
      await progressLogger.log({
        logId: this.logId,
        step: 'categorizing',
        message: 'Startar AI-kategorisering...',
        progressCurrent: 0,
        progressTotal: uniqueEvents.length,
      });
    }
    const categorizedEvents = await this.categorizeAndAssessQuality(uniqueEvents, organizerId, source);
    console.log(`✓ Kategorisering och kvalitetsbedömning klar: ${categorizedEvents.length} events`);

    // 3. Matcha arrangörer (för Visit Varberg m.fl. plattformar)
    console.log('\n🏢 Matchning av arrangörer...');
    if (this.logId) {
      await progressLogger.log({
        logId: this.logId,
        step: 'matching_organizers',
        message: 'Matchar arrangörer...',
        progressCurrent: 0,
        progressTotal: categorizedEvents.length,
      });
    }
    const eventsWithOrganizers = await this.matchOrganizers(categorizedEvents, organizerId, source);
    console.log(`✓ Arrangörmatchning klar`);

    // 4. Spara till databas
    console.log('\n💾 Sparar till databas...');
    if (this.logId) {
      await progressLogger.log({
        logId: this.logId,
        step: 'importing',
        message: 'Sparar events till databas...',
        progressCurrent: 0,
        progressTotal: eventsWithOrganizers.length,
      });
    }

    let importCount = 0;
    for (const eventData of eventsWithOrganizers) {
      // Kontrollera avbrytning innan varje event
      if (await this.checkCancellation()) {
        console.log('🛑 Process avbruten - stoppar import');
        throw new Error('Process cancelled by user');
      }

      try {
        // Validera required fields
        if (!this.validateEvent(eventData.event)) {
          result.errors.push(`Invalid event: ${eventData.event.name} - missing required fields`);
          continue;
        }

        // Skapa event med rätt organizer
        await this.createEvent(eventData.event, source, eventData.organizerId);
        result.eventsImported++;
        importCount++;

        // Progress update varje 10:e event
        if (this.logId && importCount % 10 === 0) {
          await progressLogger.logImporting(
            this.logId,
            importCount,
            eventsWithOrganizers.length
          );
        }

      } catch (error) {
        console.error(`Error importing event "${eventData.event.name}":`, error);
        let errorMsg = 'Unknown error';
        if (error instanceof Error) {
          errorMsg = error.message;
        } else if (typeof error === 'object' && error !== null) {
          errorMsg = JSON.stringify(error);
        } else {
          errorMsg = String(error);
        }
        result.errors.push(`Error importing ${eventData.event.name}: ${errorMsg}`);
      }
    }
    
    // Räkna statistik
    const stats = {
      total: categorizedEvents.length,
      published: categorizedEvents.filter(e => e.status === 'published').length,
      pending: categorizedEvents.filter(e => e.status === 'pending_approval').length,
      draft: categorizedEvents.filter(e => e.status === 'draft').length,
      avgScore: Math.round(
        categorizedEvents.reduce((sum, e) => sum + (e.quality_score || 0), 0) / 
        categorizedEvents.length
      )
    };

    console.log('\n📊 Statistik:');
    console.log(`  - ${stats.published} auto-publicerade`);
    console.log(`  - ${stats.pending} behöver granskning`);
    console.log(`  - ${stats.draft} markerade som draft`);
    console.log(`  - Genomsnittlig kvalitetspoäng: ${stats.avgScore}/100`);

    // Spara duplicate logs
    if (this.duplicateLogs.length > 0) {
      await this.saveDuplicateLogs(source);
    }

    // Progress: Slutrapport
    if (this.logId) {
      await progressLogger.logCompleted(this.logId, {
        imported: result.eventsImported,
        duplicates: result.duplicatesSkipped,
        published: stats.published,
        pending: stats.pending,
        draft: stats.draft,
      });
      progressLogger.cleanup(this.logId);
    }

    console.log('\n✅ Import klar!\n');
    return result;
  }
  
  private validateEvent(event: ScrapedEvent): boolean {
    return !!(event.name && event.date_time && event.location);
  }
  
  /**
   * Kategorisera OCH bedöm kvalitet på events med AI
   * Använder caching för att undvika att kategorisera samma eventnamn flera gånger
   */
  private async categorizeAndAssessQuality(events: ScrapedEvent[], organizerId: number, source?: string): Promise<ScrapedEvent[]> {
    const processed: ScrapedEvent[] = [];
    
    // Hämta organizer status
    const { data: organizerData } = await this.supabase
      .from('organizers')
      .select('status')
      .eq('id', organizerId)
      .single();
    
    const organizerStatus = organizerData?.status as 'active' | 'pending' | 'archived' | undefined;
    
    // Gruppera events med samma namn för smart kategorisering
    const eventsByName = new Map<string, ScrapedEvent[]>();
    for (const event of events) {
      const normalizedName = event.name.trim().toLowerCase();
      if (!eventsByName.has(normalizedName)) {
        eventsByName.set(normalizedName, []);
      }
      eventsByName.get(normalizedName)!.push(event);
    }
    
    console.log(`📊 ${events.length} events grupperade i ${eventsByName.size} unika eventnamn`);
    
    // Process varje grupp
    for (const [normalizedName, eventGroup] of eventsByName) {
      // Kontrollera avbrytning innan varje grupp
      if (await this.checkCancellation()) {
        console.log('🛑 Process avbruten - stoppar AI-kategorisering');
        throw new Error('Process cancelled by user');
      }

      const firstEvent = eventGroup[0];
      
      // 1. AI-kategorisering (endast för första eventet i gruppen)
      let categorizationResult: { categories: string[], scores: Record<string, number> };
      
      if (this.categoryCache.has(normalizedName)) {
        categorizationResult = this.categoryCache.get(normalizedName)!;
        console.log(`  💾 Cached categories for "${firstEvent.name}": ${categorizationResult.categories.join(', ')} (${eventGroup.length} occasions)`);
      } else {
        // Kontrollera avbrytning innan AI-anrop
        if (await this.checkCancellation()) {
          console.log('🛑 Process avbruten - stoppar AI-kategorisering');
          throw new Error('Process cancelled by user');
        }

        categorizationResult = await aiCategorizer.categorize(
          firstEvent.name,
          firstEvent.description || '',
          firstEvent.venue_name || firstEvent.location
        );
        this.categoryCache.set(normalizedName, categorizationResult);
        console.log(`  🤖 AI categorized "${firstEvent.name}": ${categorizationResult.categories.join(', ')} (${eventGroup.length} occasions)`);
        
        // Rate limiting endast vid nya AI-anrop - ökat till 2s för att undvika OpenAI rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // 2. Kvalitetsbedömning och processing för alla events i gruppen
      for (const event of eventGroup) {
        const quality = await eventQualityChecker.assessQuality(
          {
            name: event.name,
            description: event.description,
            date_time: event.date_time,
            venue_name: event.venue_name,
            image_url: event.image_url,
            categories: categorizationResult.categories
          },
          organizerId,
          source, // Skicka med källa för att skippa moderation för betrodda källor
          organizerStatus // Skicka med organizer status för att sätta draft om pending
        );
        
        // Logga endast första och sista i gruppen för att minska spam
        const isFirst = eventGroup.indexOf(event) === 0;
        const isLast = eventGroup.indexOf(event) === eventGroup.length - 1;
        
        if (isFirst || (eventGroup.length === 1)) {
          const statusEmoji = quality.autoPublished ? '✅' : 
                             quality.status === 'pending_approval' ? '⏳' : '📝';
          console.log(`  ${statusEmoji} ${event.name.substring(0, 50)}... [${new Date(event.date_time).toLocaleDateString('sv-SE')}]`);
          console.log(`     Kategorier: ${categorizationResult.categories.join(', ')} | Status: ${quality.status} | Score: ${quality.score}/100`);
          if (quality.issues.length > 0) {
            console.log(`     Problem: ${quality.issues.join(', ')}`);
          }
          if (eventGroup.length > 1) {
            console.log(`     ... och ${eventGroup.length - 1} fler occasion(s) med samma kategorier`);
          }
        }
        
        processed.push({
          ...event,
          categories: categorizationResult.categories as any[],
          category_scores: categorizationResult.scores,
          status: quality.status,
          quality_score: quality.score,
          quality_issues: quality.issues.join('; '),
          auto_published: quality.autoPublished
        });
      }
    }
    
    return processed;
  }

  /**
   * Matcha events till rätt arrangör baserat på metadata
   */
  private async matchOrganizers(
    events: ScrapedEvent[],
    defaultOrganizerId: number,
    source: string
  ): Promise<Array<{ event: ScrapedEvent; organizerId: number }>> {
    const results: Array<{ event: ScrapedEvent; organizerId: number }> = [];

    // Om det inte är Visit Varberg eller liknande plattform, använd bara default
    const isPlatformSource = source.toLowerCase().includes('visit');

    if (!isPlatformSource) {
      // Alla events får samma organizer (t.ex. Arena Varberg, Varbergs Teater)
      return events.map(event => ({ event, organizerId: defaultOrganizerId }));
    }

    // För plattformar (Visit Varberg): försök matcha varje event
    console.log(`🔍 Visit Varberg-plattform detekterad - matchar ${events.length} events till rätt arrangörer...`);

    for (const event of events) {
      if (event.metadata) {
        const match = await organizerMatcher.matchOrganizer(event.metadata, defaultOrganizerId);

        // Logga endast om det INTE är default match
        if (match.matchType !== 'default') {
          organizerMatcher.logMatch(match, event.name, event.metadata);
        }

        results.push({
          event,
          organizerId: match.organizerId
        });
      } else {
        // Ingen metadata, använd default
        results.push({
          event,
          organizerId: defaultOrganizerId
        });
      }
    }

    return results;
  }

  /**
   * Intern deduplicering (inom samma scrape-session)
   */
  private async deduplicateInternally(events: ScrapedEvent[]): Promise<ScrapedEvent[]> {
    const seen = new Map<string, ScrapedEvent>();

    for (const event of events) {
      const key = this.generateDedupeKey(event);
      if (!seen.has(key)) {
        seen.set(key, event);
      } else {
        console.log(`  ⊘ Intern dublett: ${event.name}`);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Enhanced duplicate check mot databas med URL + Fuzzy matching
   */
  private async checkDatabaseDuplicates(events: ScrapedEvent[]): Promise<ScrapedEvent[]> {
    const uniqueEvents: ScrapedEvent[] = [];
    
    for (const event of events) {
      const isDuplicate = await this.checkDuplicateEnhanced(event);
      
      if (!isDuplicate) {
        uniqueEvents.push(event);
      }
    }
    
    return uniqueEvents;
  }

  /**
   * Enhanced duplicate detection using URL + Fuzzy matching
   */
  private async checkDuplicateEnhanced(event: ScrapedEvent): Promise<boolean> {
    // METHOD 1: URL-based check (100% accuracy)
    if (event.organizer_event_url) {
      const { data: urlMatch } = await this.supabase
        .from('events')
        .select('id, name, organizer_event_url')
        .eq('organizer_event_url', event.organizer_event_url)
        .single();

      if (urlMatch) {
        this.logDuplicate(event, urlMatch, 1.0, 'url');
        console.log(`  ⊘ URL duplicate: ${event.organizer_event_url}`);
        return true;
      }
    }

    // METHOD 2: Fuzzy name + date + venue matching
    const eventDate = event.date_time.split('T')[0];
    const venueKeyword = this.extractVenueKeyword(
      event.venue_name || event.location
    );

    if (!venueKeyword) {
      return false; // Kan inte fuzzy matcha utan venue
    }

    // Hämta alla events samma dag på liknande plats
    const { data: similarEvents } = await this.supabase
      .from('events')
      .select('id, name, organizer_event_url, venue_name, date_time')
      .gte('date_time', `${eventDate}T00:00:00Z`)
      .lte('date_time', `${eventDate}T23:59:59Z`)
      .ilike('venue_name', `%${venueKeyword}%`);

    if (!similarEvents || similarEvents.length === 0) {
      return false;
    }

    // Fuzzy matching på namn
    for (const existing of similarEvents) {
      const similarity = stringSimilarity.compareTwoStrings(
        this.normalizeEventName(event.name),
        this.normalizeEventName(existing.name)
      );

      if (similarity >= 0.85) { // 85% threshold
        this.logDuplicate(event, existing, similarity, 'fuzzy_name');
        
        console.log(
          `  ⊘ Fuzzy duplicate (${(similarity * 100).toFixed(0)}% match):\n` +
          `    New: "${event.name}"\n` +
          `    Existing: "${existing.name}"\n` +
          `    Date: ${eventDate} | Venue: ${venueKeyword}`
        );
        
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize event name for comparison
   */
  private normalizeEventName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\såäö]/g, '') // Ta bort specialtecken, behåll svenska bokstäver
      .replace(/\s+/g, ' ') // Normalisera whitespace
      .replace(/\b(med|och|i|på|till|från|live|konsert|show|presenterar)\b/g, '') // Ta bort vanliga ord
      .trim();
  }

  /**
   * Extract venue keyword for matching
   */
  private extractVenueKeyword(venue: string): string {
    if (!venue) return '';
    
    // "Sparbankshallen Varberg" → "Sparbankshallen"
    // "Arena Varberg, Getterövägen 2" → "Arena"
    const cleaned = venue
      .split(/[,\-]/)[0] // Ta första delen före komma/streck
      .trim()
      .split(' ')[0]; // Ta första ordet

    return cleaned;
  }

  /**
   * Generera dedupliceringsnyckel
   */
  private generateDedupeKey(event: ScrapedEvent): string {
    const name = event.name.toLowerCase().trim();
    const date = event.date_time.split('T')[0];
    const venue = (event.venue_name || event.location).toLowerCase().trim();
    
    return `${name}|${date}|${venue}`;
  }

  /**
   * Log duplicate for admin review
   */
  private logDuplicate(
    scrapedEvent: ScrapedEvent,
    existingEvent: any,
    similarity: number,
    matchType: 'url' | 'fuzzy_name'
  ): void {
    this.duplicateLogs.push({
      scraper_name: 'Unknown', // Will be set in saveDuplicateLogs
      scraped_event_name: scrapedEvent.name,
      scraped_event_url: scrapedEvent.organizer_event_url || '',
      existing_event_id: existingEvent.id,
      existing_event_name: existingEvent.name,
      existing_event_url: existingEvent.organizer_event_url || '',
      similarity_score: similarity,
      match_type: matchType,
      scraped_at: new Date().toISOString()
    });
  }

  /**
   * Save duplicate logs to database for admin review
   */
  private async saveDuplicateLogs(scraperName: string): Promise<void> {
    try {
      const logsWithScraper = this.duplicateLogs.map(log => ({
        ...log,
        scraper_name: scraperName
      }));

      const { error } = await this.supabase
        .from('duplicate_event_logs')
        .insert(logsWithScraper);

      if (error) {
        console.error('Failed to save duplicate logs:', error);
      } else {
        console.log(`💾 Saved ${this.duplicateLogs.length} duplicate logs to database`);
      }
    } catch (error) {
      console.error('Error saving duplicate logs:', error);
    }
  }
  
  private async createEvent(
    event: ScrapedEvent,
    source: string,
    organizerId: number
  ) {
    // Generera unikt event_id baserat på eventnamn och källa
    const finalEventId = await generateUniqueEventId(event.name, source, this.supabase);
    
    // Status bestäms nu av kvalitetsbedömningen
    const status = event.status || 'draft';
    
    const eventData = {
      event_id: finalEventId,
      name: event.name,
      description: event.description,
      description_format: 'markdown', // Alla beskrivningar är nu i Markdown-format
      date_time: event.date_time,
      location: event.location,
      venue_name: event.venue_name,
      price: event.price,
      image_url: event.image_url,
      organizer_event_url: event.organizer_event_url,
      event_website: event.event_website, // Arrangörens event-sida (UI)
      booking_url: event.booking_url, // Länk till biljettsida
      categories: event.categories || ['Okategoriserad'],
      category_scores: event.category_scores,
      organizer_id: organizerId,
      status: status,
      quality_score: event.quality_score,
      quality_issues: event.quality_issues,
      auto_published: event.auto_published || false,
      featured: false,
      tags: event.tags || []
    };
    
    const { error } = await this.supabase
      .from('events')
      .insert(eventData);
    
    if (error) {
      console.error('Supabase insert error:', error);
      console.error('Event data:', JSON.stringify(eventData, null, 2));
      throw new Error(`Supabase error: ${error.message} (code: ${error.code})`);
    }
  }
}
