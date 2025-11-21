-- SQL för att ta bort alla befintliga Visit Varberg-events
-- Detta gör att vi kan scrapa från grunden med den nya event_website-strukturen
--
-- VARNING: Detta tar bort alla events där organizer_event_url innehåller "visitvarberg.se"
-- Kör ENDAST om du är säker på att du vill ta bort dessa events!

-- Steg 1: Visa antal events som kommer tas bort (kör detta först för att verifiera)
SELECT COUNT(*) as antal_events_att_radera
FROM events
WHERE organizer_event_url LIKE '%visitvarberg.se%';

-- Steg 2: Visa vilka events som kommer tas bort (optional - för att dubbelkolla)
SELECT 
  id,
  name,
  date_time,
  organizer_event_url
FROM events
WHERE organizer_event_url LIKE '%visitvarberg.se%'
ORDER BY date_time DESC
LIMIT 20;

-- Steg 3: Ta bort alla Visit Varberg-events
-- OBS: Kommentera bort SELECT ovan och uncomment DELETE nedan när du är redo
DELETE FROM events
WHERE organizer_event_url LIKE '%visitvarberg.se%';

-- Bekräfta borttagning
SELECT COUNT(*) as kvarvarande_events
FROM events;

