import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export interface ImageClassification {
  heroImage?: string
  galleryImages: string[]
}

export async function classifyImages(images: string[]): Promise<ImageClassification> {
  try {
    console.log(`🖼️ Classifying ${images.length} images...`)

    if (images.length === 0) {
      return { galleryImages: [] }
    }

    // Limit to first 10 images to avoid API limits
    const imagesToAnalyze = images.slice(0, 10)
    const galleryImages: string[] = []
    let heroImage: string | undefined

    // Simple heuristic-based classification first
    for (const imageUrl of imagesToAnalyze) {
      try {
        // Check if image is accessible
        const response = await fetch(imageUrl, { method: 'HEAD' })
        if (!response.ok) continue

        // Basic heuristics for hero image selection
        const isLikelyHero = isLikelyHeroImage(imageUrl)
        
        if (isLikelyHero && !heroImage) {
          heroImage = imageUrl
        } else {
          galleryImages.push(imageUrl)
        }
      } catch (error) {
        console.warn(`⚠️ Could not analyze image ${imageUrl}:`, error)
        continue
      }
    }

    // If no hero image found, use the first available image
    if (!heroImage && galleryImages.length > 0) {
      heroImage = galleryImages.shift()
    }

    console.log(`✅ Image classification complete: 1 hero, ${galleryImages.length} gallery`)

    return {
      heroImage,
      galleryImages
    }

  } catch (error) {
    console.error('❌ Error classifying images:', error)
    // Fallback: use first image as hero, rest as gallery
    return {
      heroImage: images[0],
      galleryImages: images.slice(1)
    }
  }
}

function isLikelyHeroImage(imageUrl: string): boolean {
  const url = imageUrl.toLowerCase()
  
  // Check for common hero image patterns
  const heroPatterns = [
    'hero',
    'banner',
    'header',
    'main',
    'cover',
    'featured',
    'lead',
    'jumbotron'
  ]

  // Check for common gallery patterns (to exclude)
  const galleryPatterns = [
    'gallery',
    'thumb',
    'small',
    'icon',
    'logo',
    'avatar',
    'profile'
  ]

  // Check filename patterns
  const filename = url.split('/').pop() || ''
  
  // Exclude if it looks like a gallery image
  for (const pattern of galleryPatterns) {
    if (filename.includes(pattern)) {
      return false
    }
  }

  // Include if it looks like a hero image
  for (const pattern of heroPatterns) {
    if (url.includes(pattern) || filename.includes(pattern)) {
      return true
    }
  }

  // Check image dimensions if possible (this would require downloading the image)
  // For now, we'll use a simple heuristic based on URL structure
  
  // Prefer images that are not in subdirectories with "gallery" or "thumb"
  const pathParts = url.split('/')
  const hasGalleryInPath = pathParts.some(part => 
    part.includes('gallery') || part.includes('thumb') || part.includes('small')
  )

  if (hasGalleryInPath) {
    return false
  }

  // Default to true for first few images, false for others
  return true
}

// Advanced AI-based image classification (optional, requires more API calls)
export async function classifyImagesWithAI(images: string[]): Promise<ImageClassification> {
  try {
    console.log(`🤖 AI-classifying ${images.length} images...`)

    if (images.length === 0) {
      return { galleryImages: [] }
    }

    // Limit to first 5 images for AI analysis
    const imagesToAnalyze = images.slice(0, 5)
    const galleryImages: string[] = []
    let heroImage: string | undefined

    for (const imageUrl of imagesToAnalyze) {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analysera denna bild och avgör om den skulle fungera bra som en hero-bild (huvudbild) för en arrangörssida. Hero-bilder ska vara breda, professionella och representera arrangörens verksamhet. Svara bara "hero" eller "gallery".'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl
                  }
                }
              ]
            }
          ],
          max_tokens: 10
        })

        const classification = response.choices[0]?.message?.content?.trim().toLowerCase()
        
        if (classification === 'hero' && !heroImage) {
          heroImage = imageUrl
        } else {
          galleryImages.push(imageUrl)
        }

      } catch (error) {
        console.warn(`⚠️ Could not AI-analyze image ${imageUrl}:`, error)
        galleryImages.push(imageUrl)
      }
    }

    // If no hero image found, use the first available image
    if (!heroImage && galleryImages.length > 0) {
      heroImage = galleryImages.shift()
    }

    console.log(`✅ AI image classification complete: 1 hero, ${galleryImages.length} gallery`)

    return {
      heroImage,
      galleryImages
    }

  } catch (error) {
    console.error('❌ Error in AI image classification:', error)
    // Fallback to heuristic classification
    return classifyImages(images)
  }
}
