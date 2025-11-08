-- Migration: Lägg till stöd för flera kategorier per event
-- Datum: 2025-10-26
-- 
-- Detta gör att events kan ha 1-3 kategorier istället för bara 1,
-- vilket minskar risken för felkategorisering.

-- STEG 1: Lägg till nya kolumner
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS categories TEXT[],
ADD COLUMN IF NOT EXISTS category_scores JSONB;

-- STEG 2: Migrera befintlig data från category till categories
-- Sätt categories till en array med den gamla kategorin
UPDATE events 
SET categories = ARRAY[category::TEXT]
WHERE categories IS NULL;

-- STEG 3: Gör categories NOT NULL (nu när alla har data)
ALTER TABLE events 
ALTER COLUMN categories SET NOT NULL;

-- STEG 4: Lägg till check constraint - måste ha 1-3 kategorier
ALTER TABLE events
ADD CONSTRAINT check_categories_length 
CHECK (array_length(categories, 1) >= 1 AND array_length(categories, 1) <= 3);

-- STEG 5: Lägg till check constraint - endast giltiga kategorier
ALTER TABLE events
ADD CONSTRAINT check_valid_categories
CHECK (
  categories <@ ARRAY[
    'Scen',
    'Nattliv', 
    'Sport',
    'Utställningar',
    'Föreläsningar',
    'Barn & Familj',
    'Mat & Dryck',
    'Jul',
    'Film & bio',
    'Djur & Natur',
    'Guidade visningar',
    'Okategoriserad'
  ]::TEXT[]
);

-- STEG 6: Skapa index för snabbare kategori-filtrering
CREATE INDEX IF NOT EXISTS idx_events_categories 
ON events USING GIN(categories);

-- STEG 7: Kommentarer för dokumentation
COMMENT ON COLUMN events.categories IS 'Array av 1-3 kategorier, sorterade efter relevans (högst först)';
COMMENT ON COLUMN events.category_scores IS 'JSON object med kategori → confidence score (0.0-1.0)';

-- STEG 8 (OPTIONAL): Ta bort gamla category kolumnen efter att ha verifierat att allt fungerar
-- Kör detta ENDAST efter att ha testat i produktion:
-- ALTER TABLE events DROP COLUMN IF EXISTS category;

-- STEG 9: Visa exempel på resultat
SELECT 
  id,
  name,
  category as old_category,
  categories as new_categories,
  category_scores
FROM events 
LIMIT 10;

