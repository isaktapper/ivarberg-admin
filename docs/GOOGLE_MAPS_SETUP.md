# Google Maps Setup

## Steg 1: Skaffa Google Maps API Key

1. Gå till [Google Cloud Console](https://console.cloud.google.com/)
2. Skapa ett nytt projekt eller välj ett befintligt
3. Aktivera följande APIs:
   - **Maps JavaScript API**
   - **Places API**

### Aktivera APIs:
1. Gå till "APIs & Services" > "Library"
2. Sök efter "Maps JavaScript API" och klicka "Enable"
3. Sök efter "Places API" och klicka "Enable"

### Skapa API Key:
1. Gå till "APIs & Services" > "Credentials"
2. Klicka "Create Credentials" > "API Key"
3. Kopiera din API key

### Begränsa API Key (Rekommenderat):
1. Klicka på din API key för att redigera
2. Under "Application restrictions":
   - Välj "HTTP referrers (web sites)"
   - Lägg till: `http://localhost:3000/*` (för utveckling)
   - Lägg till din produktions-URL när du deployar
3. Under "API restrictions":
   - Välj "Restrict key"
   - Välj "Maps JavaScript API" och "Places API"

## Steg 2: Lägg till API Key i Environment Variables

Lägg till följande rad i din `.env.local` fil:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=din_api_key_här
```

## Steg 3: Starta om utvecklingsservern

```bash
npm run dev
```

## Funktioner som nu fungerar:

✅ **Autocomplete för platser** - Börja skriva så får du förslag
✅ **Svensk fokus** - Begränsat till svenska platser
✅ **Formaterade adresser** - Får korrekt formaterade adresser
✅ **Fallback** - Fungerar som vanligt input om Maps inte laddas

## Kostnad

Google Maps har en generös gratiskvot:
- **Places Autocomplete**: $2.83 per 1000 requests
- **Gratis**: $200 kredit per månad
- För en admin-panel kommer kostnaderna vara minimala

## Säkerhet

- API-nyckeln är begränsad till specifika domäner
- Endast nödvändiga APIs är aktiverade
- Ingen känslig data exponeras
