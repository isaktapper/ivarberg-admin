import { eventCategories } from './validations'
import { EVENT_AREAS } from './services/areaResolver'

export const CATEGORIES = eventCategories.filter((c) => c !== 'Okategoriserad')
export const ALL_CATEGORIES = eventCategories
export const AREAS = EVENT_AREAS

/** Namnen på scraperkällorna som de skrivs i scraper_logs.scraper_name */
export const SCRAPER_SOURCES = ['Visit Varberg', 'Arena Varberg', 'Varbergs Teater', 'Societén', 'Varbergs BoIS'] as const

export const PAGE_SIZES = [25, 50, 100, 200] as const
