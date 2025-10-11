# Ivarberg Admin Panel

En komplett admin-panel för event-hantering byggd med NextJS 14 och Supabase.

## Funktioner

### 🏠 Dashboard
- Översikt över alla events med status
- Snabb-statistik (antal draft, published, etc.)
- Senaste events med direktlänkar

### 📅 Events Management
- Lista alla events med sök och filter
- CRUD-operationer för events
- Bulk-operationer (featured status)
- Detaljvy med all event-information
- Formulär med validering
- **Google Maps integration** för plats-autocomplete

### 👥 Organizers Management
- Lista alla organizers
- CRUD-operationer för organizers
- Visa kopplade events per organizer
- Kontaktinformation och webbsidor

### 🔐 Säkerhet
- Supabase Authentication
- Skyddade routes med middleware
- RLS policies (konfigureras i Supabase)

## Tech Stack

- **Framework**: NextJS 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Forms**: React Hook Form + Zod validering
- **Icons**: Lucide React
- **Authentication**: Supabase Auth

## Installation

1. **Klona projektet**
   ```bash
   git clone <repository-url>
   cd ivarberg_admin
   ```

2. **Installera dependencies**
   ```bash
   npm install
   ```

3. **Skapa environment variables**
   Skapa en `.env.local` fil i root-mappen:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xypvnwdfbhbsdcftzbvr.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cHZud2RmYmhic2RjZnR6YnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NjQyODYsImV4cCI6MjA3NTE0MDI4Nn0.YOKTWaQI11jZy8xQneN9I41tKLMkn0SZ6lSHCSIdE80
   
   # Google Maps API Key (valfritt - för plats-autocomplete)
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=din_google_maps_api_key
   ```

4. **Starta utvecklingsservern**
   ```bash
   npm run dev
   ```

5. **Öppna i webbläsaren**
   Gå till [http://localhost:3000](http://localhost:3000)

## Databas Schema

Projektet använder följande tabeller i Supabase:

### Organizers
```sql
CREATE TABLE organizers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Events
```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  date_time TIMESTAMP NOT NULL,
  location TEXT NOT NULL,
  price TEXT,
  image_url TEXT,
  organizer_event_url TEXT,
  category event_category NOT NULL,
  organizer_id INTEGER REFERENCES organizers(id),
  is_featured BOOLEAN DEFAULT FALSE,
  status event_status DEFAULT 'draft',
  max_participants INTEGER,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Enums
```sql
CREATE TYPE event_category AS ENUM (
  'Scen', 'Nattliv', 'Sport', 'Konst', 
  'Föreläsningar', 'Barn & Familj', 'Mat & Dryck'
);

CREATE TYPE event_status AS ENUM (
  'draft', 'pending_approval', 'published', 'cancelled'
);
```

## Användning

### Första inloggningen
1. Skapa en användare i Supabase Auth
2. Logga in på admin-panelen
3. Börja skapa organizers och events

### Events
- **Skapa**: Klicka "Nytt Event" och fyll i formuläret
- **Redigera**: Klicka på edit-ikonen i listan eller detaljvyn
- **Ta bort**: Klicka på trash-ikonen (kräver bekräftelse)
- **Featured**: Klicka på stjärn-ikonen för att markera som featured

### Organizers
- **Skapa**: Klicka "Ny Organizer" och fyll i formuläret
- **Redigera**: Klicka på edit-ikonen i listan eller detaljvyn
- **Ta bort**: Klicka på trash-ikonen (endast om inga events är kopplade)

### Sök och Filter
- **Events**: Sök på namn, plats eller beskrivning. Filtrera på status och kategori
- **Organizers**: Sök på namn, plats eller e-post

## Utveckling

### Projektstruktur
```
ivarberg_admin/
├── src/                   # Källkod
│   ├── app/              # NextJS App Router pages
│   │   ├── events/       # Events CRUD & Review
│   │   ├── organizers/   # Organizers management
│   │   ├── scrapers/     # Scraper management
│   │   └── login/        # Login page
│   ├── components/       # React components
│   ├── contexts/         # React contexts (Auth)
│   ├── lib/              # Utilities och services
│   │   ├── scrapers/     # Scraper implementations
│   │   └── services/     # Business logic
│   └── types/            # TypeScript type definitions
│
├── docs/                  # 📚 Dokumentation
│   ├── Setup-guider (Supabase, AI, Scrapers)
│   └── Feature-dokumentation
│
└── database/             # 🗃️ SQL-filer
    ├── migrations/       # Schema-ändringar
    ├── fixes/            # Trigger och RLS fixes
    └── debug/            # Diagnostic queries
```

### Viktiga filer
- `src/lib/supabase.ts` - Supabase client konfiguration
- `src/lib/validations.ts` - Zod schemas för formulär
- `src/types/database.ts` - TypeScript types för databas
- `src/middleware.ts` - Route protection middleware

### Dokumentation
Se `/docs/` för detaljerade guider:
- **SUPABASE_SETUP.md** - Initial setup
- **EVENT_QUALITY_SYSTEM.md** - Kvalitetssystem
- **SCRAPER_SETUP.md** - Scraper-konfiguration

### Databas
Se `/database/` för SQL-filer:
- **migrations/** - Kör vid första setup
- **fixes/** - Använd vid problem
- **debug/** - Inspektera databasstruktur

### Anpassningar
- **Färger**: Ändra i Tailwind CSS klasser (blå är huvudfärg)
- **Kategorier**: Uppdatera `eventCategories` i `validations.ts`
- **Fält**: Lägg till nya fält i schema och formulär

## Deployment

### Vercel (Rekommenderat)
1. Pusha koden till GitHub
2. Anslut repository till Vercel
3. Lägg till environment variables i Vercel dashboard
4. Deploy automatiskt

### Andra plattformar
Projektet kan deployas på vilken NextJS-kompatibel plattform som helst:
- Netlify
- Railway
- DigitalOcean App Platform

## Säkerhet

### RLS Policies (Supabase)
Lägg till följande policies i Supabase för säkerhet:

```sql
-- Enable RLS
ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Allow authenticated users" ON organizers
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users" ON events
  FOR ALL USING (auth.role() = 'authenticated');
```

### Miljövariabler
- Håll API-nycklar säkra
- Använd `.env.local` för utveckling
- Konfigurera environment variables i produktionsmiljö

## Support

För frågor eller problem, kontakta utvecklingsteamet eller skapa en issue i projektet.

## Licens

Detta projekt är utvecklat för Ivarberg och är proprietärt.