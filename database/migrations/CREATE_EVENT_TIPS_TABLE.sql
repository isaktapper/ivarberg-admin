-- Migration: Skapa event_tips tabell för hantering av användar-submitterade tips
-- Datum: 2025-01-XX
--
-- Detta schema stöder fullständiga event-tips med stöd för:
-- - Multi-category support
-- - Separata fält för datum och plats
-- - Status-hantering för arbetsflöde

-- STEG 1: Skapa event_tips tabellen
CREATE TABLE IF NOT EXISTS event_tips (
  id SERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,
  
  -- Legacy date field (text)
  event_date TEXT,
  
  -- Proper datetime
  date_time TIMESTAMP,
  
  -- Plats information
  event_location TEXT,
  venue_name TEXT,
  
  -- Beskrivning
  event_description TEXT,
  
  -- Kategorier (multi-category support)
  categories TEXT[],
  category TEXT, -- Huvudkategori (första i arrayen)
  
  -- Media och länkar
  image_url TEXT,
  website_url TEXT,
  
  -- Submitterns information
  submitter_email TEXT NOT NULL,
  submitter_name TEXT,
  
  -- Status för arbetsflöde
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'rejected', 'converted')),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- STEG 2: Skapa indexes för snabbare queries
CREATE INDEX IF NOT EXISTS idx_event_tips_status ON event_tips(status);
CREATE INDEX IF NOT EXISTS idx_event_tips_created_at ON event_tips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_tips_submitter_email ON event_tips(submitter_email);

-- STEG 3: Skapa GIN index för array-fält
CREATE INDEX IF NOT EXISTS idx_event_tips_categories ON event_tips USING GIN(categories);

-- STEG 4: Kommentarer för dokumentation
COMMENT ON TABLE event_tips IS 'Användar-submitterade event tips från besökare';
COMMENT ON COLUMN event_tips.event_name IS 'Eventnamn som användaren har angett';
COMMENT ON COLUMN event_tips.date_time IS 'Event datum och tid i korrekt format';
COMMENT ON COLUMN event_tips.categories IS 'Array med 1-3 kategorier';
COMMENT ON COLUMN event_tips.category IS 'Huvudkategori (första i categories arrayen)';
COMMENT ON COLUMN event_tips.status IS 'Status för tipset i arbetsflödet: pending, reviewed, approved, rejected, converted';
COMMENT ON COLUMN event_tips.venue_name IS 'Platsnamn separerat från adress';

-- STEG 5: Skapa trigger för updated_at
CREATE OR REPLACE FUNCTION update_event_tips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_event_tips_updated_at
  BEFORE UPDATE ON event_tips
  FOR EACH ROW
  EXECUTE FUNCTION update_event_tips_updated_at();

-- STEG 6: Verifiera att tabellen har skapats korrekt
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'event_tips'
ORDER BY ordinal_position;
