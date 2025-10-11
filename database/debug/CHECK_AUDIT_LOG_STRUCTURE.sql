-- Kontrollera vilka kolumner som finns i event_audit_log tabellen
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'event_audit_log'
ORDER BY ordinal_position;

