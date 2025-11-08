import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export interface AIGeneratedContent {
  description: string
  seo_title: string
  seo_description: string
  tags: string[]
  slug: string
}

export async function generateOrganizerContent(
  title: string,
  metaDescription: string,
  content: string,
  contactInfo: any,
  socialLinks: any
): Promise<AIGeneratedContent> {
  try {
    console.log('🤖 Generating AI content...')

    const prompt = `
Du är en expert på SEO och marknadsföring för lokala arrangörer i Varberg, Sverige. 

Baserat på följande information från en arrangörs webbplats, generera innehåll för en SEO-optimerad arrangörssida:

TITEL: ${title}
META BESKRIVNING: ${metaDescription}
INNEHÅLL: ${content.substring(0, 2000)}...
KONTAKTINFO: ${JSON.stringify(contactInfo)}
SOCIALA MEDIER: ${JSON.stringify(socialLinks)}

VIKTIGT: Använd endast den rena, inspirerande texten från INNEHÅLL. Ignorera navigation, kontaktuppgifter, priser, öppettider och tekniska detaljer. Fokusera på det som beskriver arrangörens unika erbjudande och atmosfär.

Generera följande på svenska:

1. BESKRIVNING (2-3 meningar): Skriv en inspirerande, professionell beskrivning som lockar besökare. Fokusera på deras unika erbjudande, atmosfär och vad som gör dem speciella. Använd känslosam språk som skapar lust att besöka dem. Undvik kontaktuppgifter, priser, öppettider och tekniska detaljer.

2. SEO-TITEL (max 60 tecken): En SEO-optimerad titel som inkluderar relevanta nyckelord för Varberg och evenemang.

3. SEO-BESKRIVNING (max 160 tecken): En SEO-optimerad beskrivning som lockar besökare och inkluderar relevanta nyckelord.

4. NYCKELORD (3-5 st): Relevanta nyckelord separerade med komma, fokus på Varberg, evenemang, kultur, etc.

5. SLUG (URL-vänlig): Använd ENDAST arrangörens namn som slug. T.ex. "Strömma Farmlodge" blir "stromma-farmlodge". Kort och enkelt.

Svara ENDAST med giltig JSON i följande format (ingen markdown, ingen extra text):
{
  "description": "Beskrivning här...",
  "seo_title": "SEO-titel här...",
  "seo_description": "SEO-beskrivning här...",
  "tags": ["nyckelord1", "nyckelord2", "nyckelord3"],
  "slug": "url-slug-har"
}
`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Du är en expert på SEO och lokal marknadsföring i Sverige. Svara ALLTID med endast giltig JSON, ingen markdown, ingen extra text, inga förklaringar.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    })

    const aiResponse = response.choices[0]?.message?.content
    if (!aiResponse) {
      throw new Error('No response from OpenAI')
    }

    // Parse JSON response (handle markdown code blocks)
    let aiData: AIGeneratedContent
    try {
      // Remove markdown code blocks if present
      let cleanResponse = aiResponse.trim()
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
      }
      
      aiData = JSON.parse(cleanResponse)
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', aiResponse)
      console.error('❌ Parse error:', parseError)
      throw new Error('Invalid JSON response from AI')
    }

    // Validate required fields
    if (!aiData.description || !aiData.seo_title || !aiData.slug) {
      throw new Error('AI response missing required fields')
    }

    // Ensure slug is URL-friendly and simple
    aiData.slug = aiData.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    
    // If slug is too long or complex, create a simple one from the title
    if (aiData.slug.length > 30 || aiData.slug.split('-').length > 4) {
      const simpleSlug = crawledData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 30)
      
      if (simpleSlug.length > 2) {
        aiData.slug = simpleSlug
      }
    }

    console.log('✅ AI content generated successfully')

    return aiData

  } catch (error) {
    console.error('❌ Error generating AI content:', error)
    throw new Error(`Failed to generate AI content: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
