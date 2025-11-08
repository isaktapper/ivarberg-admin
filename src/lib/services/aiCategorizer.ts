import OpenAI from 'openai';

// Lazy initialization - skapas först när den används
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

const CATEGORIES = [
  'Scen',
  'Nattliv',
  'Sport',
  'Utställningar',
  'Konst',
  'Föreläsningar',
  'Barn & Familj',
  'Mat & Dryck',
  'Jul',
  'Film & bio',
  'Djur & Natur',
  'Guidade visningar',
  'Marknader',
  'Okategoriserad'
] as const;

export interface CategorizationResult {
  categories: string[]; // 1-3 kategorier, sorterade efter relevans
  scores: Record<string, number>; // Confidence score 0.0-1.0 för varje kategori
}

export class AICategorizer {
  
  /**
   * Kategorisera ett event med OpenAI - returnerar 1-3 kategorier med scores
   */
  async categorize(
    title: string,
    description: string,
    venue: string
  ): Promise<CategorizationResult> {
    
    console.log(`  🤖 AI-kategoriserar: ${title.substring(0, 50)}...`);
    
    try {
      const prompt = this.buildPrompt(title, description, venue);
      
      const response = await this.makeCategorizationRequest(prompt);

      const content = response.choices[0].message.content?.trim();
      if (!content) {
        throw new Error('Tomt svar från AI');
      }

      // Parse JSON-svaret
      const result = this.parseCategorizationResponse(content);
      
      console.log(`     → ${result.categories.join(', ')} (${Object.entries(result.scores).map(([cat, score]) => `${cat}: ${(score * 100).toFixed(0)}%`).join(', ')})`);
      return result;
      
    } catch (error) {
      console.error('  ❌ AI-kategorisering misslyckades:', error);
      // Fallback till "Okategoriserad"
      return {
        categories: ['Okategoriserad'],
        scores: { 'Okategoriserad': 1.0 }
      };
    }
  }

  /**
   * Parse AI-svar till strukturerat format
   */
  private parseCategorizationResponse(content: string): CategorizationResult {
    try {
      // Debug: logga vad AI:n returnerade
      console.log(`     Raw AI response: ${content.substring(0, 200)}...`);
      
      // Försök parse som JSON
      const parsed = JSON.parse(content);
      
      // Validera format
      if (!parsed.categories || !Array.isArray(parsed.categories)) {
        throw new Error('Invalid format: missing categories array');
      }

      // Filtrera bort ogiltiga kategorier
      const validCategories = parsed.categories.filter((cat: string) => 
        CATEGORIES.includes(cat as any)
      );

      if (validCategories.length === 0) {
        console.error(`     No valid categories found. AI returned: ${parsed.categories}`);
        throw new Error('No valid categories in response');
      }

      // Begränsa till max 3 kategorier
      let categories = validCategories.slice(0, 3);

      // Validera att kombinationer är logiska
      categories = this.validateCategoryCombinations(categories);

      // Extrahera scores och filtrera bort låga scores (< 50%)
      const scores: Record<string, number> = {};
      let filteredCategories: string[] = [];
      
      if (parsed.scores && typeof parsed.scores === 'object') {
        // Filtrera bort kategorier med score < 0.5 (50%)
        for (const cat of categories) {
          const score = parsed.scores[cat] || 0.5;
          if (score >= 0.5) {
            scores[cat] = score;
            filteredCategories.push(cat);
          } else {
            console.log(`     → Filtered out "${cat}" (score: ${(score * 100).toFixed(0)}% < 50%)`);
          }
        }
      } else {
        // Generera default scores baserat på ordning
        categories.forEach((cat: string, i: number) => {
          const score = 1.0 - (i * 0.2); // 1.0, 0.8, 0.6
          if (score >= 0.5) {
            scores[cat] = score;
            filteredCategories.push(cat);
          } else {
            console.log(`     → Filtered out "${cat}" (default score: ${(score * 100).toFixed(0)}% < 50%)`);
          }
        });
      }

      // Säkerställ att vi har minst en kategori
      if (filteredCategories.length === 0) {
        console.warn(`     ⚠️ All categories filtered out, keeping first one: "${categories[0]}"`);
        filteredCategories = [categories[0]];
        scores[categories[0]] = 0.5; // Default score
      }

      return { categories: filteredCategories, scores };

    } catch (error) {
      console.error('Parse error:', error);
      console.error(`Failed to parse content: ${content}`);
      throw error;
    }
  }

  /**
   * Validera att kategorikombinationer är logiska
   */
  private validateCategoryCombinations(categories: string[]): string[] {
    // Förbjudna kombinationer
    const forbiddenCombinations = [
      ['Nattliv', 'Barn & Familj'],
      ['Nattliv', 'Jul'],
      ['Sport', 'Film & bio'],
      ['Mat & Dryck', 'Djur & Natur'],
      ['Guidade visningar', 'Nattliv'],
      ['Utställningar', 'Sport'],
      ['Jul', 'Nattliv']
    ];

    // Om vi har en förbjuden kombination, ta bort den sämsta kategorin
    for (const forbidden of forbiddenCombinations) {
      const hasBoth = forbidden.every(cat => categories.includes(cat));
      if (hasBoth) {
        console.warn(`  ⚠️ Invalid combination detected: ${forbidden.join(' + ')}`);
        // Ta bort den sista kategorin (sämst rankad)
        const lastCategory = categories[categories.length - 1];
        categories = categories.filter(cat => cat !== lastCategory);
        console.warn(`     → Removed "${lastCategory}" to fix combination`);
      }
    }

    return categories;
  }

