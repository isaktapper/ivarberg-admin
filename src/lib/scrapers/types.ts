export type EventCategory = 'Scen' | 'Nattliv' | 'Sport' | 'Utställningar' | 'Konst' | 'Föreläsningar' | 'Barn & Familj' | 'Mat & Dryck' | 'Jul' | 'Film & bio' | 'Djur & Natur' | 'Guidade visningar' | 'Marknader' | 'Okategoriserad';

export interface ScrapedEvent {
  name: string;
  description?: string;
  date_time: string; // ISO 8601 format
  location: string;
  venue_name?: string;
  price?: string;
  image_url?: string;
  organizer_event_url?: string; // Scraper-URL (används för deduplicering)
  event_website?: string; // Arrangörens event-sida (visas för användaren, används av Visit Varberg)
  booking_url?: string; // Länk till biljettsida (används av Visit Varberg m.fl.)
  categories?: EventCategory[]; // 1-3 kategorier, fylls i av AI
  category_scores?: Record<string, number>; // Confidence scores från AI
  max_participants?: number;
  tags?: string[];
  // Quality assessment fields
  status?: 'published' | 'pending_approval' | 'draft';
  quality_score?: number;
  quality_issues?: string;
  auto_published?: boolean;
  // Metadata för arrangörsidentifiering (Visit Varberg m.fl.)
  metadata?: {
    venueName?: string;
    phone?: string;
    email?: string;
    organizerName?: string;
  };
}

export interface ScraperConfig {
  name: string;
  url: string;
  enabled: boolean;
  organizerId: number;
}

export interface ScraperResult {
  source: string;
  success: boolean;
  eventsFound: number;
  eventsImported: number;
  duplicatesSkipped: number;
  errors: string[];
}
