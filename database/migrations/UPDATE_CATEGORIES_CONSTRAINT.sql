-- Migration: Uppdatera check_valid_categories constraint
-- Datum: 2024-12-19
-- Beskrivning: Uppdaterar constraint för att inkludera "Marknader" och "Konst"

-- Ta bort gamla constraint
ALTER TABLE events DROP CONSTRAINT IF EXISTS check_valid_categories;

-- Lägg till ny constraint med alla kategorier
ALTER TABLE events ADD CONSTRAINT check_valid_categories 
CHECK (
  categories IS NOT NULL 
  AND array_length(categories, 1) >= 1 
  AND array_length(categories, 1) <= 3
  AND categories <@ ARRAY[
    'Scen', 'Nattliv', 'Sport', 'Utställningar', 'Konst', 'Föreläsningar', 
    'Barn & Familj', 'Mat & Dryck', 'Jul', 'Film & bio', 
    'Djur & Natur', 'Guidade visningar', 'Marknader', 'Okategoriserad'
  ]::text[]
);

-- Verifiera att constraint:en fungerar
SELECT constraint_name, check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name = 'check_valid_categories';
