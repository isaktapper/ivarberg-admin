-- Lägg till is_free-kolumn på events
-- Härleds konservativt från prisinformation vid import (se src/lib/services/priceResolver.ts)
-- TRUE = säkert gratis, FALSE = säkert kostar, NULL = okänt (visas aldrig som gratis publikt)

ALTER TABLE events ADD COLUMN IF NOT EXISTS is_free BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_events_is_free ON events (is_free);

COMMENT ON COLUMN events.is_free IS 'Om eventet är gratis. TRUE = säkert gratis, FALSE = säkert kostar, NULL = okänt. Härleds vid import, kan overridas manuellt i admin.';
