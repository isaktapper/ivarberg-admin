# Supabase Setup - Fixa 403-fel

## Problem
Du får 403-fel när du försöker skapa events eftersom Row Level Security (RLS) policies blockerar åtkomst.

## Lösning
Kör följande SQL-kommandon i Supabase SQL Editor:

### 1. Skapa RLS Policies för Events

```sql
-- Enable RLS på events tabellen (om inte redan aktiverat)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Tillåt alla operationer för autentiserade användare
CREATE POLICY "Allow all operations for authenticated users" ON events
  FOR ALL USING (auth.role() = 'authenticated');
```

### 2. Skapa RLS Policies för Organizers

```sql
-- Enable RLS på organizers tabellen (om inte redan aktiverat)
ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;

-- Tillåt alla operationer för autentiserade användare
CREATE POLICY "Allow all operations for authenticated users" ON organizers
  FOR ALL USING (auth.role() = 'authenticated');
```

### 3. Alternativ: Tillfälligt inaktivera RLS (ENDAST FÖR UTVECKLING)

Om du vill testa snabbt utan att sätta upp policies:

```sql
-- VARNING: Endast för utveckling!
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizers DISABLE ROW LEVEL SECURITY;
```

## Steg för att fixa:

1. Gå till din Supabase dashboard
2. Klicka på "SQL Editor" i sidomenyn
3. Kör SQL-kommandona ovan
4. Testa att skapa ett event igen

## Säkerhet
För produktion bör du skapa mer specifika policies baserat på användarroller och behörigheter.
