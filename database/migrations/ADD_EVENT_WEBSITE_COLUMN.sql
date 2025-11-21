-- Migration: Lägg till event_website kolumn till events-tabellen
-- Detta gör att vi kan visa arrangörens event-sida istället för scraper-URL
-- 
-- Bakgrund:
-- - organizer_event_url: Scraper-URL (unik, används för deduplicering)
-- - event_website: Arrangörens event-sida (generell, visas för användaren)
--
-- Används av Visit Varberg för att visa arrangörens egna event-sida istället av Visit Varberg-URL

-- Lägg till kolumnen
ALTER TABLE events 
ADD COLUMN event_website TEXT;

-- Kommentar för dokumentation
COMMENT ON COLUMN events.event_website IS 'Arrangörens event-sida (visas för användaren)';

