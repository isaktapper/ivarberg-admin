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

VIKTIGT KONTEXT: 
- Du skriver innehåll för ivarberg.se, en samlingssida för ALLA evenemang i Varberg
- Vi skriver OM arrangörer i tredje person, inte SOM arrangören själva
- Undvik "vi", "vår", "välkommen till oss", "hos oss", "Arrangören" - skriv istället objektivt OM arrangören
- Använd ALLTID arrangörens faktiska namn: "${title}"
- Använd fraser som: "${title} erbjuder", "${title} är känd för", "Besökare kan uppleva", "${title} presenterar"

Baserat på följande information från en arrangörs webbplats, skapa innehåll för en arrangörssida på ivarberg.se:

# Arrangörens namn: ${title}

# Webbplatsinnehåll (Markdown):
${contentToAnalyze.substring(0, 3000)}...

# Metadata:
Beskrivning: ${metaDescription}
${contactInfo?.email || contactInfo?.phone ? `Kontakt: ${JSON.stringify(contactInfo)}` : ''}

Skapa följande i JSON-format:

{
  "title": "Kort, engagerande titel i tredje person (max 60 tecken). Ex: '${title} - Kulturupplevelser i Varberg'",
  "description": "Objektiv beskrivning om arrangören som hjälper besökare förstå vad de erbjuder. 2-3 meningar. Skriv OM arrangören, inte SOM arrangören. Använd '${title}' istället för 'Arrangören'. Ex: '${title} är en etablerad kulturinstitution som erbjuder...'",
  "content": "Längre, informativt innehåll i markdown-format (3-5 paragrafer) skrivet i tredje person. Inkludera:\n- Vad ${title} erbjuder och vilka typer av evenemang de arrangerar\n- Historia och bakgrund (om relevant)\n- Vad som gör dem unika\n- Praktisk information för besökare\n- Använd ALLTID '${title}' istället för 'vi/vår/Arrangören'. Ex: '${title} arrangerar...' istället för 'Vi arrangerar...' eller 'Arrangören arrangerar...'",
  "seo_title": "SEO-optimerad titel (max 60 tecken). Format: '${title} - Evenemang i Varberg' eller liknande",
  "seo_description": "SEO-beskrivning i tredje person (max 160 tecken). Ex: 'Upptäck kommande evenemang från ${title} på ivarberg.se. Se datum, biljetter och mer information.'",
  "seo_keywords": "5-7 relevanta nyckelord, kommaseparerade. Inkludera ${title}, Varberg, evenemang, och bransch-specifika termer",
  "slug": "url-vanlig-slug-fran-namnet"
}

EXEMPEL PÅ BRA TON (använd arrangörens namn):
✅ "${title} erbjuder ett varierat program..."
✅ "Besökare kan förvänta sig högkvalitativa föreställningar från ${title}..."
✅ "${title} är känd för sina innovativa produktioner..."

EXEMPEL PÅ DÅLIG TON (undvik dessa):
❌ "Välkommen till vår teater..."
❌ "Vi erbjuder ett varierat program..."
❌ "Hos oss kan du uppleva..."
❌ "Arrangören erbjuder..." (använd arrangörens namn istället)

Skriv på svenska. Var professionell, objektiv och informativ. Fokusera på SEO-värde och användarnytta.
`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Du är en expert på SEO och lokal marknadsföring i Sverige. Du skriver innehåll för ivarberg.se, en samlingssida för evenemang. Skriv ALLTID i tredje person om arrangörer, aldrig i första person. Undvik "vi/vår/oss" och generiska termer som "Arrangören". Använd arrangörens faktiska namn. Svara med endast giltig JSON, ingen markdown, ingen extra text, inga förklaringar.'
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
