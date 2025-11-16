import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractMetadataAndContent } from '@/lib/services/organizer-crawler'
import { generateOrganizerContent } from '@/lib/services/organizer-ai-generator'
import { classifyImages } from '@/lib/services/organizer-image-classifier'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const organizerId = parseInt(params.id)
    
    if (isNaN(organizerId)) {
      return NextResponse.json(
        { error: 'Invalid organizer ID' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Hämta organizer-data
    const { data: organizer, error: fetchError } = await supabase
      .from('organizers')
      .select('*')
      .eq('id', organizerId)
      .single()

    if (fetchError) {
      console.error('Error fetching organizer:', fetchError)
      return NextResponse.json(
        { error: 'Organizer not found' },
        { status: 404 }
      )
    }

    // 2. Kontrollera att organizern har en website URL
    if (!organizer.website) {
      return NextResponse.json(
        { error: 'Organizer must have a website URL to create a page. Please add a website to the organizer first.' },
        { status: 400 }
      )
    }

    // 3. Kolla om det redan finns en organizer page för denna organizer
    const { data: existingPage, error: checkError } = await supabase
      .from('organizer_pages')
      .select('id')
      .eq('organizer_id', organizerId)
      .maybeSingle()

    if (checkError) {
      console.error('Error checking existing page:', checkError)
      return NextResponse.json(
        { error: 'Failed to check existing page' },
        { status: 500 }
      )
    }

    if (existingPage) {
      return NextResponse.json(
        { error: 'This organizer already has an organizer page', pageId: existingPage.id },
        { status: 409 }
      )
    }

    console.log(`🚀 Creating organizer page for: ${organizer.name} (${organizer.website})`)

    // 4. Crawl website med Firecrawl
    console.log('📡 Step 1: Crawling website with Firecrawl...')
    const crawledData = await extractMetadataAndContent(organizer.website)

    // 5. Generera AI-innehåll
    console.log('🤖 Step 2: Generating AI content...')
    const aiContent = await generateOrganizerContent(
      crawledData.title,
      crawledData.metaDescription,
      crawledData.content,
      crawledData.markdown,
      crawledData.contactInfo,
      crawledData.socialLinks
    )

    // 6. Klassificera bilder
    console.log('🖼️ Step 3: Classifying images...')
    const imageClassification = await classifyImages(crawledData.images)

    // 7. Kontrollera slug-konflikt
    const { data: existingSlugPage } = await supabase
      .from('organizer_pages')
      .select('id')
      .eq('slug', aiContent.slug)
      .single()

    if (existingSlugPage) {
      // Generera unique slug
      let uniqueSlug = aiContent.slug
      let counter = 1
      while (true) {
        const { data: checkPage } = await supabase
          .from('organizer_pages')
          .select('id')
          .eq('slug', uniqueSlug)
          .single()
        
        if (!checkPage) break
        
        uniqueSlug = `${aiContent.slug}-${counter}`
        counter++
      }
      aiContent.slug = uniqueSlug
    }

    // 8. Skapa organizer page med AI-genererat innehåll
    console.log('💾 Step 4: Saving to database...')
    
    // Använd kontaktinfo från organizers-tabellen, fallback till scrapad data
    const contactInfo = {
      email: organizer.email || crawledData.contactInfo.email || '',
      phone: organizer.phone || crawledData.contactInfo.phone || '',
      website: organizer.website || crawledData.contactInfo.website || '',
      address: organizer.location || crawledData.contactInfo.address || ''
    }
    
    const insertData = {
      organizer_id: organizerId,
      slug: aiContent.slug,
      name: crawledData.title || organizer.name,
      title: aiContent.title,
      description: aiContent.description,
      content: aiContent.content,
      hero_image_url: imageClassification.heroImage,
      gallery_images: imageClassification.galleryImages,
      contact_info: contactInfo,
      social_links: crawledData.socialLinks,
      seo_title: aiContent.seo_title,
      seo_description: aiContent.seo_description,
      seo_keywords: aiContent.seo_keywords,
      is_published: false
    }

    const { data: newPage, error: insertError } = await supabase
      .from('organizer_pages')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating organizer page:', insertError)
      return NextResponse.json(
        { error: 'Failed to create organizer page', details: insertError.message },
        { status: 500 }
      )
    }

    console.log('✅ Organizer page created successfully')

    return NextResponse.json({ 
      success: true, 
      page: newPage,
      metadata: {
        crawledUrl: organizer.website,
        imagesFound: crawledData.images.length,
        heroImageSelected: !!imageClassification.heroImage,
        galleryImagesCount: imageClassification.galleryImages.length
      }
    })

  } catch (error) {
    console.error('❌ Error creating organizer page:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Firecrawl-specifika fel
    if (errorMessage.toLowerCase().includes('rate limit') || errorMessage.includes('429')) {
      return NextResponse.json(
        { 
          error: 'Rate limit reached',
          details: 'Firecrawl API rate limit reached. Try again in a few minutes.',
          type: 'rate_limit'
        },
        { status: 429 }
      )
    }
    
    if (errorMessage.toLowerCase().includes('api key') || errorMessage.includes('401')) {
      return NextResponse.json(
        { 
          error: 'API authentication failed',
          details: 'Firecrawl API key is missing or invalid.',
          type: 'auth_error'
        },
        { status: 401 }
      )
    }
    
    if (errorMessage.includes('Failed to scrape')) {
      return NextResponse.json(
        { 
          error: 'Failed to scrape website',
          details: 'Could not extract content from the website.',
          type: 'scrape_error'
        },
        { status: 422 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to create organizer page', details: errorMessage },
      { status: 500 }
    )
  }
}

