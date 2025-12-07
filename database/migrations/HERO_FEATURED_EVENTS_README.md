# Hero Featured Events Migration

## Översikt
Denna migration skapar en ny tabell `hero_featured_events` för att hantera featured events på startsidans hero-sektion.

## Features
- **Ett main featured event**: Visas stort i hero-sektionen
- **Max 5 secondary featured events**: Mindre kort under main event, med prioritering

## Tabellstruktur

```sql
hero_featured_events
├── id (SERIAL PRIMARY KEY)
├── event_id (INTEGER, FK till events)
├── position (TEXT: 'main' | 'secondary')
├── priority (INTEGER: 1-5 för secondary, högre = högre prioritet)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

## Constraints
- Endast ett main featured event kan existera åt gången
- Max 5 secondary featured events
- Automatisk validering via database triggers

## Installation

Kör följande SQL-fil i Supabase SQL Editor:
```bash
database/migrations/CREATE_HERO_FEATURED_EVENTS_TABLE.sql
```

## Admin Interface

En ny sida har skapats för att hantera hero featured events:
- **URL**: `/admin/hero-featured`
- **Funktioner**:
  - Välj/byt main featured event
  - Lägg till/ta bort secondary featured events (max 5)
  - Drag-and-drop omsortering av secondary events
  - Söka bland publicerade events
  - Preview av valda events

## API Endpoint

**GET** `/api/hero-featured`

Returnerar:
```json
{
  "main": {
    "id": 123,
    "name": "Event Name",
    "date_time": "2024-12-25T18:00:00",
    "image_url": "...",
    // ... resten av event-data
  },
  "secondary": [
    { /* event object */ },
    { /* event object */ },
    // ... upp till 5 events
  ]
}
```

## Användning från Publika Sidan

```typescript
// Fetch featured events
const response = await fetch('/api/hero-featured')
const { main, secondary } = await response.json()

// main = Ett event objekt eller null
// secondary = Array av upp till 5 event objekt, sorterade efter prioritet
```

## RLS (Row Level Security)

Tabellen har RLS aktiverat:
- **Läsning**: Alla användare (inklusive publika sidan)
- **Skriv/Uppdatera/Radera**: Endast autentiserade användare (admin)

## Relation till befintlig `featured` kolumn

Den befintliga `featured` boolean-kolumnen i `events`-tabellen är **separat** från detta system:
- `featured` = Generell featured-flagga (kan användas för andra ändamål)
- `hero_featured_events` = Specifik hantering av hero-sektionens featured events

Dessa två system kan användas parallellt utan konflikt.


