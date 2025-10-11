-- KOMPLETT FIX - Kör denna i Supabase SQL Editor
-- Detta tar bort alla gamla triggers och skapar en ny korrekt

-- ============================================
-- STEG 1: Ta bort ALLA gamla triggers och funktioner
-- ============================================

DROP TRIGGER IF EXISTS event_changes_trigger ON events;
DROP TRIGGER IF EXISTS log_event_changes_trigger ON events;
DROP TRIGGER IF EXISTS audit_event_changes ON events;
DROP TRIGGER IF EXISTS event_status_change_trigger ON events;

DROP FUNCTION IF EXISTS log_event_changes();
DROP FUNCTION IF EXISTS log_event_status_change();

-- ============================================
-- STEG 2: Skapa NY KORREKT funktion
-- ============================================

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
            old_status,
            new_status,
            NEW.quality_score,
            NEW.quality_issues,
            COALESCE(current_setting('app.current_user', true), 'system'),
            jsonb_build_object(
                'name', NEW.name,
                'category', NEW.category,
                'venue_name', NEW.venue_name
            )
        );
        
        RETURN NEW;
    END IF;
    
    -- Vid UPDATE - logga statusändringar
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        old_status := OLD.status;
        new_status := NEW.status;
        
        -- Bestäm ACTION (för audit log) baserat på statusändring
        -- OBS: Action kan vara 'rejected' men STATUS ska vara 'cancelled'
        IF NEW.status = 'published' AND OLD.status = 'pending_approval' THEN
            action_type := 'approved';
        ELSIF NEW.status = 'cancelled' THEN
            -- STATUS är 'cancelled', men ACTION loggas som 'rejected'
            action_type := 'rejected';
        ELSIF NEW.status = 'published' AND OLD.status = 'draft' THEN
            action_type := 'edited';
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
            old_status,
            new_status,
            NEW.quality_score,
            NEW.quality_issues,
            COALESCE(current_setting('app.current_user', true), 'system'),
            jsonb_build_object(
                'name_changed', OLD.name != NEW.name,
                'description_changed', OLD.description != NEW.description,
                'category_changed', OLD.category != NEW.category,
                'image_changed', OLD.image_url != NEW.image_url
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEG 3: Skapa trigger
-- ============================================

CREATE TRIGGER event_status_change_trigger
    AFTER INSERT OR UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION log_event_status_change();

-- ============================================
-- STEG 4: Verifiera
-- ============================================

-- Visa alla triggers på events-tabellen
SELECT 
    trigger_name,
    event_manipulation as trigger_event,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'events'
ORDER BY trigger_name;

-- Resultat: Du ska endast se EN trigger: event_status_change_trigger

SELECT '✅ KLAR! Testa att godkänna ett event nu!' as status;

