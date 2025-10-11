-- ALTERNATIV: Stäng av RLS helt på event_audit_log
-- Detta är enklast om du kör en admin-app där alla användare är betrodda

ALTER TABLE event_audit_log DISABLE ROW LEVEL SECURITY;

SELECT '✅ RLS avstängt på event_audit_log! Testa att godkänna ett event nu!' as status;

-- För att aktivera igen senare (om du vill):
-- ALTER TABLE event_audit_log ENABLE ROW LEVEL SECURITY;

