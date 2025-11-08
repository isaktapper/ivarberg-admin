import FirecrawlApp from '@mendable/firecrawl-js'

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY!
})

export interface CrawledData {
  title: string
  metaDescription: string
  content: string
  markdown?: string
  images: string[]
  contactInfo: {
    email?: string
    phone?: string
    website?: string
    address?: string
  }
  socialLinks: {
    facebook?: string
    instagram?: string
    twitter?: string
    linkedin?: string
    youtube?: string
  }
  rawMetadata?: any
}

export async function extractMetadataAndContent(url: string): Promise<CrawledData> {
  try {
    console.log(`🔍 Crawling URL with Firecrawl: ${url}`)
    
    // Check if API key is set
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY is not set in environment variables')
    }
    
    // Use Firecrawl instead of cheerio
    console.log('   - Calling Firecrawl API...')
    const scrapeResult = await firecrawl.scrape(url, {
      formats: ['markdown', 'html'],
      onlyMainContent: true, // Automatically filters out navigation, footer, etc
    }) as any

    console.log('   - Firecrawl response received:', {
      hasMarkdown: !!scrapeResult?.markdown,
      hasHtml: !!scrapeResult?.html,
      hasMetadata: !!scrapeResult?.metadata,
      markdownLength: scrapeResult?.markdown?.length || 0,
      htmlLength: scrapeResult?.html?.length || 0
    })

    // Firecrawl v4+ returns data directly, not wrapped in success field
    if (!scrapeResult || (!scrapeResult.markdown && !scrapeResult.html)) {
      throw new Error('Failed to scrape URL with Firecrawl: No content returned')
    }

    const { markdown, html, metadata } = scrapeResult

    // Extract title - prefer metadata title, then extract from markdown
    const title = metadata?.title || extractTitleFromMarkdown(markdown || '') || 'Untitled'

    // Extract meta description
    const metaDescription = metadata?.description || metadata?.ogDescription || ''

    // Use markdown as content (clean, perfect for AI)
    const content = markdown || ''

    // Extract images - prefer OG image, then extract from HTML
    const images: string[] = []
    if (metadata?.ogImage) {
      images.push(metadata.ogImage)
    }
    
    // Extract additional images from HTML if available
    if (html) {
      const htmlImages = extractImagesFromHtml(html, url)
      images.push(...htmlImages)
    }

    // Extract contact information from markdown
    const contactInfo = {
      email: extractEmail(markdown || ''),
      phone: extractPhone(markdown || ''),
      website: url,
      address: extractAddress(markdown || '')
    }

    // Extract social links from HTML
    const socialLinks = extractSocialLinksFromHtml(html || '')

    console.log(`✅ Successfully crawled with Firecrawl: ${title}`)
    console.log(`   - Content length: ${content.length} chars`)
    console.log(`   - Images found: ${images.length}`)
    console.log(`   - Contact info: ${JSON.stringify(contactInfo)}`)
    console.log(`   - Social links: ${JSON.stringify(socialLinks)}`)

    return {
      title,
      metaDescription,
      content,
      markdown,
      images,
      contactInfo,
      socialLinks,
      rawMetadata: metadata
    }

  } catch (error) {
    console.error('❌ Error crawling URL with Firecrawl:', error)
    
    // Log more details for debugging
    if (error instanceof Error) {
      console.error('   - Error message:', error.message)
      console.error('   - Error stack:', error.stack)
    }
    
    // Check if it's a specific Firecrawl error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    if (errorMessage.includes('FIRECRAWL_API_KEY')) {
      throw new Error('Firecrawl API key is not configured. Please add FIRECRAWL_API_KEY to your environment variables.')
    }
    
    if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
      throw new Error('Firecrawl API authentication failed. Please check your API key.')
    }
    
    if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
      throw new Error('Firecrawl API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(`Failed to crawl URL: ${errorMessage}`)
  }
}

// Helper functions for extracting data from markdown and HTML

function extractTitleFromMarkdown(markdown: string): string | undefined {
  // First H1 as title
  const h1Match = markdown.match(/^#\s+(.+)$/m)
  return h1Match ? h1Match[1].trim() : undefined
}

function extractEmail(markdown: string): string | undefined {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
  const match = markdown.match(emailRegex)
  return match ? match[0] : undefined
}

function extractPhone(markdown: string): string | undefined {
  // Swedish phone numbers
  const phoneRegex = /(\+46|0)[\s-]?[1-9]\d{1,2}[\s-]?\d{5,7}/
  const match = markdown.match(phoneRegex)
  return match ? match[0].replace(/\s/g, '') : undefined
}

function extractAddress(markdown: string): string | undefined {
  // Try to find Swedish addresses (simplified, can be improved)
  const addressRegex = /[A-ZÅÄÖa-zåäö\s]+ \d+[A-Za-z]?[\s,]*\d{3}\s*\d{2}\s*[A-ZÅÄÖa-zåäö\s]+/
  const match = markdown.match(addressRegex)
  return match ? match[0].trim() : undefined
}

function extractImagesFromHtml(html: string, baseUrl: string): string[] {
  const images: string[] = []
  
  // Simple regex to extract image URLs from HTML
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/g
  let match
  
  while ((match = imgRegex.exec(html)) !== null) {
    let imgSrc = match[1]
    
    // Convert relative URLs to absolute
    if (!imgSrc.startsWith('http')) {
      try {
        imgSrc = new URL(imgSrc, baseUrl).href
      } catch {
        // Skip invalid URLs
        continue
      }
    }
    
    images.push(imgSrc)
  }
  
  return images
}

function extractSocialLinksFromHtml(html: string): CrawledData['socialLinks'] {
  const social: CrawledData['socialLinks'] = {}
  
  // Facebook
  const fbMatch = html.match(/https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._-]+/)
  if (fbMatch) social.facebook = fbMatch[0]
  
  // Instagram
  const igMatch = html.match(/https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+/)
  if (igMatch) social.instagram = igMatch[0]
  
  // Twitter/X
  const twitterMatch = html.match(/https?:\/\/(www\.)?(twitter|x)\.com\/[a-zA-Z0-9._-]+/)
  if (twitterMatch) social.twitter = twitterMatch[0]
  
  // LinkedIn
  const linkedinMatch = html.match(/https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9._-]+/)
  if (linkedinMatch) social.linkedin = linkedinMatch[0]
  
  // YouTube
  const youtubeMatch = html.match(/https?:\/\/(www\.)?(youtube\.com\/(channel|c|user)\/[a-zA-Z0-9._-]+|youtu\.be\/[a-zA-Z0-9._-]+)/)
  if (youtubeMatch) social.youtube = youtubeMatch[0]
  
  return Object.keys(social).length > 0 ? social : {}
}
