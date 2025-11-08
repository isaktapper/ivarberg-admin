-- Debug: Kontrollera events tabellens struktur
-- Kör detta för att se vilka kolumner som finns

-- 1. Kontrollera alla kolumner i events tabellen
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'events' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Kontrollera om categories kolumnen finns
SELECT 
    column_name,
    data_type,
    udt_name
FROM information_schema.columns 
WHERE table_name = 'events' 
AND table_schema = 'public'
AND column_name IN ('category', 'categories');

-- 3. Kontrollera constraints på category kolumnen
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'events' 
AND tc.table_schema = 'public'
AND kcu.column_name = 'category';
