# Fixa Event ID - Enkla ID:n från 1

## Problem
Events får komplicerade ID:n istället för enkla nummer som börjar från 1.

## Lösning
Kör följande SQL i Supabase SQL Editor för att fixa detta:

### Steg 1: Skapa en sekvens för event_id

```sql
-- Skapa en sekvens för event_id
CREATE SEQUENCE IF NOT EXISTS event_id_seq START 1;

-- Sätt nästa värde baserat på befintliga events (om det finns några)
SELECT setval('event_id_seq', COALESCE((SELECT MAX(CAST(event_id AS INTEGER)) FROM events WHERE event_id ~ '^[0-9]+$'), 0) + 1, false);
```

### Steg 2: Skapa en trigger för auto-increment

```sql
-- Skapa en funktion som genererar nästa event_id
CREATE OR REPLACE FUNCTION generate_event_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.event_id IS NULL OR NEW.event_id = '' THEN
        NEW.event_id := nextval('event_id_seq')::text;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Skapa trigger som körs före insert
DROP TRIGGER IF EXISTS trigger_generate_event_id ON events;
CREATE TRIGGER trigger_generate_event_id
    BEFORE INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION generate_event_id();
```

### Steg 3: Rensa befintliga komplicerade event_id (valfritt)

Om du vill rensa befintliga events och börja om från 1:

```sql
-- VARNING: Detta tar bort alla befintliga events!
-- Kör bara om du vill börja om från början
TRUNCATE TABLE events RESTART IDENTITY CASCADE;

-- Återställ sekvensen
ALTER SEQUENCE event_id_seq RESTART WITH 1;
```

### Steg 4: Testa

Efter att ha kört SQL:en ovan, testa att skapa ett nytt event i admin-panelen. Det ska nu få ID "1", nästa "2", osv.

## Resultat

- ✅ Första event får ID: "1"
- ✅ Andra event får ID: "2"  
- ✅ Tredje event får ID: "3"
- ✅ Och så vidare...

## Alternativ enklare lösning

Om du bara vill att nya events ska få enkla ID:n utan att ändra databasen:

Koden är redan uppdaterad för att automatiskt generera nästa enkla ID baserat på det högsta befintliga ID:t.
