-- Migration: Skapa tabell för email-mottagare
-- Skapad: 2025-11-18
-- Syfte: Hantera vilka som ska få dagliga email-rapporter från scrapern

-- 1. Skapa email_recipients tabell
CREATE TABLE IF NOT EXISTS email_recipients (
  id SERIAL PRIMARY KEY,
  
  -- Mottagarinfo
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  
  -- Notifikationstyper (flexibelt för framtida tillägg)
  notification_types TEXT[] DEFAULT ARRAY['daily_report'],
  
  -- Status
  enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Index för snabb lookup
CREATE INDEX idx_email_recipients_enabled ON email_recipients(enabled);
CREATE INDEX idx_email_recipients_notification_types ON email_recipients USING GIN(notification_types);

-- 3. RLS (Row Level Security)
ALTER TABLE email_recipients ENABLE ROW LEVEL SECURITY;

-- Endast autentiserade användare kan läsa email-mottagare
CREATE POLICY "Authenticated users can read email recipients"
  ON email_recipients FOR SELECT
  USING (auth.role() = 'authenticated');

-- Endast autentiserade kan uppdatera
CREATE POLICY "Authenticated users can manage email recipients"
  ON email_recipients FOR ALL
  USING (auth.role() = 'authenticated');

-- 4. Trigger för updated_at (använder befintlig function)
CREATE TRIGGER update_email_recipients_updated_at
  BEFORE UPDATE ON email_recipients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. Kommentarer
COMMENT ON TABLE email_recipients IS 'Mottagare för email-notifikationer från scrapers';
COMMENT ON COLUMN email_recipients.notification_types IS 'Typer av notifikationer att få (daily_report, weekly_summary, failure_only, etc.)';
COMMENT ON COLUMN email_recipients.enabled IS 'Om mottagaren är aktiv och ska få emails';

-- 6. Sätt in dig själv som första mottagare (exempel)
-- Byt ut email nedan till din egen!
-- INSERT INTO email_recipients (email, name, notification_types, enabled)
-- VALUES ('din@email.com', 'Ditt Namn', ARRAY['daily_report'], true);

