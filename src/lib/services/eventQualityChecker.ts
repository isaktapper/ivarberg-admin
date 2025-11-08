import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface QualityAssessment {
  status: 'published' | 'pending_approval' | 'draft';
  score: number;
  issues: string[];
  autoPublished: boolean;
}

// Betrodda organisatörer som kan auto-publiceras
const TRUSTED_ORGANIZERS = [5, 6, 7]; // Arena Varberg (5), Varbergs Teater (6), Visit Varberg (7)

export class EventQualityChecker {
  
  /**
   * Bedöm kvaliteten på ett event och bestäm status
   */
  async assessQuality(
    event: {
      name: string;
      description?: string;
      date_time: string;
      venue_name?: string;
      image_url?: string | null;
      categories?: string[];
    },
    organizerId: number,
    source?: string, // Scrapernamn för att identifiera betrodda källor
    organizerStatus?: 'active' | 'pending' | 'archived' // Status på organizern
  ): Promise<QualityAssessment> {
    
    let score = 100;
    const issues: string[] = [];

    // 1. Titel (kritiskt, -30p)
    if (!event.name || event.name.length < 5) {
      score -= 30;
      issues.push('Titel för kort eller saknas');
    }

    // 2. Beskrivning (-20p om för kort, -30p om saknas)
    if (!event.description) {
      score -= 30;
      issues.push('Beskrivning saknas');
    } else if (event.description.length < 50) {
      score -= 20;
      issues.push('Beskrivning för kort (minst 50 tecken)');
    }

    // 3. Datum (kritiskt, -30p)
    if (!event.date_time) {
      score -= 30;
      issues.push('Datum saknas');
    } else {
      // Kontrollera att datumet är i framtiden
      const eventDate = new Date(event.date_time);
      if (eventDate < new Date()) {
        score -= 15;
        issues.push('Eventet är i det förflutna');
      }
    }

    // 4. Bild (-15p)
    if (!event.image_url) {
      score -= 25;
      issues.push('Bild saknas');
    }

    // 5. Plats (-10p)
    if (!event.venue_name || event.venue_name.length < 3) {
      score -= 10;
      issues.push('Plats saknas eller för kort');
    }

    // 6. Innehållskontroll med OpenAI Moderation API (skippa för betrodda källor)
    const isTrustedSource = source && ['Visit Varberg', 'Arena Varberg', 'Varbergs Teater'].includes(source);
    let contentCheck = { safe: true, issues: [] as string[] };
    
    if (!isTrustedSource) {
      contentCheck = await this.checkContentSafety(event.name, event.description || '');
      if (!contentCheck.safe) {
        score -= 50;
        issues.push(...contentCheck.issues);
      }
    } else {
      console.log(`  ✓ Skippar moderation för betrodd källa: ${source}`);
    }

    // 7. Kolla om eventet är okategoriserat
    const isUncategorized = event.categories?.includes('Okategoriserad') || 
                            event.categories?.length === 0 ||
                            !event.categories;
    
    if (isUncategorized) {
      score -= 30;
      issues.push('Kunde inte kategoriseras automatiskt - behöver granskas');
    }

    // 8. Bestäm status
    const isTrusted = TRUSTED_ORGANIZERS.includes(organizerId);
    let status: 'published' | 'pending_approval' | 'draft';
    let autoPublished = false;

    // Events från pending-organizers går alltid till draft
    if (organizerStatus === 'pending') {
      status = 'draft';
      issues.push('Organizer har pending-status - måste granskas');
    }
    // Events med "Okategoriserad" går alltid till draft
    else if (isUncategorized) {
      status = 'draft';
    } else if (score >= 80 && isTrusted && contentCheck.safe) {
      status = 'published';
      autoPublished = true;
    } else if (score >= 50) {
      status = 'pending_approval';
    } else {
      status = 'draft';
    }

    return {
      status,
      score,
      issues,
      autoPublished
    };
  }

  /**
   * Kontrollera innehållet med OpenAI Moderation API (gratis)
   */
  private async checkContentSafety(
    title: string, 
    description: string
  ): Promise<{ safe: boolean; issues: string[] }> {
    
    try {
      const response = await this.makeModerationRequest(`${title}\n\n${description}`);

      const result = response.results[0];
      const issues: string[] = [];

      if (result.flagged) {
        if (result.categories.hate) {
          issues.push('Potentiellt hatiskt innehåll');
        }
        if (result.categories['hate/threatening']) {
          issues.push('Potentiellt hotfullt innehåll');
        }
        if (result.categories.harassment) {
          issues.push('Potentiell trakassering');
        }
        if (result.categories.sexual) {
          issues.push('Olämpligt sexuellt innehåll');
        }
        if (result.categories.violence) {
          issues.push('Våldsamt innehåll');
        }
        if (result.categories['self-harm']) {
          issues.push('Innehåll om självskadande beteende');
        }
      }

      return {
        safe: !result.flagged,
        issues
      };

    } catch (error) {
      console.error('  ⚠️ Innehållskontroll misslyckades:', error);
      // Om API:et misslyckas, anta att det är säkert
      return { safe: true, issues: [] };
    }
  }

  /**
   * Gör moderation request med retry-logik för 429-fel
   */
  private async makeModerationRequest(input: string, retries = 5): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await openai.moderations.create({ input });
        return response;
      } catch (error: any) {
        if (error.status === 429 && i < retries - 1) {
          // 429 Too Many Requests - vänta längre och försök igen med exponential backoff
          const waitTime = Math.pow(2, i) * 3000; // Exponential backoff: 3s, 6s, 12s, 24s, 48s
          console.log(`  ⏳ Moderation rate limit (försök ${i + 1}/${retries}), väntar ${(waitTime/1000).toFixed(1)}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else if (error.status === 429 && i === retries - 1) {
          // Sista försöket - ge upp och anta att innehållet är säkert
          console.error(`  ⚠️ Moderation rate limit exceeded, antar att innehållet är säkert`);
          throw error;
        } else {
          throw error; // Rethrow om det inte är 429
        }
      }
    }
    throw new Error('Max retries exceeded');
  }
}

export const eventQualityChecker = new EventQualityChecker();

