import { createClient } from '@supabase/supabase-js';
import * as stringSimilarity from 'string-similarity';

/**
 * Service för att matcha events till rätt arrangör
 * Används för Visit Varberg och andra plattformar där arrangör inte alltid är källan
 */

interface OrganizerMetadata {
  venueName?: string;
  phone?: string;
  email?: string;
  organizerName?: string;
}

interface OrganizerMatch {
  organizerId: number;
  matchType: 'exact' | 'fuzzy' | 'venue' | 'contact' | 'default';
  confidence: number;
  matchedField?: string;
}

export class OrganizerMatcher {
  private supabase;
  private organizerCache: Map<string, number> = new Map();

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Hitta rätt arrangör för ett event baserat på metadata
   */
  async matchOrganizer(
    metadata: OrganizerMetadata,
    defaultOrganizerId: number
  ): Promise<OrganizerMatch> {

    // 1. Om organizerName finns, försök exakt match
    if (metadata.organizerName) {
      const exactMatch = await this.findByName(metadata.organizerName);
      if (exactMatch) {
        return {
          organizerId: exactMatch,
          matchType: 'exact',
          confidence: 1.0,
          matchedField: 'organizerName'
        };
      }
    }

    // 2. Försök matcha via venue name (många arrangörer har sitt eget venue)
    if (metadata.venueName) {
      const venueMatch = await this.findByVenue(metadata.venueName);
      if (venueMatch) {
        return {
          organizerId: venueMatch,
          matchType: 'venue',
          confidence: 0.9,
          matchedField: 'venueName'
        };
      }
    }

    // 3. Försök matcha via kontaktinfo (email/phone)
    if (metadata.email || metadata.phone) {
      const contactMatch = await this.findByContact(metadata.email, metadata.phone);
      if (contactMatch) {
        return {
          organizerId: contactMatch,
          matchType: 'contact',
          confidence: 0.95,
          matchedField: metadata.email ? 'email' : 'phone'
        };
      }
    }

    // 4. Fuzzy matching på venueName mot alla organizers
    if (metadata.venueName) {
      const fuzzyMatch = await this.fuzzyMatchVenue(metadata.venueName);
      if (fuzzyMatch) {
        return {
          organizerId: fuzzyMatch.id,
          matchType: 'fuzzy',
          confidence: fuzzyMatch.confidence,
          matchedField: 'venueName'
        };
      }
    }

    // 5. Fallback: Använd default organizer (t.ex. Visit Varberg)
    return {
      organizerId: defaultOrganizerId,
      matchType: 'default',
      confidence: 0.5,
    };
  }

  /**
   * Exakt match på organizer name
   */
  private async findByName(name: string): Promise<number | null> {
    const normalized = name.trim().toLowerCase();

    // Kolla cache först
    if (this.organizerCache.has(normalized)) {
      return this.organizerCache.get(normalized)!;
    }

    const { data } = await this.supabase
      .from('organizers')
      .select('id, name')
      .ilike('name', normalized)
      .single();

    if (data) {
      this.organizerCache.set(normalized, data.id);
      return data.id;
    }

    return null;
  }

  /**
   * Match via venue name (exakt)
   */
  private async findByVenue(venueName: string): Promise<number | null> {
    const normalized = venueName.trim().toLowerCase();

    const { data } = await this.supabase
      .from('organizers')
      .select('id, venue_name')
      .ilike('venue_name', normalized)
      .single();

    return data?.id || null;
  }

  /**
   * Match via email eller phone
   */
  private async findByContact(email?: string, phone?: string): Promise<number | null> {
    if (email) {
      const { data } = await this.supabase
        .from('organizers')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .single();

      if (data) return data.id;
    }

    if (phone) {
      // Normalisera phone (ta bort spaces, dashes, etc)
      const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');

      const { data } = await this.supabase
        .from('organizers')
        .select('id, phone')
        .not('phone', 'is', null);

      if (data) {
        // Manuell matching eftersom phone kan ha olika format
        for (const org of data) {
          const orgPhone = org.phone?.replace(/[\s\-\(\)]/g, '');
          if (orgPhone === normalizedPhone) {
            return org.id;
          }
        }
      }
    }

    return null;
  }

  /**
   * Fuzzy matching på venue name
   */
  private async fuzzyMatchVenue(venueName: string): Promise<{ id: number; confidence: number } | null> {
    const normalized = this.normalizeVenueName(venueName);

    // Hämta alla organizers med venue_name
    const { data } = await this.supabase
      .from('organizers')
      .select('id, name, venue_name')
      .not('venue_name', 'is', null);

    if (!data || data.length === 0) return null;

    let bestMatch: { id: number; confidence: number } | null = null;

    for (const org of data) {
      const orgVenueName = this.normalizeVenueName(org.venue_name || '');
      const similarity = stringSimilarity.compareTwoStrings(normalized, orgVenueName);

      // Threshold 0.80 (80% match)
      if (similarity >= 0.80 && (!bestMatch || similarity > bestMatch.confidence)) {
        bestMatch = {
          id: org.id,
          confidence: similarity
        };
      }

      // Kolla också mot organizer name
      const orgName = this.normalizeVenueName(org.name);
      const nameSimilarity = stringSimilarity.compareTwoStrings(normalized, orgName);

      if (nameSimilarity >= 0.80 && (!bestMatch || nameSimilarity > bestMatch.confidence)) {
        bestMatch = {
          id: org.id,
          confidence: nameSimilarity
        };
      }
    }

    return bestMatch;
  }

  /**
   * Normalisera venue name för jämförelse
   */
  private normalizeVenueName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\såäö]/g, '') // Ta bort specialtecken
      .replace(/\s+/g, ' ')
      .replace(/\b(i|på|varberg|sweden|sverige)\b/g, '') // Ta bort vanliga ord
      .trim();
  }

  /**
   * Logga matchningen för debugging
   */
  logMatch(match: OrganizerMatch, eventName: string, metadata: OrganizerMetadata): void {
    const emoji = match.matchType === 'exact' ? '🎯' :
                  match.matchType === 'venue' ? '🏢' :
                  match.matchType === 'contact' ? '📞' :
                  match.matchType === 'fuzzy' ? '🔍' : '📋';

    console.log(
      `  ${emoji} Organizer match for "${eventName}": ` +
      `ID ${match.organizerId} (${match.matchType}, ${(match.confidence * 100).toFixed(0)}% confidence)`
    );

    if (match.matchedField && metadata[match.matchedField as keyof OrganizerMetadata]) {
      console.log(`     Matched on: ${match.matchedField} = "${metadata[match.matchedField as keyof OrganizerMetadata]}"`);
    }
  }
}

export const organizerMatcher = new OrganizerMatcher();
