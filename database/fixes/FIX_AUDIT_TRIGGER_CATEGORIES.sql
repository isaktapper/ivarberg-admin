-- Fix: Uppdatera audit log trigger för att använda 'categories' istället för 'category'
-- Datum: 2025-11-01
-- Problem: Triggern refererar fortfarande till gamla 'category' kolumnen
-- Lösning: Uppdatera funktionen att använda 'categories' (array)

-- Steg 1: Släpp befintlig trigger och funktion
DROP TRIGGER IF EXISTS event_status_change_trigger ON events;
DROP FUNCTION IF EXISTS log_event_status_change();

-- Steg 2: Skapa ny korrekt funktion med categories (plural)
CREATE OR REPLACE FUNCTION log_event_status_change()
RETURNS TRIGGER AS $$
DECLARE
    action_type TEXT;
    old_status TEXT;
    new_status TEXT;
BEGIN
    -- Vid INSERT - logga creation
    IF TG_OP = 'INSERT' THEN
        action_type := 'created';
        old_status := NULL;
        new_status := NEW.status;
        
        -- Kontrollera om det var auto-publicerat
        IF NEW.auto_published = TRUE THEN
            action_type := 'auto_published';
        END IF;
        
        INSERT INTO event_audit_log (
            event_id,
            action,
            old_status,
            new_status,
            quality_score,
            quality_issues,
            changed_by,
            changes
        ) VALUES (
            NEW.event_id,
            action_type,
            old_status,
            new_status,
            NEW.quality_score,
            NEW.quality_issues,
            COALESCE(current_user, 'system'),
            jsonb_build_object(
                'name', NEW.name,
                'categories', NEW.categories,  -- FIXAT: Använder categories istället för category
                'venue_name', NEW.venue_name
            )
        );
        
        RETURN NEW;
    END IF;
    
    -- Vid UPDATE - logga statusändringar
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        old_status := OLD.status;
        new_status := NEW.status;
        
        -- Bestäm action baserat på statusändring
        IF NEW.status = 'published' AND OLD.status = 'pending_approval' THEN
            action_type := 'approved';
        ELSIF NEW.status = 'cancelled' THEN
            action_type := 'rejected';  -- Action i audit log, INTE status
        ELSIF NEW.status = 'published' AND OLD.status = 'draft' THEN
            action_type := 'edited';
        ELSE
            action_type := 'edited';
        END IF;
        
        INSERT INTO event_audit_log (
            event_id,
            action,
            old_status,
            new_status,
            quality_score,
            quality_issues,
            changed_by,
            changes
        ) VALUES (
            NEW.event_id,
            action_type,
            old_status,
            new_status,
            NEW.quality_score,
            NEW.quality_issues,
            COALESCE(current_user, 'system'),
            jsonb_build_object(
                'old', row_to_json(OLD.*),
                'new', row_to_json(NEW.*)
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Steg 3: Skapa ny trigger
CREATE TRIGGER event_status_change_trigger
    AFTER INSERT OR UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION log_event_status_change();

-- Kommentar
COMMENT ON FUNCTION log_event_status_change() IS 
'Loggar statusändringar i event_audit_log. Använder categories (array) istället för category.';

-- Verifiera att det fungerar
SELECT 'Audit log trigger uppdaterad med categories-stöd!' as status;

