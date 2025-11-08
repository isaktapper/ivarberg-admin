-- Migration: Byt namn från 'Konst' till 'Utställningar'
-- Datum: 2025-01-12

-- STEG 1: Lägg till det nya värdet till enum-typen
-- Detta måste köras i en separat transaktion
ALTER TYPE event_category ADD VALUE 'Utställningar';

-- COMMIT; -- (om du kör i en transaktion, committa här)

-- STEG 2: Uppdatera befintliga events från 'Konst' till 'Utställningar'
-- Detta körs i en ny transaktion efter att STEG 1 är committat
UPDATE events 
SET category = 'Utställningar' 
WHERE category = 'Konst';

-- STEG 3: Kontrollera resultatet
SELECT category, COUNT(*) as antal_events 
FROM events 
WHERE category IN ('Konst', 'Utställningar')
GROUP BY category;