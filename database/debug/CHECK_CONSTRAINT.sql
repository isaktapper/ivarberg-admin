-- Debug: Kontrollera check_valid_categories constraint
-- Kör detta för att se vad constraint:en validerar

SELECT 
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'events' 
AND tc.table_schema = 'public'
AND tc.constraint_name = 'check_valid_categories';
