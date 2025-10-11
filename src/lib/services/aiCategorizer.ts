import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CATEGORIES = [
  'Scen',
  'Nattliv',
  'Sport',
  'Konst',
  'Föreläsningar',
  'Barn & Familj',
  'Mat & Dryck',
  'Jul',
  'Film & bio',
  'Djur & Natur',
  'Guidade visningar'
] as const;

export class AICategorizer {
  
  /**
   * Kategorisera ett event med OpenAI
   */
  async categorize(
    title: string,
    description: string,
    venue: string
  ): Promise<string> {
    
    console.log(`  🤖 AI-kategoriserar: ${title.substring(0, 50)}...`);
    
    try {
      const prompt = this.buildPrompt(title, description, venue);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Du är en expert på att kategorisera svenska evenemang. 
Svara ENDAST med ett av dessa kategorinamn: ${CATEGORIES.join(', ')}.
Svara med bara kategorinamnet, inget annat.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 20,
      });

      const category = response.choices[0].message.content?.trim() || 'Scen';
      
      // Validera att svaret är en giltig kategori
      if (!CATEGORIES.includes(category as any)) {
        console.warn(`  ⚠️ Ogiltig kategori från AI: ${category}, använder 'Scen'`);
        return 'Scen';
      }

      console.log(`     → ${category}`);
      return category;
      
    } catch (error) {
      console.error('  ❌ AI-kategorisering misslyckades:', error);
      return 'Scen'; // Fallback
    }
  }

  /**
   * Bygg prompt för OpenAI
   */
  private buildPrompt(title: string, description: string, venue: string): string {
    const truncatedDesc = description.substring(0, 300);
    
    return `Kategorisera detta svenska evenemang:

Titel: ${title}
Plats: ${venue}
Beskrivning: ${truncatedDesc}

Kategorier:
- Scen: Teater, musikal, standup, konserter, livemusik
- Nattliv: Klubb, DJ, pub, nattklubb, afterwork
- Sport: Matcher, träning, löpning, idrottsevenemang
- Konst: Utställningar, galleri, konstverkstad, kulturhus
- Föreläsningar: Talks, presentationer, workshops, seminarier
- Barn & Familj: Barnteater, sagostund, familjeaktiviteter
- Mat & Dryck: Restaurangevenemang, matfestival, matmarknad, vinprovning
- Jul: Julmarknader, julgranständning, lucia, julkonserter
- Film & bio: Biografföreställningar, filmvisningar, filmklubbar
- Djur & Natur: Djurparker, naturvandringar, fågelskådning, utomhusaktiviteter
- Guidade visningar: Stadsvandringar, museibesök, konstrundan, guidade turer

Vilket är den bästa kategorin?`;
  }
}

// Singleton instance
export const aiCategorizer = new AICategorizer();

