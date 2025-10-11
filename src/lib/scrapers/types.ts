export interface ScrapedEvent {
  name: string;
  description?: string;
  date_time: string; // ISO 8601 format
  location: string;
  venue_name?: string;
  price?: string;
  image_url?: string;
  organizer_event_url?: string;
  category?: 'Scen' | 'Nattliv' | 'Sport' | 'Konst' | 'Föreläsningar' | 'Barn & Familj' | 'Mat & Dryck' | null;
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
  defaultCategory?: 'Scen' | 'Nattliv' | 'Sport' | 'Konst' | 'Föreläsningar' | 'Barn & Familj' | 'Mat & Dryck';
}

export interface ScraperResult {
  source: string;
  success: boolean;
  eventsFound: number;
  eventsImported: number;
  duplicatesSkipped: number;
  errors: string[];
}
