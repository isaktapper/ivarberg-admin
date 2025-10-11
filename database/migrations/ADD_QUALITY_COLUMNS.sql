-- Migration: Lägg till kvalitetsbedömning för events
-- Detta gör att systemet kan auto-publicera högkvalitativa events

-- Lägg till kvalitetskolumner
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS quality_score INTEGER,
ADD COLUMN IF NOT EXISTS quality_issues TEXT,
ADD COLUMN IF NOT EXISTS auto_published BOOLEAN DEFAULT FALSE;

-- Index för att snabbt hitta events som behöver granskas
CREATE INDEX IF NOT EXISTS idx_events_pending 
ON events(status) 
WHERE status = 'pending_approval';

-- Kommentarer för dokumentation
COMMENT ON COLUMN events.quality_score IS 'Kvalitetspoäng 0-100 baserat på komplettering av data';
COMMENT ON COLUMN events.quality_issues IS 'Lista över identifierade kvalitetsproblem';
COMMENT ON COLUMN events.auto_published IS 'TRUE om eventet auto-publicerades baserat på hög kvalitet';

