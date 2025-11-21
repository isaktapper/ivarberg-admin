-- Migration: Lägg till booking_url kolumn till events-tabellen
-- Detta gör att vi kan spara länk till biljettsida (används av Visit Varberg m.fl.)

-- Lägg till kolumnen
ALTER TABLE events 
ADD COLUMN booking_url TEXT;

-- Kommentar för dokumentation
COMMENT ON COLUMN events.booking_url IS 'Länk till biljettsida för eventet (t.ex. Tickster, Eventbrite)';

