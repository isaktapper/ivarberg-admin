-- Migration: Generisk dubblettdetektering
-- Skapad: 2026-11-01
-- Syfte: Stöd för src/lib/services/dedup/ - platsjämförelse via koordinater,
-- självlärda platsalias, sammanslagning av dubletter och ångra.
-- Inget är Varberg-specifikt.
--
-- Kör i Supabase SQL Editor. Steg 1 (ALTER TYPE) måste committas innan
-- värdet används, så kör hela filen i ett svep - inget nedan använder värdet.

-- 1. Ny eventstatus: dold dublett av ett annat event
ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'duplicate';

-- 2. Koppling dublett -> kanoniskt event, och extra käll-URL:er på det kanoniska
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS duplicate_of INTEGER REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS alternate_urls TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_events_duplicate_of ON events(duplicate_of) WHERE duplicate_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_alternate_urls ON events USING GIN (alternate_urls);

COMMENT ON COLUMN events.duplicate_of IS 'Satt när eventet är en dold dublett (status=duplicate) av ett annat event';
COMMENT ON COLUMN events.alternate_urls IS 'Käll-URL:er från andra källor som visat sig vara samma event (för URL-deduplicering)';

-- 3. Cache för geokodade platser (en rad per unik plats-/adressträng)
CREATE TABLE IF NOT EXISTS venue_geocodes (
  query_key TEXT PRIMARY KEY,           -- normaliserad nyckel för venue_name + location
  query TEXT NOT NULL,                  -- frågan som skickades till geokodaren
  lat DOUBLE PRECISION,                 -- NULL = gick inte att geokoda (cachas ändå)
  lon DOUBLE PRECISION,
  precise BOOLEAN NOT NULL DEFAULT false, -- true = byggnad/adress, false = bara ort/område
  display_name TEXT,
  provider TEXT NOT NULL DEFAULT 'nominatim',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Självlärda platsalias ("Lilla Teatern" = "Kulturhuset Komedianten")
CREATE TABLE IF NOT EXISTS venue_aliases (
  id SERIAL PRIMARY KEY,
  venue_a TEXT NOT NULL,                -- normaliserade platsnycklar, venue_a < venue_b
  venue_b TEXT NOT NULL,
  learned_from_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (venue_a, venue_b),
  CHECK (venue_a < venue_b)
);

-- 5. Dubblettloggen: beslut, sammanslagning och ångra
ALTER TABLE duplicate_event_logs DROP CONSTRAINT IF EXISTS duplicate_event_logs_match_type_check;
ALTER TABLE duplicate_event_logs ADD CONSTRAINT duplicate_event_logs_match_type_check
  CHECK (match_type IN ('url', 'fuzzy_name', 'rules', 'ai'));

ALTER TABLE duplicate_event_logs
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'skipped'
    CHECK (action IN ('skipped', 'merged', 'undone')),
  ADD COLUMN IF NOT EXISTS duplicate_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_status TEXT,
  ADD COLUMN IF NOT EXISTS reasons JSONB,
  ADD COLUMN IF NOT EXISTS scraped_payload JSONB,
  ADD COLUMN IF NOT EXISTS organizer_id INTEGER,
  ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_duplicate_logs_action ON duplicate_event_logs(action);

COMMENT ON COLUMN duplicate_event_logs.action IS 'skipped = skrapat event importerades inte, merged = befintligt event dolt som dublett, undone = ångrat (paret slås aldrig ihop igen)';
COMMENT ON COLUMN duplicate_event_logs.duplicate_event_id IS 'Eventet som doldes vid merge';
COMMENT ON COLUMN duplicate_event_logs.scraped_payload IS 'Det skrapade eventet vid skipped, så att det kan återskapas vid ångra';

-- 6. RLS + grants för de nya tabellerna (krävs för nya tabeller sedan 2026-10-30)
ALTER TABLE venue_geocodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view venue geocodes" ON venue_geocodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can view venue aliases" ON venue_aliases FOR SELECT TO authenticated USING (true);

GRANT SELECT ON venue_geocodes, venue_aliases TO authenticated;
GRANT ALL ON venue_geocodes, venue_aliases TO service_role;
GRANT USAGE, SELECT ON SEQUENCE venue_aliases_id_seq TO service_role;

-- Verifiera
SELECT 'Generisk dubblettdetektering installerad ✅' AS status;
