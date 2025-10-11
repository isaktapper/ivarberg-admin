-- Tabell för att logga scraper-körningar
CREATE TABLE scraper_logs (
  id BIGSERIAL PRIMARY KEY,
  
  -- Scraper info
  scraper_name TEXT NOT NULL,
  scraper_url TEXT NOT NULL,
  organizer_id INTEGER REFERENCES organizers(id) ON DELETE SET NULL,
  
  -- Körnings-info
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER, -- Beräknas från started_at och completed_at
  
  -- Resultat
  events_found INTEGER DEFAULT 0,
  events_imported INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  errors TEXT[], -- Array av error-meddelanden
  
  -- Metadata
  triggered_by TEXT, -- 'manual', 'cron', 'api'
  trigger_user_email TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index för snabbare queries
CREATE INDEX idx_scraper_logs_scraper_name ON scraper_logs(scraper_name);
CREATE INDEX idx_scraper_logs_status ON scraper_logs(status);
CREATE INDEX idx_scraper_logs_started_at ON scraper_logs(started_at DESC);
CREATE INDEX idx_scraper_logs_organizer_id ON scraper_logs(organizer_id);

-- Tabell för att schemalägga scraper-körningar (för cron)
CREATE TABLE scraper_schedules (
  id SERIAL PRIMARY KEY,
  
  -- Scraper info
  scraper_name TEXT NOT NULL UNIQUE,
  
  -- Schema
  enabled BOOLEAN NOT NULL DEFAULT true,
  cron_expression TEXT NOT NULL DEFAULT '0 6 * * *', -- Varje dag kl 06:00
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function för att uppdatera updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger för att uppdatera updated_at automatiskt
CREATE TRIGGER update_scraper_schedules_updated_at
  BEFORE UPDATE ON scraper_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Lägg till default schedules för befintliga scrapers
INSERT INTO scraper_schedules (scraper_name, enabled, cron_expression, next_run_at)
VALUES 
  ('Arena Varberg', true, '0 6 * * *', NOW() + INTERVAL '1 day' + TIME '06:00:00'),
  ('Varbergs Teater', true, '0 6 * * *', NOW() + INTERVAL '1 day' + TIME '06:00:00')
ON CONFLICT (scraper_name) DO NOTHING;

-- Enable RLS
ALTER TABLE scraper_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_schedules ENABLE ROW LEVEL SECURITY;

-- Policies för scraper_logs (authenticated users can read all)
CREATE POLICY "Allow authenticated users to read scraper_logs"
  ON scraper_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service_role to insert scraper_logs"
  ON scraper_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policies för scraper_schedules (authenticated users can read, service_role can update)
CREATE POLICY "Allow authenticated users to read scraper_schedules"
  ON scraper_schedules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service_role to update scraper_schedules"
  ON scraper_schedules FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "Allow service_role to insert scraper_schedules"
  ON scraper_schedules FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Kommentarer
COMMENT ON TABLE scraper_logs IS 'Logg över alla scraper-körningar';
COMMENT ON TABLE scraper_schedules IS 'Schema för automatiska scraper-körningar';
COMMENT ON COLUMN scraper_logs.status IS 'running, success, failed, partial';
COMMENT ON COLUMN scraper_logs.triggered_by IS 'manual, cron, api';
COMMENT ON COLUMN scraper_schedules.cron_expression IS 'Standard cron format (minute hour day month weekday)';
