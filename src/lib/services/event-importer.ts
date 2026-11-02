import { createClient } from '@supabase/supabase-js';
import { ScrapedEvent, ScraperResult } from '../scrapers/types';
import { generateUniqueEventId } from '../event-id-generator';
import { aiCategorizer } from './aiCategorizer';
import { resolveArea } from './areaResolver';
import { resolveIsFree } from './priceResolver';
import { eventQualityChecker } from './eventQualityChecker';
import { organizerMatcher } from './organizerMatcher';
import { progressLogger } from './progressLogger';
import { DuplicateDetector, type PoolEvent } from './dedup/detector';
import { sourceHost } from './dedup/matcher';
import { checkImageUrl, ImageCheckResult } from './imageValidator';

export class EventImporter {
  private supabase;
  private categoryCache: Map<string, { categories: string[], scores: Record<string, number> }> = new Map(); // Cache för AI-kategorisering
  private logId?: number; // För progress logging
  private isCancelled: boolean = false; // För avbrytning
  private imageChecks: Map<string, Promise<ImageCheckResult>> = new Map(); // HEAD-cache per bild-URL

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
    logId?: number, // Optional: scraper_logs ID för progress tracking
    options: { skipDedup?: boolean } = {} // skipDedup: återställning av ångrad dublett
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

    console.log(`\n📦 Importerar ${events.length} events...`);

    // Progress: Hittade events
    if (this.logId) {
      await progressLogger.logEventsFound(this.logId, events.length);
      progressLogger.initTimeEstimator(this.logId, events.length);
    }

    // 1. Deduplicate internt först (samma scrape-session, exakt samma namn/tid/plats)
    if (this.logId) {
      await progressLogger.log({
        logId: this.logId,
        step: 'deduplicating',
        message: 'Rensar interna dubletter...',
      });
    }
    const internallyUnique = await this.deduplicateInternally(events);
    console.log(`✓ Efter intern deduplicering: ${internallyUnique.length} unika events`);

    // 1b. Kända events: uppdatera image_url om källan bytt bild (de hoppas annars
    // över som dubbletter och behåller en adress som kan ha slutat fungera)
    await this.refreshKnownEventImages(internallyUnique);

    // 2. Dubblettkontroll mot databasen och inom körningen (URL → regler → AI)
    if (this.logId) {
      await progressLogger.log({
        logId: this.logId,
        step: 'deduplicating',
        message: 'Kontrollerar mot databas...',
        progressCurrent: 0,
        progressTotal: internallyUnique.length,
      });
    }
    const dedup = options.skipDedup
      ? { uniqueEvents: internallyUnique, detector: null, logs: [] }
      : await this.checkDuplicates(internallyUnique, source, organizerId);
    const uniqueEvents = dedup.uniqueEvents;
    console.log(`✓ Efter databas-deduplicering: ${uniqueEvents.length} nya events`);
    await this.dropDeadImages(uniqueEvents);
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
    const insertedIds = new Map<string, number>();
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
        const id = await this.createEvent(eventData.event, source, eventData.organizerId);
        insertedIds.set(eventKey(eventData.event), id);
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

