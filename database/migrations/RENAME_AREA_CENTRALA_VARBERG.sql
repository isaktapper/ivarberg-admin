-- Byt områdesnamn 'Central Varberg' → 'Centrala Varberg'
-- Körs EFTER att ADD_AREA_COLUMN.sql (med 'Central Varberg') och backfill körts.
-- Constrainten måste släppas först eftersom UPDATE:n annars bryter mot den.

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_area_check;

UPDATE events SET area = 'Centrala Varberg' WHERE area = 'Central Varberg';

ALTER TABLE events ADD CONSTRAINT events_area_check
  CHECK (
    area IS NULL OR area IN (
      'Centrala Varberg',
      'Getterön',
      'Apelviken',
      'Träslövsläge',
      'Tvååker',
      'Veddige',
      'Bua',
      'Övriga kommunen'
    )
  );
