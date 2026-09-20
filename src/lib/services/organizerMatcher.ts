import { createClient } from '@supabase/supabase-js';
import * as stringSimilarity from 'string-similarity';
import { normalizeWebsiteUrl } from './organizer-enricher';

/**
 * Service för att matcha events till rätt arrangör
 * Används för Visit Varberg och andra plattformar där arrangör inte alltid är källan
 */

interface OrganizerMetadata {
  venueName?: string;
  phone?: string;
  email?: string;
  organizerName?: string;
  organizerWebsite?: string;
}

interface OrganizerMatch {
  organizerId: number;
  matchType: 'exact' | 'fuzzy' | 'venue' | 'contact' | 'auto_created' | 'default';
  confidence: number;
  matchedField?: string;
  isNew?: boolean; // TRUE om arrangören just skapades
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
    defaultOrganizerId: number,
    scraperSource?: string
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

    // 5. Om vi har organizerName men ingen match: Skapa ny arrangör
    if (metadata.organizerName) {
      try {
        const newOrganizerId = await this.createPendingOrganizer(metadata, scraperSource);
        return {
          organizerId: newOrganizerId,
          matchType: 'auto_created',
          confidence: 0.7,
          isNew: true,
        };
      } catch (error) {
        console.error('Failed to auto-create organizer:', error);
        // Fallback till default om skapandet misslyckas
      }
    }

    // 6. Fallback: Använd default organizer (t.ex. Visit Varberg)
    return {
      organizerId: defaultOrganizerId,
      matchType: 'default',
      confidence: 0.5,
    };
  }

  /**
   * Exakt match på organizer name eller alternative names
   */
  private async findByName(name: string): Promise<number | null> {
    const normalized = name.trim().toLowerCase();

    // Kolla cache först
    if (this.organizerCache.has(normalized)) {
      return this.organizerCache.get(normalized)!;
    }

    // 1. Försök exakt match på name
    const { data: nameMatch } = await this.supabase
      .from('organizers')
      .select('id, name')
      .ilike('name', normalized)
      .single();

    if (nameMatch) {
      this.organizerCache.set(normalized, nameMatch.id);
      return nameMatch.id;
    }

    // 2. Försök matcha på alternative_names
    const { data: altMatches } = await this.supabase
      .from('organizers')
      .select('id, name, alternative_names')
      .not('alternative_names', 'is', null);

    if (altMatches) {
      for (const org of altMatches) {
        // Kontrollera om någon av de alternativa namnen matchar
        if (org.alternative_names && Array.isArray(org.alternative_names)) {
          const match = org.alternative_names.some(
            altName => altName.trim().toLowerCase() === normalized
          );
          
          if (match) {
            console.log(`  🔗 Matched "${name}" via alternative name for organizer "${org.name}" (ID: ${org.id})`);
            this.organizerCache.set(normalized, org.id);
            return org.id;
          }
        }
      }
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
      .select('id, name, venue_name, alternative_names')
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

      // Kolla mot alternativa namn
      if (org.alternative_names && Array.isArray(org.alternative_names)) {
        for (const altName of org.alternative_names) {
          const altNameNormalized = this.normalizeVenueName(altName);
          const altSimilarity = stringSimilarity.compareTwoStrings(normalized, altNameNormalized);

          if (altSimilarity >= 0.80 && (!bestMatch || altSimilarity > bestMatch.confidence)) {
            bestMatch = {
              id: org.id,
              confidence: altSimilarity
            };
          }
        }
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
   * Skapa en ny arrangör med pending-status (auto-created från scraper)
   */
  private async createPendingOrganizer(metadata: OrganizerMetadata, scraperSource?: string): Promise<number> {
    if (!metadata.organizerName) {
      throw new Error('Cannot create organizer without name');
    }

    // Dubbelkolla att arrangören inte redan finns (race condition-säkerhet)
    const existingMatch = await this.findByName(metadata.organizerName);
    if (existingMatch) {
      return existingMatch;
    }

    // Skapa arrangör med pending-status
    // Webbplatsen normaliseras till rotdomän - scraped URL pekar ofta på en
    // eventsida (t.ex. sonjasveranda.se/jul) och förmedlardomäner filtreras bort
    const { data, error } = await this.supabase
      .from('organizers')
      .insert({
        name: metadata.organizerName,
        status: 'pending', // Flaggas för admin-review
        venue_name: metadata.venueName,
        email: metadata.email || null,
        phone: metadata.phone || null,
        website: normalizeWebsiteUrl(metadata.organizerWebsite),
        created_from_scraper: true,
        needs_review: true,
        scraper_source: scraperSource || 'Visit Varberg',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create pending organizer:', error);
      throw error;
    }

    // Lägg till i cache
    const normalized = metadata.organizerName.trim().toLowerCase();
    this.organizerCache.set(normalized, data.id);

    console.log(`  ✨ Auto-created organizer: "${metadata.organizerName}" (ID: ${data.id}, pending review)`);
    
    return data.id;
  }

  /**
   * Logga matchningen för debugging
   */
  logMatch(match: OrganizerMatch, eventName: string, metadata: OrganizerMetadata): void {
    const emoji = match.matchType === 'exact' ? '🎯' :
                  match.matchType === 'venue' ? '🏢' :
                  match.matchType === 'contact' ? '📞' :
                  match.matchType === 'fuzzy' ? '🔍' :
                  match.matchType === 'auto_created' ? '✨' : '📋';

    console.log(
      `  ${emoji} Organizer match for "${eventName}": ` +
      `ID ${match.organizerId} (${match.matchType}, ${(match.confidence * 100).toFixed(0)}% confidence)` +
      (match.isNew ? ' [NEW - Pending Review]' : '')
    );

    if (match.matchedField && metadata[match.matchedField as keyof OrganizerMetadata]) {
      console.log(`     Matched on: ${match.matchedField} = "${metadata[match.matchedField as keyof OrganizerMetadata]}"`);
    }
  }
}

export const organizerMatcher = new OrganizerMatcher();
