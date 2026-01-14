/**
 * Script för att kategorisera alla events som har "Okategoriserad" eller saknar kategorier
 * 
 * Kör med: npx tsx scripts/categorize-uncategorized.ts
 * 
 * Flaggor:
 *   --dry-run     Visar vad som skulle kategoriseras utan att spara
 *   --limit=N     Begränsa antal events att kategorisera
 *   --batch=N     Antal events per batch (default: 10)
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
  categories?: string[];
  status: string;
  quality_issues?: string;
}

interface Stats {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{ eventId: number; eventName: string; error: string }>;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;
  const batchArg = args.find(arg => arg.startsWith('--batch='));
  const batchSize = batchArg ? parseInt(batchArg.split('=')[1]) : 10;

  console.log('🏷️  Kategoriserings-script för okategoriserade events');
  console.log('='.repeat(55));
  console.log(`📋 Inställningar:`);
  console.log(`   - Dry run: ${dryRun ? 'JA (inga ändringar sparas)' : 'NEJ (uppdaterar databas)'}`);
  console.log(`   - Limit: ${limit || 'Ingen (alla)'}`);
  console.log(`   - Batch size: ${batchSize}`);
  console.log('');

  // Validera env
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL saknas');
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY saknas');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY saknas');
    process.exit(1);
  }

  console.log('✅ Environment variabler OK');
  console.log(`   OpenAI API Key: ${process.env.OPENAI_API_KEY?.substring(0, 10)}...`);
  console.log('');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Hämta okategoriserade events
  console.log('🔍 Hämtar okategoriserade events...');
  
  let query = supabase
    .from('events')
    .select('id, name, description, venue_name, location, categories, status, quality_issues')
    .or('categories.is.null,categories.cs.{Okategoriserad}')
    .order('created_at', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data: events, error } = await query;

  if (error) {
    console.error('❌ Fel vid hämtning av events:', error.message);
    process.exit(1);
  }

  if (!events || events.length === 0) {
    console.log('✅ Inga okategoriserade events hittades!');
    process.exit(0);
  }

  // Filtrera för att säkerställa att vi bara har okategoriserade
  const uncategorizedEvents = events.filter(e => 
    !e.categories || 
    e.categories.length === 0 || 
    (e.categories.length === 1 && e.categories[0] === 'Okategoriserad')
  );

  console.log(`📊 Hittade ${uncategorizedEvents.length} okategoriserade events\n`);

  const stats: Stats = {
    total: uncategorizedEvents.length,
    processed: 0,
    successful: 0,
    failed: 0,
    errors: []
  };

  // Process i batches
  for (let i = 0; i < uncategorizedEvents.length; i += batchSize) {
    const batch = uncategorizedEvents.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(uncategorizedEvents.length / batchSize);
    
    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} events)`);
    console.log('-'.repeat(40));

    for (const event of batch) {
      try {
        console.log(`\n🎯 Event #${event.id}: "${event.name.substring(0, 50)}..."`);
        console.log(`   Status: ${event.status} | Nuvarande: ${event.categories?.join(', ') || 'Inga'}`);
        
        // Kör AI-kategorisering
        const result = await aiCategorizer.categorize(
          event.name,
          event.description || '',
          event.venue_name || event.location || 'Varberg'
        );

        console.log(`   → Nya kategorier: ${result.categories.join(', ')}`);
        console.log(`   → Scores: ${Object.entries(result.scores).map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`).join(', ')}`);

        if (!dryRun) {
          // Uppdatera databas
          const updateData: any = {
            categories: result.categories,
            category_scores: result.scores,
            updated_at: new Date().toISOString()
          };

          // Ta bort "Kunde inte kategoriseras" från quality_issues om det finns
          if (event.quality_issues?.includes('Kunde inte kategoriseras automatiskt')) {
            const newIssues = event.quality_issues
              .split(', ')
              .filter(issue => !issue.includes('Kunde inte kategoriseras automatiskt'))
              .join(', ');
            updateData.quality_issues = newIssues || null;
          }

          // Uppgradera status om det var ett draft på grund av kategorisering
          if (event.status === 'draft' && !result.categories.includes('Okategoriserad')) {
            updateData.status = 'pending_approval';
            console.log(`   → Status uppgraderad till: pending_approval`);
          }

          const { error: updateError } = await supabase
            .from('events')
            .update(updateData)
            .eq('id', event.id);

          if (updateError) {
            throw new Error(`Databas-uppdatering misslyckades: ${updateError.message}`);
          }

          console.log(`   ✅ Sparat!`);
        } else {
          console.log(`   ⏭️  [DRY RUN] Skulle sparat`);
        }

        stats.processed++;
        stats.successful++;

        // Rate limiting - vänta mellan requests
        await delay(800);

      } catch (error) {
        console.error(`   ❌ Fel: ${error instanceof Error ? error.message : String(error)}`);
        stats.processed++;
        stats.failed++;
        stats.errors.push({
          eventId: event.id,
          eventName: event.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Progress
    const progress = ((stats.processed / stats.total) * 100).toFixed(1);
    console.log(`\n📈 Progress: ${stats.processed}/${stats.total} (${progress}%)`);
    console.log(`   ✓ Lyckade: ${stats.successful} | ✗ Misslyckade: ${stats.failed}`);
  }

  // Slutrapport
  console.log('\n' + '='.repeat(55));
  console.log('📊 SLUTRAPPORT');
  console.log('='.repeat(55));
  console.log(`Total events: ${stats.total}`);
  console.log(`Bearbetade: ${stats.processed}`);
  console.log(`✓ Lyckade: ${stats.successful}`);
  console.log(`✗ Misslyckade: ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log('\n❌ FEL:');
    stats.errors.slice(0, 10).forEach(err => {
      console.log(`   - Event #${err.eventId} "${err.eventName.substring(0, 30)}...": ${err.error}`);
    });
    if (stats.errors.length > 10) {
      console.log(`   ... och ${stats.errors.length - 10} fler fel`);
    }
  }

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - Inga ändringar sparades');
    console.log('   Kör utan --dry-run för att faktiskt uppdatera databasen');
  } else {
    console.log('\n✅ Kategorisering klar!');
  }
  console.log('='.repeat(55) + '\n');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Kör
main().catch(error => {
  console.error('❌ Script kraschade:', error);
  process.exit(1);
});
