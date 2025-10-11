-- Migration: Skapa tabell för scraper progress logs
-- Kör denna SQL direkt i Supabase SQL Editor

-- 1. Skapa scraper_progress_logs tabell
CREATE TABLE IF NOT EXISTS scraper_progress_logs (
  id BIGSERIAL PRIMARY KEY,
  log_id BIGINT NOT NULL REFERENCES scraper_logs(id) ON DELETE CASCADE,
  step VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  progress_current INTEGER DEFAULT 0,
  progress_total INTEGER,
  estimated_time_remaining_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index för snabb lookup
CREATE INDEX IF NOT EXISTS idx_scraper_progress_logs_log_id ON scraper_progress_logs(log_id);
CREATE INDEX IF NOT EXISTS idx_scraper_progress_logs_created_at ON scraper_progress_logs(created_at DESC);

-- 3. RLS (Row Level Security)
ALTER TABLE scraper_progress_logs ENABLE ROW LEVEL SECURITY;

-- Tillåt alla att läsa progress logs
DROP POLICY IF EXISTS "Allow public read access to progress logs" ON scraper_progress_logs;
CREATE POLICY "Allow public read access to progress logs"
  ON scraper_progress_logs
  FOR SELECT
  USING (true);

-- Endast service role kan skriva
DROP POLICY IF EXISTS "Allow service role to insert progress logs" ON scraper_progress_logs;
CREATE POLICY "Allow service role to insert progress logs"
  ON scraper_progress_logs
  FOR INSERT
  WITH CHECK (true);
