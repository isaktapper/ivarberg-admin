-- Table för att logga alla detekterade dubbletter
-- Detta gör att admins kan granska vilka events som skiprats pga dedupleter ing

CREATE TABLE IF NOT EXISTS duplicate_event_logs (
  id SERIAL PRIMARY KEY,
  
  -- Scraped event info
  scraper_name TEXT NOT NULL,
  scraped_event_name TEXT NOT NULL,
  scraped_event_url TEXT,
  
  -- Existing event info  
  existing_event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  existing_event_name TEXT NOT NULL,
  existing_event_url TEXT,
  
  -- Match details
  similarity_score DECIMAL(3,2) NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1), -- 0.00 to 1.00
  match_type TEXT NOT NULL CHECK (match_type IN ('url', 'fuzzy_name')),
  
  -- Timestamps
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes för snabb sökning
CREATE INDEX IF NOT EXISTS idx_duplicate_logs_scraper ON duplicate_event_logs(scraper_name);
CREATE INDEX IF NOT EXISTS idx_duplicate_logs_existing_event ON duplicate_event_logs(existing_event_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_logs_scraped_at ON duplicate_event_logs(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_duplicate_logs_similarity ON duplicate_event_logs(similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_duplicate_logs_match_type ON duplicate_event_logs(match_type);

-- RLS Policies
ALTER TABLE duplicate_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view duplicate logs"
  ON duplicate_event_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert duplicate logs"
  ON duplicate_event_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Kommentarer
COMMENT ON TABLE duplicate_event_logs IS 'Logs all detected duplicate events across different scrapers for admin review';
COMMENT ON COLUMN duplicate_event_logs.similarity_score IS 'Similarity score between 0.00 and 1.00 (1.00 = identical)';
COMMENT ON COLUMN duplicate_event_logs.match_type IS 'Type of match: url (exact URL match) or fuzzy_name (name similarity match)';

-- Verifiera
SELECT 'Duplicate event logs table created successfully! ✅' as status;

