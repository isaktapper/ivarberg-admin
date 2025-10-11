-- Migration: Lägg till description_format kolumn till events-tabellen
-- Detta gör att vi kan spåra vilket format beskrivningar har (markdown, html, plaintext)

-- Lägg till kolumnen med default värde 'markdown'
ALTER TABLE events 
ADD COLUMN description_format VARCHAR(20) DEFAULT 'markdown';

-- Lägg till en check constraint för att endast tillåta giltiga värden
ALTER TABLE events
ADD CONSTRAINT check_description_format 
CHECK (description_format IN ('markdown', 'html', 'plaintext'));

-- Kommentar för dokumentation
COMMENT ON COLUMN events.description_format IS 'Format för event-beskrivningen: markdown, html eller plaintext';

