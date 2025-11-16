-- Migration: Länka Organizer Pages till Organizers
-- Datum: 2025-11-15
-- Beskrivning: Lägger till 1-till-1 relation mellan organizers och organizer_pages

-- 1. Lägg till organizer_id kolumn i organizer_pages
ALTER TABLE organizer_pages
ADD COLUMN IF NOT EXISTS organizer_id INTEGER;

-- 2. Lägg till foreign key constraint med CASCADE delete
-- Om en organizer raderas, raderas även dess organizer page
ALTER TABLE organizer_pages
ADD CONSTRAINT fk_organizer_pages_organizer
FOREIGN KEY (organizer_id)
REFERENCES organizers(id)
ON DELETE CASCADE;

-- 3. Lägg till UNIQUE constraint för 1-till-1 relation
-- En organizer kan max ha en organizer page
ALTER TABLE organizer_pages
ADD CONSTRAINT uq_organizer_pages_organizer_id
UNIQUE (organizer_id);

-- 4. Skapa index för snabba lookups
CREATE INDEX IF NOT EXISTS idx_organizer_pages_organizer_id 
ON organizer_pages(organizer_id);

-- 5. Kommentar på kolumnen för dokumentation
COMMENT ON COLUMN organizer_pages.organizer_id IS 'Foreign key till organizers tabellen. En organizer kan max ha en organizer page (1-till-1).';

-- Notering: Befintliga organizer pages kommer att ha NULL som organizer_id
-- De kan kopplas manuellt via UI senare.

