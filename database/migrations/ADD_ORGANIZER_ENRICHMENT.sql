-- Migration: Enrichment-stöd för auto-skapade arrangörer
-- Datum: 2026-07-23
-- Beskrivning: Kolumner för att spåra automatisk berikning (crawl + AI-granskning)
--              av pending-arrangörer som skapats av scrapers.

-- 1. När arrangören senast berikades (NULL = aldrig försökt)
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

-- 2. AI:ns notering från berikningen (varför auto-godkänd / varför kvar i pending)
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS enrichment_note TEXT;

-- 3. Index för att snabbt hitta o-berikade pending-arrangörer
CREATE INDEX IF NOT EXISTS idx_organizers_pending_unenriched
ON organizers(status)
WHERE status = 'pending' AND enriched_at IS NULL;

COMMENT ON COLUMN organizers.enriched_at IS 'Tidpunkt när arrangören senast berikades automatiskt (crawl + AI). NULL = aldrig.';
COMMENT ON COLUMN organizers.enrichment_note IS 'AI-notering från senaste berikningen, t.ex. varför den auto-godkändes eller behöver manuell granskning.';

SELECT 'Migration completed: ADD_ORGANIZER_ENRICHMENT.sql' AS status;
