-- Migration: Lägg till support för auto-creation av arrangörer
-- Datum: 2025-11-04
-- Beskrivning: Lägger till kolumner för att markera auto-skapade arrangörer från scrapers

-- 1. Lägg till status kolumn (active, pending, archived)
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 2. Lägg till created_from_scraper för att markera auto-skapade
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS created_from_scraper BOOLEAN DEFAULT FALSE;

-- 3. Lägg till needs_review för att flagga arrangörer som behöver granskas
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;

-- 4. Lägg till scraper_source för att veta vilken scraper som skapade arrangören
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS scraper_source TEXT;

-- 5. Lägg till check constraint för status
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'organizers_status_check'
    ) THEN
        ALTER TABLE organizers
        ADD CONSTRAINT organizers_status_check 
        CHECK (status IN ('active', 'pending', 'archived'));
    END IF;
END $$;

-- 6. Skapa index för snabb filtrering
CREATE INDEX IF NOT EXISTS idx_organizers_status 
ON organizers(status);

CREATE INDEX IF NOT EXISTS idx_organizers_needs_review 
ON organizers(needs_review) 
WHERE needs_review = TRUE;

CREATE INDEX IF NOT EXISTS idx_organizers_created_from_scraper 
ON organizers(created_from_scraper) 
WHERE created_from_scraper = TRUE;

-- 7. Kommentar på kolumnerna för dokumentation
COMMENT ON COLUMN organizers.status IS 'Status på arrangören: active, pending (väntar på godkännande), archived';
COMMENT ON COLUMN organizers.created_from_scraper IS 'TRUE om arrangören skapades automatiskt av en scraper';
COMMENT ON COLUMN organizers.needs_review IS 'TRUE om arrangören behöver granskas av admin';
COMMENT ON COLUMN organizers.scraper_source IS 'Namnet på scrapern som skapade denna arrangör (t.ex. "Visit Varberg")';

-- 8. Sätt alla befintliga arrangörer som active och inte från scraper
UPDATE organizers 
SET status = 'active',
    created_from_scraper = FALSE,
    needs_review = FALSE
WHERE status IS NULL;

SELECT 'Migration completed: ADD_ORGANIZER_AUTO_CREATE_SUPPORT.sql' AS status;

