-- Lägg till foreign key mellan event_audit_log och events
-- Detta säkerställer data-integritet mellan tabellerna

-- Först, kontrollera att event_id kolumnen finns i events-tabellen
-- (Den bör redan finnas som UNIQUE constraint)

-- Lägg till foreign key constraint
ALTER TABLE event_audit_log
ADD CONSTRAINT fk_audit_log_event_id
FOREIGN KEY (event_id) 
REFERENCES events(event_id)
ON DELETE CASCADE;

-- Index för bättre join-prestanda (bör redan finnas men vi säkerställer)
CREATE INDEX IF NOT EXISTS idx_audit_event_id ON event_audit_log(event_id);

-- Kommentar
COMMENT ON CONSTRAINT fk_audit_log_event_id ON event_audit_log 
IS 'Foreign key till events.event_id för att säkerställa data-integritet';