  /**
   * Gör categorization request med retry-logik för 429-fel
   */
  private async makeCategorizationRequest(prompt: string, retries = 5): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        const client = getOpenAIClient();
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Du är en expert på att kategorisera svenska evenemang. 
Analysera eventet och välj 1-3 kategorier som passar bäst.
Svara ENDAST med JSON i exakt detta format, inget annat.`
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 150,
          response_format: { type: "json_object" }
        });
        return response;
      } catch (error: any) {
        if (error.status === 429 && i < retries - 1) {
          // 429 Too Many Requests - vänta längre och försök igen med exponential backoff
          const waitTime = Math.pow(2, i) * 3000; // Exponential backoff: 3s, 6s, 12s, 24s, 48s
          console.log(`  ⏳ Rate limit hit (försök ${i + 1}/${retries}), väntar ${(waitTime/1000).toFixed(1)}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else if (error.status === 429 && i === retries - 1) {
          // Sista försöket - ge upp och returnera Okategoriserad
          console.error(`  ❌ Rate limit exceeded efter ${retries} försök, fallback till Okategoriserad`);
          throw new Error('Rate limit exceeded after max retries');
        } else {
          throw error; // Rethrow om det inte är 429
        }
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Bygg prompt för OpenAI
   */
  private buildPrompt(title: string, description: string, venue: string): string {
    const truncatedDesc = description.substring(0, 300);
    
    return `Kategorisera detta svenska evenemang. Välj 1-3 kategorier som passar bäst, sorterade efter relevans.

Titel: ${title}
Plats: ${venue}
Beskrivning: ${truncatedDesc}

Tillgängliga kategorier (använd EXAKT dessa namn):
- Scen
- Nattliv
- Sport
- Utställningar
- Konst
- Föreläsningar
- Barn & Familj
- Mat & Dryck
- Jul
- Film & bio
- Djur & Natur
- Guidade visningar
- Marknader

Kategori-beskrivningar (för din förståelse, använd INTE i svar):
• Scen = Teater, musikal, standup, konserter, livemusik, shower, musikföreställningar
• Nattliv = ENDAST klubb, DJ-event, nattklubb, fest, afterwork med alkohol/dans
• Sport = Matcher, träning, löpning, idrottsevenemang, sporttävlingar
• Utställningar = Konstutställningar, galleri, konstverkstad, kulturhus, konsthall
• Konst = Konstverk, konsthantverk, konstprojekt, konstinstallationer
• Föreläsningar = Talks, presentationer, workshops, seminarier, kurser
• Barn & Familj = Barnteater, sagostund, familjeaktiviteter, lekland
• Mat & Dryck = Restaurangevenemang, matfestival, matmarknad, vinprovning, middagar
• Jul = Julmarknader, julgranständning, lucia, julkonserter, julaktiviteter
• Film & bio = Biografföreställningar, filmvisningar, filmklubbar, filmfestival
• Djur & Natur = Djurparker, naturvandringar, fågelskådning, utomhusaktiviteter
• Guidade visningar = Stadsvandringar, museibesök, konstrundan, guidade turer
• Marknader = Julmarknader, loppisar, antikmarknader, konstmarknader, matmarknader

Svara i JSON-format (använd EXAKT kategorinamnen från listan ovan):
{
  "categories": ["Scen", "Föreläsningar"],
  "scores": {
    "Scen": 0.95,
    "Föreläsningar": 0.75
  }
}

VIKTIGT: Använd EXAKT kategorinamnen från listan (t.ex. "Scen", INTE "Scen: Teater...")

VIKTIGA REGLER:
- Välj 1-3 kategorier som LOGISKT går ihop
- Om osäker, välj bara EN kategori
- Sortera efter hur väl kategorin passar (bäst först)
- Scores mellan 0.0-1.0 (högre = bättre match)

KATEGORIER SOM ALDRIG GÅR IHOP:
❌ Nattliv + Barn & Familj (nattliv är för vuxna)
❌ Nattliv + Jul (jul är familjevänligt)
❌ Sport + Film & bio (olika aktivitetstyper)
❌ Mat & Dryck + Djur & Natur (mat vs natur)
❌ Guidade visningar + Nattliv (guidade turer är dagtid)
❌ Utställningar + Sport (konst vs fysisk aktivitet)
❌ Barn & Familj + Nattliv (barn hör inte hemma på nattliv)
❌ Jul + Nattliv (jul är familjevänligt, inte nattliv)

VIKTIGT OM NATTLIV:
- Nattliv = ENDAST klubb, fest, DJ-event, nattklubb med dans/alkohol
- Konserter och musikföreställningar = Scen (INTE Nattliv)
- Pub med musik = Mat & Dryck (INTE Nattliv)
- Afterwork = Mat & Dryck (INTE Nattliv om det inte är klubb/fest)

BRA KOMBINATIONER:
✅ Barn & Familj + Scen (barnteater, familjeföreställningar)
✅ Film & bio + Barn & Familj (barnbio)
✅ Föreläsningar + Utställningar (utställningsföreläsningar)
✅ Mat & Dryck + Jul (julmat, julmarknader)
✅ Sport + Barn & Familj (familjesport)
✅ Djur & Natur + Barn & Familj (familjeutflykter)
✅ Scen + Föreläsningar (föreläsningsföreställningar)
✅ Jul + Barn & Familj (julaktiviteter för familjer)

Exempel på bra scores:
- Huvudkategori: 0.9-1.0 (90-100%)
- Sekundär kategori: 0.7-0.8 (70-80%)
- Tredje kategori: 0.5-0.6 (50-60%)

Svara ENDAST med JSON, inget annat`;
  }
}

// Singleton instance
export const aiCategorizer = new AICategorizer();

