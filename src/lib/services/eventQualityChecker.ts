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
    },
    organizerId: number
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

    // 6. Innehållskontroll med OpenAI Moderation API
    const contentCheck = await this.checkContentSafety(event.name, event.description || '');
    if (!contentCheck.safe) {
      score -= 50;
      issues.push(...contentCheck.issues);
    }

    // 7. Bestäm status
    const isTrusted = TRUSTED_ORGANIZERS.includes(organizerId);
    let status: 'published' | 'pending_approval' | 'draft';
    let autoPublished = false;

    if (score >= 80 && isTrusted && contentCheck.safe) {
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
      const response = await openai.moderations.create({
        input: `${title}\n\n${description}`
      });

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
}

export const eventQualityChecker = new EventQualityChecker();

