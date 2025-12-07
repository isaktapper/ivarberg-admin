-- Migration: Skapa tabell för hero featured events
-- Denna tabell hanterar main featured (1) och secondary featured (max 5) events på hero-sektionen

CREATE TABLE IF NOT EXISTS hero_featured_events (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position TEXT NOT NULL CHECK (position IN ('main', 'secondary')),
  priority INTEGER, -- För secondary: 1-5 (1 är högst prioritet)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index för snabbare lookups
CREATE INDEX idx_hero_featured_position ON hero_featured_events(position);
CREATE INDEX idx_hero_featured_priority ON hero_featured_events(priority);
CREATE INDEX idx_hero_featured_event_id ON hero_featured_events(event_id);

-- Endast ett main featured event åt gången
CREATE UNIQUE INDEX idx_one_main_featured 
  ON hero_featured_events(position) 
  WHERE position = 'main';

-- Endast 5 secondary featured events
CREATE OR REPLACE FUNCTION check_secondary_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.position = 'secondary' THEN
    IF (SELECT COUNT(*) FROM hero_featured_events WHERE position = 'secondary') >= 5 THEN
      RAISE EXCEPTION 'Maximum 5 secondary featured events allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_secondary_limit
  BEFORE INSERT ON hero_featured_events
  FOR EACH ROW
  EXECUTE FUNCTION check_secondary_limit();

-- Auto-update updated_at kolumn
CREATE OR REPLACE FUNCTION update_hero_featured_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_hero_featured_events_updated_at
  BEFORE UPDATE ON hero_featured_events
  FOR EACH ROW
  EXECUTE FUNCTION update_hero_featured_updated_at();

-- RLS (Row Level Security)
ALTER TABLE hero_featured_events ENABLE ROW LEVEL SECURITY;

-- Tillåt läsning för alla (publika sidan behöver läsa)
CREATE POLICY "Enable read access for all users" ON hero_featured_events
  FOR SELECT USING (true);

-- Tillåt full access för authenticated users (admin)
CREATE POLICY "Enable all access for authenticated users" ON hero_featured_events
  FOR ALL USING (auth.role() = 'authenticated');

-- Kommentar på tabellen
COMMENT ON TABLE hero_featured_events IS 'Hanterar featured events som visas i hero-sektionen på startsidan. Ett main event och max 5 secondary events med prioritering.';


