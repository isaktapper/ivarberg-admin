-- Kontrollera vilka triggers som finns på events-tabellen
SELECT 
    trigger_name,
    event_manipulation as trigger_event,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'events'
ORDER BY trigger_name;

-- Visa detaljer om audit log funktionen
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE routine_name LIKE '%audit%' OR routine_name LIKE '%event%'
ORDER BY routine_name;

