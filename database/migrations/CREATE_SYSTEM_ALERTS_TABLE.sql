-- Tabell för systemvarningar och fel
-- Kör denna migration i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS system_alerts (
  id SERIAL PRIMARY KEY,
  
  -- Typ och allvarlighetsgrad
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  category TEXT NOT NULL, -- 'openai', 'scraper', 'database', 'api', etc.
  
  -- Vad som hände
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}', -- Extra data, stack traces, etc.
  
  -- Var det hände
  source TEXT, -- 'categorize-uncategorized', 'run-scrapers', etc.
  
  -- Status
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  
  -- Notifikationer
  sms_sent BOOLEAN DEFAULT FALSE,
  sms_sent_at TIMESTAMPTZ,
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index för snabba queries
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity ON system_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_system_alerts_category ON system_alerts(category);
CREATE INDEX IF NOT EXISTS idx_system_alerts_created_at ON system_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_alerts_unresolved ON system_alerts(resolved) WHERE resolved = FALSE;

-- Trigger för updated_at
CREATE OR REPLACE FUNCTION update_system_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS system_alerts_updated_at ON system_alerts;
CREATE TRIGGER system_alerts_updated_at
  BEFORE UPDATE ON system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_system_alerts_updated_at();

-- RLS policies
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

-- Tillåt authenticated users att läsa
CREATE POLICY "Authenticated users can view alerts"
  ON system_alerts
  FOR SELECT
  TO authenticated
  USING (true);

-- Tillåt authenticated users att uppdatera (acknowledge/resolve)
CREATE POLICY "Authenticated users can update alerts"
  ON system_alerts
  FOR UPDATE
  TO authenticated
  USING (true);

-- Service role kan skapa alerts
CREATE POLICY "Service role can insert alerts"
  ON system_alerts
  FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON TABLE system_alerts IS 'Systemvarningar och fel som behöver uppmärksamhet';
