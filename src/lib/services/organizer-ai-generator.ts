import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export interface AIGeneratedContent {
  title: string
  description: string
  content: string
  seo_title: string
  seo_description: string
  seo_keywords: string
  slug: string
}

export async function generateOrganizerContent(
  title: string,
  metaDescription: string,
  content: string,
  markdown: string | undefined,
  contactInfo: any,
  socialLinks: any
): Promise<AIGeneratedContent> {
  try {
    console.log('🤖 Generating AI content...')

    // Use markdown if available (cleaner), otherwise use content
    const contentToAnalyze = markdown || content

    const prompt = `
Du är en expert på att skriva SEO-optimerat innehåll för evenemangssidor i Varberg, Sverige.

Baserat på följande information från en arrangörs webbplats, skapa innehåll för en arrangörssida:

# Webbplatsinnehåll (Markdown):
${contentToAnalyze.substring(0, 3000)}...

# Metadata:
Titel: ${title}
Beskrivning: ${metaDescription}
${contactInfo?.email || contactInfo?.phone ? `Kontakt: ${JSON.stringify(contactInfo)}` : ''}

Skapa följande i JSON-format:

{
  "title": "Kort, engagerande titel (max 60 tecken)",
  "description": "Inspirerande beskrivning om arrangören som får folk att vilja besöka deras evenemang. 2-3 meningar. Fokusera på vad de erbjuder och varför de är speciella.",
  "content": "Längre, detaljerat innehåll i markdown-format (3-5 paragrafer). Inkludera:\n- Vad arrangören erbjuder\n- Historia/bakgrund (om relevant)\n- Typer av evenemang\n- Unika selling points\n- Varför besökare ska följa dem",
  "seo_title": "SEO-optimerad titel (max 60 tecken, inkludera 'Varberg' om relevant)",
  "seo_description": "SEO-beskrivning (max 160 tecken, inkludera call-to-action)",
  "seo_keywords": "5-7 relevanta nyckelord, kommaseparerade (inkludera 'Varberg', 'evenemang', bransch-specifika termer)",
  "slug": "url-vanlig-slug-fran-namnet"
}

Skriv på svenska. Var professionell men tillgänglig. Fokusera på SEO-värde.
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
      max_tokens: 1500
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
    if (!aiData.title || !aiData.description || !aiData.seo_title || !aiData.slug) {
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
      const simpleSlug = title
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
    console.log(`   - Title: ${aiData.title}`)
    console.log(`   - Description length: ${aiData.description.length} chars`)
    console.log(`   - Content length: ${aiData.content.length} chars`)
    console.log(`   - Slug: ${aiData.slug}`)

    return aiData

  } catch (error) {
    console.error('❌ Error generating AI content:', error)
    throw new Error(`Failed to generate AI content: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
