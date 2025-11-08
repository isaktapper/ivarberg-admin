import * as cheerio from 'cheerio'

export interface CrawledData {
  title: string
  metaDescription: string
  content: string
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
}

export async function extractMetadataAndContent(url: string): Promise<CrawledData> {
  try {
    console.log(`🔍 Crawling URL: ${url}`)
    
    // Fetch the webpage
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Extract title - try to find the actual organizer name
    let title = ''
    
    // Look for company name in specific patterns
    const companyPatterns = [
      // Look for "AB", "AB" patterns
      () => {
        const abMatch = $('body').text().match(/([A-Za-zåäöÅÄÖ\s]+)\s+AB\b/)
        return abMatch ? abMatch[1].trim() : null
      },
      // Look for text that appears multiple times (likely company name)
      () => {
        const text = $('body').text()
        const words = text.match(/\b[A-Z][a-zåäö]+(?:\s+[A-Z][a-zåäö]+)*\b/g) || []
        const wordCounts = {}
        words.forEach(word => {
          if (word.length > 3 && word.length < 50) {
            wordCounts[word] = (wordCounts[word] || 0) + 1
          }
        })
        const mostCommon = Object.entries(wordCounts)
          .sort(([,a], [,b]) => b - a)
          .find(([word, count]) => count > 1 && word.length > 5)
        return mostCommon ? mostCommon[0] : null
      }
    ]
    
    // Try patterns first
    for (const pattern of companyPatterns) {
      const result = pattern()
      if (result && result.length > 3 && result.length < 50) {
        title = result
        break
      }
    }
    
    // Fallback to specific selectors
    if (!title) {
      const titleSelectors = [
        'h1',
        '.logo',
        '.brand',
        '.company-name',
        '.site-title',
        '[class*="logo"]',
        '[class*="brand"]',
        '[class*="title"]'
      ]
      
      for (const selector of titleSelectors) {
        const element = $(selector).first()
        if (element.length > 0) {
          const text = element.text().trim()
          if (text && text.length > 2 && text.length < 100 && !text.toLowerCase().includes('hem')) {
            title = text
            break
          }
        }
      }
    }
    
    // Final fallback
    if (!title) {
      title = $('title').text().trim() || 'Untitled'
    }

    // Extract meta description
    const metaDescription = $('meta[name="description"]').attr('content') || 
                           $('meta[property="og:description"]').attr('content') || 
                           ''

    // Extract main content (prioritize main content areas)
    let content = ''
    
    // Remove unwanted elements first
    $('script, style, nav, header, footer, aside, .menu, .navigation, .contact, .footer, .sidebar, .advertisement, .ads, .breadcrumb, .social, .copyright').remove()
    
    // Try to find main content areas
    const contentSelectors = [
      'main',
      '[role="main"]',
      '.main-content',
      '.content',
      '.page-content',
      'article',
      '.post-content',
      '.entry-content',
      '.hero',
      '.intro',
      '.about'
    ]

    for (const selector of contentSelectors) {
      const element = $(selector).first()
      if (element.length > 0) {
        // Remove more unwanted elements from content
        element.find('.contact, .phone, .email, .address, .menu, .nav, .social, .copyright, .button, .btn, .link, .booking, .boka').remove()
        
        // Get text content
        let text = element.text().trim()
        
        // Clean up the text
        text = text
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .replace(/\n\s*\n/g, '\n') // Replace multiple newlines with single newline
          .replace(/\b(Boka|boka|BOKA)\s+\w+/g, '') // Remove "Boka plats" etc
          .replace(/\b\d{2,3}-\d{2,3}\s*\d{2,3}\b/g, '') // Remove phone numbers
          .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '') // Remove emails
          .replace(/\b\d{3}\s*\d{2}\s*\d{2}\b/g, '') // Remove postal codes
          .replace(/\b©\s*\d{4}.*$/gm, '') // Remove copyright
          .replace(/\b(Öppet|öppet|ÖPPET)\s+\d{2}:\d{2}-\d{2}:\d{2}\b/g, '') // Remove opening hours
          .replace(/\b\d{1,2}-\d{1,2}\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\b/gi, '') // Remove dates
          .trim()
        
        if (text.length > 200) { // Only use if substantial content
          content = text
          break
        }
      }
    }

    // Fallback to body if no main content found
    if (!content || content.length < 200) {
      // Remove more unwanted elements
      $('.contact-info, .phone, .email, .address, .copyright, .social, .menu, .nav, .breadcrumb, .button, .btn').remove()
      
      let text = $('body').text().trim()
      
      // Clean up the text
      text = text
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .replace(/\b(Boka|boka|BOKA)\s+\w+/g, '')
        .replace(/\b\d{2,3}-\d{2,3}\s*\d{2,3}\b/g, '')
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '')
        .replace(/\b\d{3}\s*\d{2}\s*\d{2}\b/g, '')
        .replace(/\b©\s*\d{4}.*$/gm, '')
        .replace(/\b(Öppet|öppet|ÖPPET)\s+\d{2}:\d{2}-\d{2}:\d{2}\b/g, '')
        .replace(/\b\d{1,2}-\d{1,2}\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\b/gi, '')
        .trim()
      
      content = text
    }

    // Clean up content
    content = content
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n') // Replace multiple newlines with single newline
      .trim()

    // Extract images
    const images: string[] = []
    $('img').each((_, img) => {
      const src = $(img).attr('src')
      if (src) {
        // Convert relative URLs to absolute
        const absoluteUrl = src.startsWith('http') ? src : new URL(src, url).href
        images.push(absoluteUrl)
      }
    })

    // Extract contact information
    const contactInfo = extractContactInfo($, url)
    
    // Extract social links
    const socialLinks = extractSocialLinks($, url)

    console.log(`✅ Successfully crawled: ${title}`)

    return {
      title,
      metaDescription,
      content,
      images,
      contactInfo,
      socialLinks
    }

  } catch (error) {
    console.error('❌ Error crawling URL:', error)
    throw new Error(`Failed to crawl URL: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function extractContactInfo($: cheerio.CheerioAPI, baseUrl: string) {
  const contactInfo: CrawledData['contactInfo'] = {}
  
  // Extract email
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const emailMatches = $('body').text().match(emailRegex)
  if (emailMatches && emailMatches.length > 0) {
    contactInfo.email = emailMatches[0]
  }

  // Extract phone numbers (Swedish format)
  const phoneRegex = /(\+46|0)[\s-]?[0-9]{2,3}[\s-]?[0-9]{2,3}[\s-]?[0-9]{2,3}[\s-]?[0-9]{2,3}/g
  const phoneMatches = $('body').text().match(phoneRegex)
  if (phoneMatches && phoneMatches.length > 0) {
    contactInfo.phone = phoneMatches[0]
  }

  // Extract website (look for links)
  $('a[href]').each((_, link) => {
    const href = $(link).attr('href')
    if (href && href.startsWith('http') && !href.includes(baseUrl)) {
      contactInfo.website = href
    }
  })

  // Extract address (look for common address patterns)
  const addressRegex = /[A-Za-zåäöÅÄÖ\s]+ \d+[A-Za-z]?[\s,]*\d{3}\s*\d{2}\s*[A-Za-zåäöÅÄÖ\s]+/g
  const addressMatches = $('body').text().match(addressRegex)
  if (addressMatches && addressMatches.length > 0) {
    contactInfo.address = addressMatches[0].trim()
  }

  return contactInfo
}

function extractSocialLinks($: cheerio.CheerioAPI, baseUrl: string) {
  const socialLinks: CrawledData['socialLinks'] = {}
  
  $('a[href]').each((_, link) => {
    const href = $(link).attr('href')
    if (!href) return

    // Facebook
    if (href.includes('facebook.com') || href.includes('fb.com')) {
      socialLinks.facebook = href
    }
    
    // Instagram
    if (href.includes('instagram.com')) {
      socialLinks.instagram = href
    }
    
    // Twitter/X
    if (href.includes('twitter.com') || href.includes('x.com')) {
      socialLinks.twitter = href
    }
    
    // LinkedIn
    if (href.includes('linkedin.com')) {
      socialLinks.linkedin = href
    }
    
    // YouTube
    if (href.includes('youtube.com') || href.includes('youtu.be')) {
      socialLinks.youtube = href
    }
  })

  return socialLinks
}
