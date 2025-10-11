# Database Fixes

Trigger-fixes, RLS policies och bugfixar.

## Rekommenderad fix (kör dessa i ordning)

1. **COMPLETE_FIX.sql** ⭐
   - Tar bort alla gamla buggiga triggers
   - Skapar ny korrekt trigger för audit logging
   - Fixar "rejected" status-problemet

2. **FIX_AUDIT_LOG_COLUMNS.sql**
   - Lägger till saknade kolumner (quality_issues, event_name)

3. **DISABLE_RLS_AUDIT_LOG.sql**
   - Stänger av RLS på event_audit_log
   - Nödvändigt för att triggers ska fungera

## Alternativa lösningar

### Om du vill ha minimal trigger
- **SIMPLE_TRIGGER_FIX.sql** - Trigger utan extra kolumner

### Om du vill behålla RLS
- **SECURITY_DEFINER_TRIGGER.sql** - Trigger med högre privilegier
- **FIX_RLS_AUDIT_LOG.sql** - Lägg till policies istället för att stänga av

### Temporära fixes
- **TEMPORARY_DISABLE_TRIGGER.sql** - Stäng av alla triggers
- **REMOVE_OLD_TRIGGER.sql** - Ta bort specifika triggers

## Vanliga problem

### "rejected" status-fel
→ Kör **COMPLETE_FIX.sql**

### "quality_issues does not exist"
→ Kör **FIX_AUDIT_LOG_COLUMNS.sql**

### "row-level security policy"
→ Kör **DISABLE_RLS_AUDIT_LOG.sql**

