-- Migration: Lägg till 'cancelled' status för scraper logs
-- Skapad: 2025-01-27
-- Syfte: Stöd för att avbryta pågående scraping processer

-- 1. Uppdatera CHECK constraint för att inkludera 'cancelled' status
ALTER TABLE scraper_logs DROP CONSTRAINT IF EXISTS scraper_logs_status_check;
ALTER TABLE scraper_logs ADD CONSTRAINT scraper_logs_status_check 
  CHECK (status IN ('running', 'success', 'failed', 'partial', 'cancelled'));

-- 2. Lägg till kommentar
COMMENT ON COLUMN scraper_logs.status IS 'Status för scraper-körning: running, success, failed, partial, cancelled';
