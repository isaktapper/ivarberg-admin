-- Fixa RLS för event_audit_log så att triggers kan skriva
-- Problemet: Triggers blockeras av RLS policies

-- Alternativ 1: Lägg till policy för system att skriva (REKOMMENDERAT)
CREATE POLICY "Allow system to insert audit logs"
ON event_audit_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Alternativ 2: Tillåt alla att läsa audit logs
CREATE POLICY "Allow authenticated to read audit logs"
ON event_audit_log
FOR SELECT
TO authenticated
USING (true);

-- Verifiera policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename = 'event_audit_log';

SELECT '✅ RLS policies skapade! Testa att godkänna ett event nu!' as status;

