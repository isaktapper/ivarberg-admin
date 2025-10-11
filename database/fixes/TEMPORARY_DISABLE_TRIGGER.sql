-- TEMPORÄR FIX: Stäng av triggern för att testa
-- Detta gör att du kan godkänna events utan att triggern kraschar

-- Stäng av triggern temporärt
ALTER TABLE events DISABLE TRIGGER event_status_change_trigger;

-- För att aktivera den igen senare (efter att ha kört rätt fix):
-- ALTER TABLE events ENABLE TRIGGER event_status_change_trigger;

SELECT 'Trigger avstängd temporärt. Testa att godkänna ett event nu!' as status;

