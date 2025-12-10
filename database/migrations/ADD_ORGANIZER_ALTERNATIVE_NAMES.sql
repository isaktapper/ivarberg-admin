-- Migration: ADD_ORGANIZER_ALTERNATIVE_NAMES
-- Beskrivning: Lägger till alternative_names kolumn för att matcha organizers med flera namn
-- Datum: 2025-12-10
-- 
-- Användningsfall:
-- Arena Varberg har flera namn (Sparbankshallen, Rotundan, etc.)
-- Detta undviker att nya organizers skapas automatiskt för samma arrangör

-- 1. Lägg till alternative_names kolumn (JSONB array)
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS alternative_names TEXT[] DEFAULT '{}';

-- 2. Lägg till index för snabbare sökning
CREATE INDEX IF NOT EXISTS idx_organizers_alternative_names 
ON organizers USING GIN (alternative_names);

-- 3. Kommentarer
COMMENT ON COLUMN organizers.alternative_names IS 'Alternativa namn för arrangören som används vid matchning (t.ex. ["Sparbankshallen", "Rotundan"] för Arena Varberg). Syns inte publikt.';

-- 4. Exempel på hur man lägger till alternativa namn:
-- UPDATE organizers 
-- SET alternative_names = ARRAY['Sparbankshallen', 'Rotundan', 'Arena Varberg Scene']
-- WHERE name = 'Arena Varberg';
