import { createClient } from '@supabase/supabase-js'
import { extractMetadataAndContent } from '../src/lib/services/organizer-crawler'
import { generateOrganizerContent } from '../src/lib/services/organizer-ai-generator'
import { shutdownAITelemetry } from '../src/lib/services/openai-client'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface RegenerateOptions {
  pageIds: number[]
  dryRun?: boolean
}

async function regeneratePageContent(options: RegenerateOptions) {
  const { pageIds, dryRun = false } = options

  console.log('🔄 Starting page content regeneration...')
  console.log(`📋 Page IDs to process: ${pageIds.join(', ')}`)
  console.log(`🧪 Dry run: ${dryRun ? 'YES' : 'NO'}`)
  console.log('')

  for (const pageId of pageIds) {
    try {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`📄 Processing page ID: ${pageId}`)
      console.log('='.repeat(60))

      // 1. Hämta organizer page
      const { data: page, error: pageError } = await supabase
        .from('organizer_pages')
        .select('*')
        .eq('id', pageId)
        .single()

      if (pageError || !page) {
        console.error(`❌ Could not find page ${pageId}:`, pageError?.message)
        continue
      }

      console.log(`📌 Page: ${page.name} (/${page.slug})`)

      // 2. Kontrollera att page har organizer_id
      if (!page.organizer_id) {
        console.warn(`⚠️  Page ${pageId} has no organizer_id. Skipping.`)
        continue
      }

      // 3. Hämta organizer
      const { data: organizer, error: orgError } = await supabase
        .from('organizers')
        .select('*')
        .eq('id', page.organizer_id)
        .single()

      if (orgError || !organizer) {
        console.error(`❌ Could not find organizer ${page.organizer_id}:`, orgError?.message)
        continue
      }

      console.log(`👤 Organizer: ${organizer.name}`)

      // 4. Kontrollera att organizer har website
      if (!organizer.website) {
        console.warn(`⚠️  Organizer ${organizer.name} has no website. Skipping.`)
        continue
      }

      console.log(`🌐 Website: ${organizer.website}`)

      // 5. Scrapa website
      console.log('\n📡 Step 1: Scraping website with Firecrawl...')
      const crawledData = await extractMetadataAndContent(organizer.website)
      console.log(`✅ Scraped successfully (${crawledData.content.length} chars)`)

      // 6. Generera nytt AI-innehåll
      console.log('\n🤖 Step 2: Generating new AI content...')
      const aiContent = await generateOrganizerContent(
        crawledData.title || organizer.name,
        crawledData.metaDescription,
        crawledData.content,
        crawledData.markdown,
        crawledData.contactInfo,
        crawledData.socialLinks
      )
      console.log('✅ AI content generated successfully')

      // 7. Förbered uppdateringsdata (endast textfält, behåll bilder)
      const updateData = {
        title: aiContent.title,
        description: aiContent.description,
        content: aiContent.content,
        seo_title: aiContent.seo_title,
        seo_description: aiContent.seo_description,
        seo_keywords: aiContent.seo_keywords,
        updated_at: new Date().toISOString()
      }

      console.log('\n📝 Changes to apply:')
      console.log(`  Title: "${page.title}" → "${updateData.title}"`)
      console.log(`  Description: ${page.description?.substring(0, 50)}... → ${updateData.description.substring(0, 50)}...`)
      console.log(`  Content length: ${page.content?.length || 0} chars → ${updateData.content.length} chars`)
      console.log(`  SEO Title: "${page.seo_title}" → "${updateData.seo_title}"`)
      console.log(`  Images: KEEPING EXISTING (${page.hero_image_url ? '1 hero' : 'no hero'}, ${page.gallery_images?.length || 0} gallery)`)

      // 8. Uppdatera i databasen (om inte dry-run)
      if (!dryRun) {
        console.log('\n💾 Updating database...')
        const { error: updateError } = await supabase
          .from('organizer_pages')
          .update(updateData)
          .eq('id', pageId)

        if (updateError) {
          console.error(`❌ Failed to update page ${pageId}:`, updateError.message)
          continue
        }

        console.log('✅ Database updated successfully')
      } else {
        console.log('\n🧪 DRY RUN - No changes made to database')
      }

      console.log(`\n✨ Page ${pageId} processed successfully!`)

    } catch (error) {
      console.error(`\n❌ Error processing page ${pageId}:`, error)
      if (error instanceof Error) {
        console.error(`   Message: ${error.message}`)
      }
      continue
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('🏁 Regeneration complete!')
  console.log('='.repeat(60))
}

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const pageIdsArg = args.find(arg => arg.startsWith('--ids='))

if (!pageIdsArg) {
  console.error('❌ Usage: npm run regenerate-pages -- --ids=14,13,16 [--dry-run]')
  process.exit(1)
}

const pageIds = pageIdsArg
  .replace('--ids=', '')
  .split(',')
  .map(id => parseInt(id.trim()))
  .filter(id => !isNaN(id))

if (pageIds.length === 0) {
  console.error('❌ No valid page IDs provided')
  process.exit(1)
}

// Run the regeneration
regeneratePageContent({ pageIds, dryRun })
  .then(async () => {
    // Flusha AI-telemetri (PostHog) innan processen avslutas
    await shutdownAITelemetry()
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch(async (error) => {
    console.error('\n❌ Script failed:', error)
    await shutdownAITelemetry()
    process.exit(1)
  })

