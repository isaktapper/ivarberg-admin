-- Migration: Ta bort gamla category kolumnen
-- Datum: 2025-11-01
-- 
-- Nu när vi har migrerat till categories (plural) kan vi ta bort den gamla
-- category (singular) kolumnen som fortfarande har en NOT NULL constraint.

-- STEG 1: Verifiera att alla events har categories
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM events WHERE categories IS NULL OR array_length(categories, 1) IS NULL
  ) THEN
    RAISE EXCEPTION 'Det finns events utan categories! Kör ADD_MULTI_CATEGORY_SUPPORT.sql först.';
  END IF;
END $$;

-- STEG 2: Ta bort gamla category kolumnen
ALTER TABLE events DROP COLUMN IF EXISTS category;

-- STEG 3: Verifiera att tabellen fungerar korrekt
SELECT 
  COUNT(*) as total_events,
  COUNT(CASE WHEN array_length(categories, 1) >= 1 THEN 1 END) as events_with_categories
FROM events;

-- Om allt gick bra bör total_events = events_with_categories

