-- Migration: Uppdatera event_category enum med nya kategorier
-- Detta lägger till de nya kategorierna som behövs för AI-kategorisering

-- Lägg till nya kategorier till enumet
ALTER TYPE event_category ADD VALUE IF NOT EXISTS 'Jul';
ALTER TYPE event_category ADD VALUE IF NOT EXISTS 'Film & bio';
ALTER TYPE event_category ADD VALUE IF NOT EXISTS 'Djur & Natur';
ALTER TYPE event_category ADD VALUE IF NOT EXISTS 'Guidade visningar';
ALTER TYPE event_category ADD VALUE IF NOT EXISTS 'Okategoriserad';

-- Kommentar för dokumentation
COMMENT ON TYPE event_category IS 'Event kategorier: Scen, Nattliv, Sport, Konst, Föreläsningar, Barn & Familj, Mat & Dryck, Jul, Film & bio, Djur & Natur, Guidade visningar, Okategoriserad';

