export type EventCategory = 'Scen' | 'Nattliv' | 'Sport' | 'Utställningar' | 'Konst' | 'Föreläsningar' | 'Barn & Familj' | 'Mat & Dryck' | 'Jul' | 'Film & bio' | 'Djur & Natur' | 'Guidade visningar' | 'Marknader' | 'Okategoriserad'

export interface CategoryScore {
  [category: string]: number; // 0.0 - 1.0
}
export type EventStatus = 'draft' | 'pending_approval' | 'published' | 'cancelled'
export type DescriptionFormat = 'markdown' | 'html' | 'plaintext'
export type ScraperLogStatus = 'running' | 'success' | 'failed' | 'partial' | 'cancelled'
export type ScraperTriggerType = 'manual' | 'cron' | 'api'

export type OrganizerStatus = 'active' | 'pending' | 'archived'

export interface Organizer {
  id: number
  name: string
  location?: string
  venue_name?: string // Platsnamn för organizer
  phone?: string
  email?: string
  website?: string
  status: OrganizerStatus // Status: active, pending (väntar på godkännande), archived
  created_from_scraper: boolean // TRUE om auto-skapad av scraper
  needs_review: boolean // TRUE om arrangören behöver granskas
  scraper_source?: string // Namnet på scrapern som skapade arrangören
  created_at: string
  updated_at: string
}

export interface Event {
  id: number
  event_id: string
  name: string
  description?: string
  description_format?: DescriptionFormat // Format för beskrivningen (markdown, html, plaintext)
  date_time: string
  location: string
  venue_name?: string // Platsnamn (t.ex. "Varbergs Teater")
  price?: string
  image_url?: string
  organizer_event_url?: string
  event_website?: string // Arrangörens event-sida (visas för användaren)
  booking_url?: string // Länk till biljettsida
  category?: EventCategory // Deprecated: använd categories istället
  categories: EventCategory[] // 1-3 kategorier, sorterade efter relevans
  category_scores?: CategoryScore // Confidence scores för varje kategori
  organizer_id?: number
  featured: boolean
  status: EventStatus
  max_participants?: number
  tags?: string[]
  quality_score?: number // Kvalitetspoäng 0-100
  quality_issues?: string // Lista över kvalitetsproblem
  auto_published?: boolean // TRUE om auto-publicerat
  created_at: string
  updated_at: string
  organizer?: Organizer
}

export interface ScraperLog {
  id: number
  scraper_name: string
  scraper_url: string
  organizer_id?: number
  status: ScraperLogStatus
  started_at: string
  completed_at?: string
  duration_ms?: number
  events_found: number
  events_imported: number
  duplicates_skipped: number
  errors?: string[]
  triggered_by?: ScraperTriggerType
  trigger_user_email?: string
  created_at: string
  organizer?: Organizer
}

export interface ScraperSchedule {
  id: number
  scraper_name: string
  enabled: boolean
  cron_expression: string
  next_run_at?: string
  last_run_at?: string
  created_at: string
  updated_at: string
}

export interface ContactInfo {
  email?: string
  phone?: string
  website?: string
  address?: string
}

export interface SocialLinks {
  facebook?: string
  instagram?: string
  twitter?: string
  linkedin?: string
  youtube?: string
}

export interface OrganizerPage {
  id: number
  slug: string
  name: string
  title: string
  description: string
  content: string
  hero_image_url?: string
  gallery_images?: string[]
  contact_info?: ContactInfo
  social_links?: SocialLinks
  seo_title?: string
  seo_description?: string
  seo_keywords?: string
  is_published: boolean
  organizer_id?: number // Foreign key till organizers (1-till-1 relation)
  created_at: string
  updated_at: string
  // Computed fields
  event_count?: number
  organizer?: Organizer // Joined organizer data
}

export type ProgressStep =
  | 'starting'
  | 'scraping'
  | 'deduplicating'
  | 'categorizing'
  | 'matching_organizers'
  | 'importing'
  | 'completed'
  | 'failed';


export interface ScraperProgressLog {
  id: number
  log_id: number
  step: ProgressStep
  message: string
  progress_current?: number
  progress_total?: number
  estimated_time_remaining_ms?: number
  metadata?: Record<string, any>
  created_at: string
}

export type EventTipStatus = 'pending' | 'reviewed' | 'approved' | 'rejected' | 'converted'

export interface EventTip {
  id: number
  event_name: string
  event_date?: string
  date_time?: string
  event_location?: string
  venue_name?: string
  event_description?: string
  categories?: string[]
  category?: string
  image_url?: string
  website_url?: string
  submitter_email: string
  submitter_name?: string
  status: EventTipStatus
  created_at: string
  updated_at: string
}

export interface EmailRecipient {
  id: number
  email: string
  name?: string
  notification_types: string[]
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface HeroFeaturedEvent {
  id: number
  event_id: number
  position: 'main' | 'secondary'
  priority?: number // 1-5 för secondary (1 är högst prioritet)
  created_at: string
  updated_at: string
  // Joined data
  event?: Event
}

export interface Database {
  public: {
    Tables: {
      organizers: {
        Row: Organizer
        Insert: Omit<Organizer, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Organizer, 'id' | 'created_at' | 'updated_at'>>
      }
      events: {
        Row: Event
        Insert: Omit<Event, 'id' | 'created_at' | 'updated_at' | 'organizer'>
        Update: Partial<Omit<Event, 'id' | 'created_at' | 'updated_at' | 'organizer'>> & {
          updated_at?: string
        }
      }
      scraper_logs: {
        Row: ScraperLog
        Insert: Omit<ScraperLog, 'id' | 'created_at' | 'organizer'>
        Update: Partial<Omit<ScraperLog, 'id' | 'created_at' | 'organizer'>>
      }
      scraper_schedules: {
        Row: ScraperSchedule
        Insert: Omit<ScraperSchedule, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ScraperSchedule, 'id' | 'created_at' | 'updated_at'>>
      }
      organizer_pages: {
        Row: OrganizerPage
        Insert: Omit<OrganizerPage, 'id' | 'created_at' | 'updated_at' | 'event_count' | 'organizer'>
        Update: Partial<Omit<OrganizerPage, 'id' | 'created_at' | 'updated_at' | 'event_count' | 'organizer'>>
      }
      event_tips: {
        Row: EventTip
        Insert: Omit<EventTip, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<EventTip, 'id' | 'created_at' | 'updated_at'>>
      }
      email_recipients: {
        Row: EmailRecipient
        Insert: Omit<EmailRecipient, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<EmailRecipient, 'id' | 'created_at' | 'updated_at'>>
      }
      hero_featured_events: {
        Row: HeroFeaturedEvent
        Insert: Omit<HeroFeaturedEvent, 'id' | 'created_at' | 'updated_at' | 'event'>
        Update: Partial<Omit<HeroFeaturedEvent, 'id' | 'created_at' | 'updated_at' | 'event'>>
      }
    }
  }
}