    // Spara dubblettbeslut (mål som importerades i samma körning har fått id först nu)
    if (dedup.detector) {
      const rows = dedup.logs
        .map(({ target, log }) => ({ ...log, existing_event_id: target.id ?? insertedIds.get(eventKey(target)) }))
        .filter((row) => row.existing_event_id !== undefined);
      await dedup.detector.saveLogs(rows);
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
  
  private isImageDead(url: string): Promise<boolean> {
    if (!this.imageChecks.has(url)) this.imageChecks.set(url, checkImageUrl(url));
    return this.imageChecks.get(url)!.then(r => r.status === 'dead');
  }

  /** Nya events: spara inte en bild-URL som redan är död (kvalitetskollen flaggar då saknad bild) */
  private async dropDeadImages(events: ScrapedEvent[]): Promise<void> {
    for (const event of events) {
      if (event.image_url && (await this.isImageDead(event.image_url))) {
        console.log(`  🖼️ Död bild ignoreras för "${event.name}": ${event.image_url}`);
        event.image_url = undefined;
      }
    }
  }

  /**
   * Uppdaterar image_url på kommande events som redan finns (matchas på
   * organizer_event_url) när scrapern hittat en annan bild.
   *
   * Bakgrund: varberg.se byter bildadresser och redaktörer byter bilder, men
   * kända events hoppades tidigare över helt vid import - den sparade adressen
   * blev kvar tills den gav 404 på sajten.
   *
   * Byter bara när den nya bilden fungerar, och bara om den gamla saknas, ligger
   * på samma värd som den nya (källans egen bild) eller är död - en bild som
   * lagts in manuellt från annat håll lämnas orörd.
   */
  private async refreshKnownEventImages(events: ScrapedEvent[]): Promise<void> {
    const imageByUrl = new Map<string, string>();
    for (const event of events) {
      if (event.organizer_event_url && event.image_url && !imageByUrl.has(event.organizer_event_url)) {
        imageByUrl.set(event.organizer_event_url, event.image_url);
      }
    }
    if (imageByUrl.size === 0) return;

    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
    const urls = [...imageByUrl.keys()];
    let updated = 0;

    for (let i = 0; i < urls.length; i += 100) {
      const { data, error } = await this.supabase
        .from('events')
        .select('id, name, image_url, organizer_event_url')
        .in('organizer_event_url', urls.slice(i, i + 100))
        .gte('date_time', `${today}T00:00:00`);

      if (error) {
        console.warn(`  ⚠️ Kunde inte läsa befintliga bilder: ${error.message}`);
        return;
      }

      for (const existing of data ?? []) {
        const newImage = imageByUrl.get(existing.organizer_event_url);
        if (!newImage || existing.image_url === newImage) continue;

        const sameHost = existing.image_url && sourceHost(existing.image_url) === sourceHost(newImage);
        const replaceable = !existing.image_url || sameHost || (await this.isImageDead(existing.image_url));
        if (!replaceable || (await this.isImageDead(newImage))) continue;

        const { error: updateError } = await this.supabase
          .from('events')
          .update({ image_url: newImage })
          .eq('id', existing.id);

        if (updateError) {
          console.warn(`  ⚠️ Kunde inte uppdatera bild för event ${existing.id}: ${updateError.message}`);
        } else {
          updated++;
          console.log(`  🖼️ Ny bild för event ${existing.id} "${existing.name}": ${newImage}`);
        }
      }
    }

    if (updated > 0) console.log(`✓ Uppdaterade bild på ${updated} befintliga events`);
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
        const match = await organizerMatcher.matchOrganizer(event.metadata, defaultOrganizerId, source);

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
   * Generisk dubblettkontroll (se dedup/detector.ts). Dubletter importeras
   * inte; deras URL och saknade fält förs över till det befintliga eventet.
   */
  private async checkDuplicates(events: ScrapedEvent[], source: string, organizerId: number) {
    const detector = new DuplicateDetector(this.supabase);
    const logs: Array<{ target: PoolEvent; log: Record<string, unknown> }> = [];
    if (events.length === 0) return { uniqueEvents: events, detector, logs };

    const dates = events.map((e) => e.date_time.slice(0, 10)).sort();
    await detector.init({ from: dates[0], to: dates[dates.length - 1] });
    await detector.prepareVenues(events);

    const uniqueEvents: ScrapedEvent[] = [];
    for (const event of events) {
      const dup = await detector.findDuplicate(event);
      if (!dup) {
        detector.registerPending(event);
        uniqueEvents.push(event);
        continue;
      }
      const absorbed = await detector.absorbScraped(event, dup, source, organizerId);
      if (absorbed) logs.push(absorbed);
    }
    return { uniqueEvents, detector, logs };
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

  private async createEvent(
    event: ScrapedEvent,
    source: string,
    organizerId: number
  ): Promise<number> {
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
      area: event.area ?? resolveArea(event.location, event.venue_name),
      price: event.price,
      // Scrapers med pålitlig källa (Visit Varbergs isFree-flagga) sätter is_free
      // själva; övriga härleds konservativt från prissträngen (null = okänt)
      is_free: event.is_free !== undefined ? event.is_free : resolveIsFree(event.price),
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
      tags: event.tags || [],
      // Bara när dubblettkontrollen fyllt i den - kolumnen kräver ADD_GENERIC_DEDUP.sql
      ...(event.alternate_urls?.length ? { alternate_urls: event.alternate_urls } : {})
    };
    
    const { data, error } = await this.supabase
      .from('events')
      .insert(eventData)
      .select('id')
      .single();
    
    if (error) {
      console.error('Supabase insert error:', error);
      console.error('Event data:', JSON.stringify(eventData, null, 2));
      throw new Error(`Supabase error: ${error.message} (code: ${error.code})`);
    }
    return data.id;
  }
}

/** Stabil nyckel för ett event genom kopiering mellan importstegen */
function eventKey(e: { name: string; date_time: string; organizer_event_url?: string | null }): string {
  return `${e.name}|${e.date_time}|${e.organizer_event_url ?? ''}`;
}
