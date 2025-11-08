# Environment Variables Setup

## Lägg till i din `.env.local` fil

Öppna (eller skapa) `.env.local` i root-mappen och lägg till denna rad längst ner:

```env
# Public Frontend URL (där användare ser events)
NEXT_PUBLIC_FRONTEND_URL=https://ivarberg.nu
```

## Komplett `.env.local` exempel

Din `.env.local` fil bör innehålla alla dessa variabler:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xypvnwdfbhbsdcftzbvr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI Configuration (för AI-kategorisering)
OPENAI_API_KEY=sk-...

# Google Maps API Key (valfritt - för plats-autocomplete)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# Public Frontend URL (där användare ser events)
NEXT_PUBLIC_FRONTEND_URL=https://ivarberg.nu
```

## Efter du lagt till variabeln

1. **Starta om dev server**
   ```bash
   # Stoppa servern (Ctrl+C)
   npm run dev
   ```

2. **Testa länken**
   - Gå till `/events` i admin
   - Klicka på öga-ikonen
   - Du ska nu tas till den publika sidan i ny flik

## Vad händer?

Ögat-ikonen länker nu till:
```
https://ivarberg.nu/events/{event_id}
```

Istället för att visa event-detaljer i admin, öppnas det publika eventet i en ny flik! 🎉

## Om du byter frontend-URL

När du deployer frontend till en ny URL (t.ex. custom domain):

1. Uppdatera `.env.local`:
   ```env
   NEXT_PUBLIC_FRONTEND_URL=https://ivarberg.se
   ```

2. Starta om dev server

3. Klart! Alla länkar uppdateras automatiskt.

## Production (Vercel)

Glöm inte att lägga till samma environment variabel i Vercel Dashboard:
```
NEXT_PUBLIC_FRONTEND_URL=https://ivarberg.se
```

