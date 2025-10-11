# Venue Name Setup - Separera Platsnamn och Adress

## 1. Databas-ändringar (Supabase)

Kör följande SQL i Supabase SQL Editor:

```sql
-- Lägg till venue_name kolumn i events tabellen
ALTER TABLE events ADD COLUMN venue_name TEXT;

-- Lägg även till i organizers om du vill (valfritt)
ALTER TABLE organizers ADD COLUMN venue_name TEXT;
```

## 2. Admin-panel är redan uppdaterad

✅ Nya fält i formulär  
✅ Google Places fyller i både platsnamn och adress automatiskt  
✅ Validering uppdaterad  
✅ Database types uppdaterade  

## 3. Frontend App - Prompt för Cursor

Använd denna prompt i din frontend app:

---

**PROMPT FÖR CURSOR:**

```
Jag behöver uppdatera min event-app för att visa både platsnamn och adress korrekt.

NUVARANDE PROBLEM:
- Events visar bara "location" (adress) 
- Användare ser bara "Teatergatan 1, Varberg" istället för "Varbergs Teater"

DATABAS-ÄNDRINGAR (redan gjorda):
- events tabellen har nu både "location" (adress) och "venue_name" (platsnamn)

VAD JAG VILL:
1. I event-listan och event-detaljer: Visa "venue_name" som huvudplats
2. Under platsnamnet: Visa "location" som adress i mindre text
3. Om venue_name är tom: Fallback till location som tidigare

EXEMPEL PÅ ÖNSKAD VISNING:
```
🎭 Varbergs Teater
📍 Teatergatan 1, 432 40 Varberg
```

FILER SOM TROLIGEN BEHÖVER UPPDATERAS:
- Event list komponenter
- Event detail komponenter  
- Event card komponenter
- Alla ställen där location visas

IMPLEMENTATION:
- Skapa en utility-funktion för att formatera plats-visning
- Uppdatera alla komponenter som visar event-platser
- Använd ikoner för att skilja platsnamn från adress
- Responsive design för mobil

Kan du identifiera alla filer som behöver uppdateras och implementera denna förändring?
```

---

## 4. Resultat

Efter implementering kommer användare att se:

**I event-listan:**
```
🎭 Varbergs Teater
📍 Teatergatan 1, Varberg
```

**I event-detaljer:**
```
📍 Plats
🎭 Varbergs Teater
📍 Teatergatan 1, 432 40 Varberg
```

**Fallback (om venue_name saknas):**
```
📍 Teatergatan 1, 432 40 Varberg
```

## 5. Admin-panel användning

1. Sök efter "Varbergs Teater" i plats-fältet
2. Välj från Google Places förslag
3. Både "Platsnamn" och "Adress" fylls i automatiskt
4. Du kan redigera platsnamnet om det behövs
