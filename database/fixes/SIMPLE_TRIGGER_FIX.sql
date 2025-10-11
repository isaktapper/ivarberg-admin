-- ENKEL TRIGGER som endast använder kolumner som garanterat finns
-- Använd detta om du vill ha en trigger som fungerar direkt utan att lägga till kolumner

DROP TRIGGER IF EXISTS event_status_change_trigger ON events;
DROP FUNCTION IF EXISTS log_event_status_change();

CREATE OR REPLACE FUNCTION log_event_status_change()
RETURNS TRIGGER AS $$
DECLARE
    action_type TEXT;
BEGIN
    -- Vid INSERT - logga creation
    IF TG_OP = 'INSERT' THEN
        action_type := 'created';
        
        IF NEW.auto_published = TRUE THEN
            action_type := 'auto_published';
        END IF;
        
        INSERT INTO event_audit_log (
            event_id,
            action,
            old_status,
            new_status,
            changed_by
        ) VALUES (
            NEW.event_id,
            action_type,
            NULL,
            NEW.status,
            COALESCE(current_setting('app.current_user', true), 'system')
        );
        
        RETURN NEW;
    END IF;
    
    -- Vid UPDATE - logga statusändringar
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        -- Bestäm ACTION baserat på statusändring
        IF NEW.status = 'published' AND OLD.status = 'pending_approval' THEN
            action_type := 'approved';
        ELSIF NEW.status = 'cancelled' THEN
            action_type := 'rejected';
        ELSIF NEW.status = 'published' THEN
            action_type := 'approved';
        ELSE
            action_type := 'edited';
        END IF;
        
        INSERT INTO event_audit_log (
            event_id,
            action,
            old_status,
            new_status,
            changed_by
        ) VALUES (
            NEW.event_id,
            action_type,
            OLD.status,
            NEW.status,
            COALESCE(current_setting('app.current_user', true), 'system')
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_status_change_trigger
    AFTER INSERT OR UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION log_event_status_change();

SELECT '✅ Enkel trigger skapad! Testa att godkänna ett event nu!' as status;

