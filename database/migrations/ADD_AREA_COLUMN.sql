-- Lägg till område-kolumn på events
-- Området härleds automatiskt vid import (se src/lib/services/areaResolver.ts)
-- NULL = okänd plats (visas under "Övriga kommunen" i publika filtret, gissas aldrig)

ALTER TABLE events ADD COLUMN IF NOT EXISTS area TEXT;

-- Tillåtna värden (NULL tillåts för okänd plats)
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

CREATE INDEX IF NOT EXISTS idx_events_area ON events (area);

COMMENT ON COLUMN events.area IS 'Område i Varbergs kommun, härlett från location/venue_name vid import. NULL = okänd plats.';
