# Database Debug Scripts

Queries för att inspektera databasstrukturen.

## Scripts

### CHECK_TRIGGERS.sql
Visar alla triggers och funktioner på events-tabellen.

**Användning:**
```sql
-- Kör för att se vilka triggers som är aktiva
```

**Output:**
- Lista över alla triggers
- Trigger timing (BEFORE/AFTER)
- Trigger events (INSERT/UPDATE/DELETE)

### CHECK_AUDIT_LOG_STRUCTURE.sql
Visar alla kolumner i event_audit_log tabellen.

**Användning:**
```sql
-- Kör för att se vilket schema audit log har
```

**Output:**
- Kolumnnamn
- Datatyper
- Nullable status

## När ska man använda dessa?

- När du får databas-fel och vill se nuvarande struktur
- För att verifiera att migrations körts korrekt
- För att debugga trigger-problem

