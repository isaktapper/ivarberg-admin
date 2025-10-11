-- ALTERNATIV 3: Använd SECURITY DEFINER för att triggen ska köras med högre privilegier
-- Detta gör att triggern kringgår RLS

DROP TRIGGER IF EXISTS event_status_change_trigger ON events;
DROP FUNCTION IF EXISTS log_event_status_change();

CREATE OR REPLACE FUNCTION log_event_status_change()
RETURNS TRIGGER 
SECURITY DEFINER  -- Detta gör att funktionen körs med ägarens rättigheter
SET search_path = public
AS $$
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
            event_name,
            action,
            old_status,
            new_status,
            quality_score,
            quality_issues,
            changed_by
        ) VALUES (
            NEW.event_id,
            NEW.name,
            action_type,
            NULL,
            NEW.status,
            NEW.quality_score,
            NEW.quality_issues,
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
            event_name,
            action,
            old_status,
            new_status,
            quality_score,
            quality_issues,
            changed_by,
            changes
        ) VALUES (
            NEW.event_id,
            NEW.name,
            action_type,
            OLD.status,
            NEW.status,
            NEW.quality_score,
            NEW.quality_issues,
            COALESCE(current_setting('app.current_user', true), 'system'),
            jsonb_build_object(
                'name_changed', OLD.name != NEW.name,
                'description_changed', OLD.description != NEW.description,
                'category_changed', OLD.category != NEW.category
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_status_change_trigger
    AFTER INSERT OR UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION log_event_status_change();

SELECT '✅ Trigger med SECURITY DEFINER skapad! Testa att godkänna ett event nu!' as status;

