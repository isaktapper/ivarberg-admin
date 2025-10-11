-- Migration: Skapa tabell för scraper progress logs
-- Skapad: 2025-10-11
-- Syfte: Real-time logging av scraper progress med tidsuppskattning

-- 1. Skapa scraper_progress_logs tabell
CREATE TABLE IF NOT EXISTS scraper_progress_logs (
  id BIGSERIAL PRIMARY KEY,
  log_id BIGINT NOT NULL REFERENCES scraper_logs(id) ON DELETE CASCADE,

  -- Progress info
  step VARCHAR(100) NOT NULL,           -- t.ex. "scraping", "deduplicating", "categorizing"
  message TEXT NOT NULL,                -- t.ex. "Hittade 50 events"
  progress_current INTEGER DEFAULT 0,   -- Nuvarande progress (t.ex. 10 events processed)
  progress_total INTEGER,               -- Total items att processa (t.ex. 50 events)

  -- Tidsuppskattning
  estimated_time_remaining_ms INTEGER,  -- Uppskattad kvarstående tid i millisekunder

  -- Metadata
  metadata JSONB,                       -- Extra data (t.ex. {"eventsFound": 50, "duplicates": 5})

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index för snabb lookup
CREATE INDEX idx_scraper_progress_logs_log_id ON scraper_progress_logs(log_id);
CREATE INDEX idx_scraper_progress_logs_created_at ON scraper_progress_logs(created_at DESC);

-- 3. RLS (Row Level Security)
ALTER TABLE scraper_progress_logs ENABLE ROW LEVEL SECURITY;

-- Tillåt alla att läsa progress logs (för real-time updates)
CREATE POLICY "Allow public read access to progress logs"
  ON scraper_progress_logs
  FOR SELECT
  USING (true);

-- Endast service role kan skriva
CREATE POLICY "Allow service role to insert progress logs"
  ON scraper_progress_logs
  FOR INSERT
  WITH CHECK (true);

-- 4. Kommentar
COMMENT ON TABLE scraper_progress_logs IS 'Real-time progress logs för scrapers - används för att visa status i admin UI';
COMMENT ON COLUMN scraper_progress_logs.step IS 'Nuvarande steg i scraping-processen (scraping, deduplicating, categorizing, importing)';
COMMENT ON COLUMN scraper_progress_logs.progress_current IS 'Antal items processade hittills';
COMMENT ON COLUMN scraper_progress_logs.progress_total IS 'Totalt antal items att processa';
COMMENT ON COLUMN scraper_progress_logs.estimated_time_remaining_ms IS 'Uppskattad kvarstående tid i millisekunder';

-- 5. Automatisk cleanup (ta bort progress logs äldre än 7 dagar)
CREATE OR REPLACE FUNCTION cleanup_old_progress_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM scraper_progress_logs
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Kör cleanup dagligen (måste sättas upp i Supabase Dashboard under Database → Cron Jobs)
-- SELECT cron.schedule('cleanup-progress-logs', '0 2 * * *', 'SELECT cleanup_old_progress_logs()');
