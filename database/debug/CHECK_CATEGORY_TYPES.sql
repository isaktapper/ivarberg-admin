-- Debug: Kontrollera kategori-typer i databasen
-- Kör detta i Supabase SQL Editor för att se hur kategorier är definierade

-- 1. Kontrollera alla custom typer
SELECT 
    typname as type_name,
    typtype as type_type,
    typcategory as type_category
FROM pg_type 
WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY typname;

-- 2. Kontrollera events tabellens struktur
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

-- 3. Kontrollera om det finns constraints på category kolumnen
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

-- 4. Kontrollera om det finns en enum för kategorier
SELECT 
    t.typname as enum_name,
    e.enumlabel as enum_value
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname ILIKE '%category%' OR t.typname ILIKE '%event%'
ORDER BY t.typname, e.enumsortorder;
