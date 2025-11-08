import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { extractMetadataAndContent } from '@/lib/services/organizer-crawler'
import { generateOrganizerContent } from '@/lib/services/organizer-ai-generator'
import { classifyImages } from '@/lib/services/organizer-image-classifier'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    console.log(`🚀 Starting import for URL: ${url}`)

    // Step 1: Crawl the URL
    console.log('📡 Step 1: Crawling URL...')
    const crawledData = await extractMetadataAndContent(url)

    // Step 2: Generate AI content
    console.log('🤖 Step 2: Generating AI content...')
    const aiContent = await generateOrganizerContent(
      crawledData.title,
      crawledData.metaDescription,
      crawledData.content,
      crawledData.contactInfo,
      crawledData.socialLinks
    )

    // Step 3: Classify images
    console.log('🖼️ Step 3: Classifying images...')
    const imageClassification = await classifyImages(crawledData.images)

    // Step 4: Check if slug already exists
    const { data: existingPage } = await supabase
      .from('organizer_pages')
      .select('id')
      .eq('slug', aiContent.slug)
      .single()

    if (existingPage) {
      // Generate unique slug
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

    // Step 5: Save to Supabase (as draft)
    console.log('💾 Step 5: Saving to database...')
    
    // Prepare the data to insert
    const insertData = {
      slug: aiContent.slug,
      name: crawledData.title,
      title: aiContent.seo_title,
      description: aiContent.description,
      content: crawledData.content,
      hero_image_url: imageClassification.heroImage,
      gallery_images: imageClassification.galleryImages,
      contact_info: crawledData.contactInfo,
      social_links: crawledData.socialLinks,
      seo_title: aiContent.seo_title,
      seo_description: aiContent.seo_description,
      seo_keywords: aiContent.tags.join(', '),
      is_published: false
    }
    
    console.log('📝 Insert data:', JSON.stringify(insertData, null, 2))
    
    const { data: newPage, error: insertError } = await supabase
      .from('organizer_pages')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      console.error('❌ Database error details:', {
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code
      })
      return NextResponse.json(
        { 
          error: 'Failed to save organizer page', 
          details: insertError.message,
          code: insertError.code,
          hint: insertError.hint
        },
        { status: 500 }
      )
    }

    console.log('✅ Import completed successfully')

    // Return the created page with additional metadata
    return NextResponse.json({
      success: true,
      page: newPage,
      metadata: {
        originalUrl: url,
        crawledAt: new Date().toISOString(),
        imagesFound: crawledData.images.length,
        heroImageSelected: !!imageClassification.heroImage,
        galleryImagesCount: imageClassification.galleryImages.length
      }
    })

  } catch (error) {
    console.error('❌ Import error:', error)
    
    return NextResponse.json(
      { 
        error: 'Import failed', 
        details: error instanceof Error ? error.message : 'Unknown error',
        type: 'import_error'
      },
      { status: 500 }
    )
  }
}

// GET endpoint to check import status or get import history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')

    if (!url) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      )
    }

    // Check if a page with this URL already exists
    const { data: existingPage } = await supabase
      .from('organizer_pages')
      .select('*')
      .eq('name', url) // This is a simple check, you might want to store original URL
      .single()

    return NextResponse.json({
      exists: !!existingPage,
      page: existingPage
    })

  } catch (error) {
    console.error('❌ Error checking import status:', error)
    return NextResponse.json(
      { error: 'Failed to check import status' },
      { status: 500 }
    )
  }
}
