/**
 * Script för att rekategorisera alla befintliga events med det nya multi-kategori systemet
 * 
 * Kör med: npx tsx scripts/recategorize-events.ts
 * 
 * Detta script:
 * - Hämtar alla events från databasen
 * - Använder AI för att kategorisera om varje event (1-3 kategorier)
 * - Uppdaterar categories och category_scores i databasen
 * - Visar progress och statistik
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Ladda environment variables FÖRST innan vi importerar något annat
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Nu kan vi importera moduler som använder env variables
import { createClient } from '@supabase/supabase-js';
import { aiCategorizer } from '../src/lib/services/aiCategorizer';

interface Event {
  id: number;
  name: string;
  description?: string;
  venue_name?: string;
  location: string;
  category?: string; // Gamla kategorin
  categories?: string[]; // Nya kategorier
}

interface RecategorizationStats {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{ eventId: number; eventName: string; error: string }>;
}

class EventRecategorizer {
  private supabase;
  private stats: RecategorizationStats = {
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  // Cache för att undvika att kategorisera samma event flera gånger
  private categoryCache = new Map<string, { categories: string[], scores: Record<string, number> }>();

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials in environment variables');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Huvudfunktion - rekategorisera alla events
   */
  async recategorizeAll(options: {
    dryRun?: boolean; // Om true, kör inte uppdateringar
    batchSize?: number; // Antal events per batch
    skipExisting?: boolean; // Skippa events som redan har categories array
  } = {}) {
    const { dryRun = false, batchSize = 50, skipExisting = false } = options;

    console.log('\n🔄 Startar rekategorisering av events...');
    console.log(`📋 Inställningar:`);
    console.log(`   - Dry run: ${dryRun ? 'JA (inga ändringar sparas)' : 'NEJ (uppdaterar databas)'}`);
    console.log(`   - Batch size: ${batchSize}`);
    console.log(`   - Skippa befintliga: ${skipExisting ? 'JA' : 'NEJ'}`);
    console.log('');

    try {
      // Hämta alla events
      let query = this.supabase
        .from('events')
        .select('id, name, description, venue_name, location, category, categories');

      if (skipExisting) {
        query = query.is('categories', null);
      }

      const { data: events, error } = await query.order('id', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch events: ${error.message}`);
      }

      if (!events || events.length === 0) {
        console.log('✅ Inga events att rekategorisera!');
        return;
      }

      this.stats.total = events.length;
      console.log(`📊 Hittade ${this.stats.total} events att rekategorisera\n`);

      // Gruppera events med samma namn för smart kategorisering
      const eventsByName = this.groupEventsByName(events);
      console.log(`📚 ${events.length} events grupperade i ${eventsByName.size} unika eventnamn\n`);

      // Process i batches
      const eventGroups = Array.from(eventsByName.entries());
      for (let i = 0; i < eventGroups.length; i += batchSize) {
        const batch = eventGroups.slice(i, i + batchSize);
        
        console.log(`\n🔄 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(eventGroups.length / batchSize)}`);
        console.log(`   Processing events ${i + 1}-${Math.min(i + batchSize, eventGroups.length)} av ${eventGroups.length} grupper`);
        
        await this.processBatch(batch, dryRun);

        // Progress update
        const progress = ((this.stats.processed / this.stats.total) * 100).toFixed(1);
        console.log(`\n   Progress: ${this.stats.processed}/${this.stats.total} (${progress}%)`);
        console.log(`   ✓ Success: ${this.stats.successful} | ✗ Failed: ${this.stats.failed} | ⊘ Skipped: ${this.stats.skipped}`);
      }

      // Slutrapport
      this.printFinalReport(dryRun);

    } catch (error) {
      console.error('\n❌ Fatal error:', error);
      throw error;
    }
  }

  /**
   * Gruppera events efter namn för smart kategorisering
   */
  private groupEventsByName(events: Event[]): Map<string, Event[]> {
    const groups = new Map<string, Event[]>();

    for (const event of events) {
      const normalizedName = event.name.trim().toLowerCase();
      if (!groups.has(normalizedName)) {
        groups.set(normalizedName, []);
      }
      groups.get(normalizedName)!.push(event);
    }

    return groups;
  }

  /**
   * Process en batch av event-grupper
   */
  private async processBatch(
    batch: Array<[string, Event[]]>,
    dryRun: boolean
  ): Promise<void> {
    for (const [normalizedName, eventGroup] of batch) {
      const firstEvent = eventGroup[0];

      try {
        // AI-kategorisering (endast för första eventet, sen cache)
        let categorizationResult: { categories: string[], scores: Record<string, number> };

        if (this.categoryCache.has(normalizedName)) {
          categorizationResult = this.categoryCache.get(normalizedName)!;
          console.log(`  💾 Cached: "${firstEvent.name}" → ${categorizationResult.categories.join(', ')}`);
        } else {
          console.log(`  🤖 AI kategoriserar: "${firstEvent.name}"...`);
          
          categorizationResult = await aiCategorizer.categorize(
            firstEvent.name,
            firstEvent.description || '',
            firstEvent.venue_name || firstEvent.location
          );

          this.categoryCache.set(normalizedName, categorizationResult);
          
          const scoresStr = Object.entries(categorizationResult.scores)
            .map(([cat, score]) => `${cat}: ${(score * 100).toFixed(0)}%`)
            .join(', ');
          
          console.log(`     → ${categorizationResult.categories.join(', ')} (${scoresStr})`);
          
          // Rate limiting för AI-anrop
          await this.delay(500);
        }

        // Uppdatera alla events i gruppen
        for (const event of eventGroup) {
          if (!dryRun) {
            await this.updateEvent(event.id, categorizationResult);
          }
          this.stats.processed++;
          this.stats.successful++;
        }

        if (eventGroup.length > 1) {
          console.log(`     ✓ Uppdaterade ${eventGroup.length} occasions med samma kategorier`);
        }

      } catch (error) {
        console.error(`  ❌ Failed: "${firstEvent.name}"`);
        console.error(`     Error: ${error instanceof Error ? error.message : String(error)}`);
        
        for (const event of eventGroup) {
          this.stats.processed++;
          this.stats.failed++;
          this.stats.errors.push({
            eventId: event.id,
            eventName: event.name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  /**
   * Uppdatera ett event i databasen
   */
  private async updateEvent(
    eventId: number,
    categorization: { categories: string[], scores: Record<string, number> }
  ): Promise<void> {
    const { error } = await this.supabase
      .from('events')
      .update({
        categories: categorization.categories,
        category_scores: categorization.scores
      })
      .eq('id', eventId);

    if (error) {
      throw new Error(`Database update failed: ${error.message}`);
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Skriv ut slutrapport
   */
  private printFinalReport(dryRun: boolean): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 SLUTRAPPORT');
    console.log('='.repeat(60));
    console.log(`Total events: ${this.stats.total}`);
    console.log(`Processed: ${this.stats.processed}`);
    console.log(`✓ Successful: ${this.stats.successful}`);
    console.log(`✗ Failed: ${this.stats.failed}`);
    console.log(`⊘ Skipped: ${this.stats.skipped}`);
    console.log('');

    if (this.stats.errors.length > 0) {
      console.log('❌ ERRORS:');
      this.stats.errors.slice(0, 10).forEach(err => {
        console.log(`   - Event #${err.eventId} "${err.eventName}": ${err.error}`);
      });
      if (this.stats.errors.length > 10) {
        console.log(`   ... och ${this.stats.errors.length - 10} fler fel`);
      }
      console.log('');
    }

    if (dryRun) {
      console.log('⚠️  DRY RUN - Inga ändringar har sparats till databasen');
    } else {
      console.log('✅ Rekategorisering klar!');
    }
    console.log('='.repeat(60) + '\n');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipExisting = args.includes('--skip-existing');
  const batchSize = parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '50');

  console.log('🚀 Event Recategorization Script');
  console.log('================================\n');

  // Validera environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL not found in environment');
    process.exit(1);
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found in environment');
    process.exit(1);
  }

  const recategorizer = new EventRecategorizer();

  try {
    await recategorizer.recategorizeAll({
      dryRun,
      batchSize,
      skipExisting
    });
  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  }
}

// Kör scriptet
if (require.main === module) {
  main();
}

