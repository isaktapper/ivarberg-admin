export type EventCategory = 'Scen' | 'Nattliv' | 'Sport' | 'Konst' | 'Föreläsningar' | 'Barn & Familj' | 'Mat & Dryck' | 'Jul' | 'Film & bio' | 'Djur & Natur' | 'Guidade visningar' | 'Okategoriserad'
export type EventStatus = 'draft' | 'pending_approval' | 'published' | 'cancelled'
export type DescriptionFormat = 'markdown' | 'html' | 'plaintext'
export type ScraperLogStatus = 'running' | 'success' | 'failed' | 'partial'
export type ScraperTriggerType = 'manual' | 'cron' | 'api'

export interface Organizer {
  id: number
  name: string
  location?: string
  venue_name?: string // Platsnamn för organizer
  phone?: string
  email?: string
  website?: string
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
  category: EventCategory
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
    }
  }
}
