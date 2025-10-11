-- Ta bort den gamla buggiga triggern
-- Problemet: Den försöker använda 'rejected' som en status, vilket inte finns i enum

-- Hitta och släpp alla triggers på events-tabellen
DROP TRIGGER IF EXISTS event_changes_trigger ON events;
DROP TRIGGER IF EXISTS log_event_changes_trigger ON events;
DROP TRIGGER IF EXISTS audit_event_changes ON events;

-- Ta bort den gamla buggiga funktionen
DROP FUNCTION IF EXISTS log_event_changes();

-- Verifiera att bara den nya korrekta triggern finns kvar
SELECT 
    trigger_name,
    event_manipulation,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'events'
ORDER BY trigger_name;

-- Om tabellen visar att event_status_change_trigger finns, är du klar! ✅
-- Om ingen trigger visas, kör FIX_AUDIT_LOG_TRIGGER.sql för att skapa den nya.

