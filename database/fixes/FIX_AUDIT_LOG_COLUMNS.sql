-- Lägg till saknade kolumner i event_audit_log tabellen
-- Detta gör att triggern kan spara all nödvändig data

-- Lägg till quality_issues kolumn om den saknas
ALTER TABLE event_audit_log 
ADD COLUMN IF NOT EXISTS quality_issues TEXT;

-- Lägg till event_name kolumn om den saknas (från den nya triggern)
ALTER TABLE event_audit_log 
ADD COLUMN IF NOT EXISTS event_name TEXT;

-- Verifiera att kolumnerna finns nu
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'event_audit_log'
ORDER BY ordinal_position;

SELECT '✅ Kolumner tillagda! Testa att godkänna ett event nu!' as status;

