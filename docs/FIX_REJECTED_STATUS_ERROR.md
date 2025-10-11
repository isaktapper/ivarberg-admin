# Fixa "rejected" Status-fel

## Problem
När du försöker godkänna eller avböja ett event får du felet:
```
Fel vid godkännande av event: invalid input value for enum event_status: "rejected"
```

## Orsak
Det finns en databas-trigger i Supabase som försöker sätta event status till `"rejected"`, men det värdet finns inte i `event_status` enum.

De tillåtna värdena är:
- ✅ `draft`
- ✅ `pending_approval`
- ✅ `published`
- ✅ `cancelled`
- ❌ `rejected` (finns inte!)

## Lösning

### Steg 1: Öppna Supabase SQL Editor
1. Gå till din Supabase dashboard
2. Klicka på "SQL Editor" i sidomenyn
3. Skapa en ny query

### Steg 2: Kör Fix-skriptet
Kopiera och kör SQL-koden från filen: **`FIX_AUDIT_LOG_TRIGGER.sql`**

Eller kör direkt:
```sql
-- Släpp befintlig trigger och funktion
DROP TRIGGER IF EXISTS event_status_change_trigger ON events;
DROP FUNCTION IF EXISTS log_event_status_change();

-- Skapa ny korrekt funktion
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
        
        -- Bestäm action baserat på statusändring (ACTION i audit log, inte STATUS)
        IF NEW.status = 'published' AND OLD.status = 'pending_approval' THEN
            action_type := 'approved';
        ELSIF NEW.status = 'cancelled' THEN
            action_type := 'rejected';  -- Detta är ACTION, inte STATUS!
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

-- Skapa ny trigger
CREATE TRIGGER event_status_change_trigger
    AFTER INSERT OR UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION log_event_status_change();
```

### Steg 3: Verifiera
1. Gå tillbaka till admin-panelen
2. Försök godkänna ett event
3. Det ska nu fungera utan fel! ✅

## Vad fixades?

### Före (felaktigt):
- Triggern försökte sätta `status = 'rejected'` ❌
- Detta värde finns inte i `event_status` enum
- Resultat: Databasfel

### Efter (korrekt):
- Event får status `'cancelled'` ✅
- Audit log får `action = 'rejected'` ✅
- `action` och `status` är separata fält!

## Teknisk förklaring

**Audit Log har två olika fält:**
1. **`action`** - Vad som hände (created, auto_published, approved, **rejected**, edited)
2. **`new_status`** - Vad eventet fick för status (draft, pending_approval, published, **cancelled**)

Triggern blandade ihop dessa. Nu är de korrekta:
- När event avböjs: `status = 'cancelled'` (i events-tabellen)
- När event avböjs: `action = 'rejected'` (i audit_log-tabellen)

## Om du får andra fel

Om du fortfarande får fel efter att ha kört skriptet:
1. Kontrollera att `event_audit_log` tabellen finns
2. Kör: `SELECT * FROM event_audit_log ORDER BY created_at DESC LIMIT 5;`
3. Verifiera att kolumnerna finns: `event_id`, `action`, `old_status`, `new_status`

