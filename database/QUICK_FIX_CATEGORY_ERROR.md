# SNABBFIX: Category-relaterade fel

## Problem 1: "null value in column category violates not-null constraint"
Du får följande fel när du försöker importera events:
```
null value in column "category" of relation "events" violates not-null constraint
```

**Orsak:** Databasen har fortfarande den gamla `category` kolumnen (singular) med en NOT NULL constraint.

**Lösning:** Kör `REMOVE_OLD_CATEGORY_COLUMN.sql` (se nedan)

---

## Problem 2: "record new has no field category" 
Du får följande fel efter att ha tagit bort category kolumnen:
```
record "new" has no field "category"
```

**Orsak:** Det finns en trigger-funktion som fortfarande refererar till den gamla `category` kolumnen.

**Lösning:** Kör `FIX_AUDIT_TRIGGER_CATEGORIES.sql` (se nedan)

---

## Lösning - Kör båda dessa migrations
Kör följande SQL-migrations i Supabase SQL Editor i denna ordning:

### Steg 1: Öppna Supabase SQL Editor
1. Gå till din Supabase dashboard
2. Välj "SQL Editor" i vänstermenyn

### Steg 2A: Ta bort gamla category kolumnen
Kopiera och kör innehållet från:
```
database/migrations/REMOVE_OLD_CATEGORY_COLUMN.sql
```

Eller kopiera detta direkt:

```sql
-- Migration: Ta bort gamla category kolumnen
-- Datum: 2025-11-01
-- 
-- Nu när vi har migrerat till categories (plural) kan vi ta bort den gamla
-- category (singular) kolumnen som fortfarande har en NOT NULL constraint.

-- STEG 1: Verifiera att alla events har categories
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM events WHERE categories IS NULL OR array_length(categories, 1) IS NULL
  ) THEN
    RAISE EXCEPTION 'Det finns events utan categories! Kör ADD_MULTI_CATEGORY_SUPPORT.sql först.';
  END IF;
END $$;

-- STEG 2: Ta bort gamla category kolumnen
ALTER TABLE events DROP COLUMN IF EXISTS category;

-- STEG 3: Verifiera att tabellen fungerar korrekt
SELECT 
  COUNT(*) as total_events,
  COUNT(CASE WHEN array_length(categories, 1) >= 1 THEN 1 END) as events_with_categories
FROM events;

-- Om allt gick bra bör total_events = events_with_categories
```

### Steg 2B: Fixa audit log trigger
Kopiera och kör innehållet från:
```
database/fixes/FIX_AUDIT_TRIGGER_CATEGORIES.sql
```

Eller kopiera detta direkt:

```sql
-- Fix: Uppdatera audit log trigger för att använda 'categories' istället för 'category'
-- Datum: 2025-11-01

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
        
        IF NEW.auto_published = TRUE THEN
            action_type := 'auto_published';
        END IF;
        
        INSERT INTO event_audit_log (
            event_id, action, old_status, new_status,
            quality_score, quality_issues, changed_by, changes
        ) VALUES (
            NEW.event_id, action_type, old_status, new_status,
            NEW.quality_score, NEW.quality_issues,
            COALESCE(current_user, 'system'),
            jsonb_build_object(
                'name', NEW.name,
                'categories', NEW.categories,  -- FIXAT!
                'venue_name', NEW.venue_name
            )
        );
        RETURN NEW;
    END IF;
    
    -- Vid UPDATE - logga statusändringar
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        old_status := OLD.status;
        new_status := NEW.status;
        
        IF NEW.status = 'published' AND OLD.status = 'pending_approval' THEN
            action_type := 'approved';
        ELSIF NEW.status = 'cancelled' THEN
            action_type := 'rejected';
        ELSIF NEW.status = 'published' AND OLD.status = 'draft' THEN
            action_type := 'edited';
        ELSE
            action_type := 'edited';
        END IF;
        
        INSERT INTO event_audit_log (
            event_id, action, old_status, new_status,
            quality_score, quality_issues, changed_by, changes
        ) VALUES (
            NEW.event_id, action_type, old_status, new_status,
            NEW.quality_score, NEW.quality_issues,
            COALESCE(current_user, 'system'),
            jsonb_build_object('old', row_to_json(OLD.*), 'new', row_to_json(NEW.*))
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
```

### Steg 3: Verifiera
Efter att du kört BÅDA migrationerna, försök importera events igen. Felet ska nu vara borta!

## Bakgrund
- `ADD_MULTI_CATEGORY_SUPPORT.sql` lade till den nya `categories` kolumnen
- Men den gamla `category` kolumnen fanns kvar (markerad som "optional" att ta bort)
- Din kod har uppdaterats för att använda `categories`, men databasen kräver fortfarande `category`
- Denna migration tar bort den gamla kolumnen så att allt fungerar igen

## Verifiering
Du kan verifiera att migrationen lyckades med:

```sql
-- Detta ska INTE visa 'category' kolumnen längre
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'events'
AND table_schema = 'public'
ORDER BY ordinal_position;
```

