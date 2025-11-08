# Image Proxy - CORS Fix

## Problem

När arrangörssidor importeras från externa webbplatser får vi ofta CORS-fel:

```
Access to image at 'http://example.com/image.jpg' from origin 'http://localhost:3000' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

Detta gör att bilder visas som svarta rutor i admin-gränssnittet.

## Lösning

Vi har implementerat en **server-side image proxy** som laddar bilderna via Next.js backend istället för direkt från browsern.

### Hur det fungerar

```
Browser → Next.js API → Externa webbplatsen → Tillbaka via API → Browser
```

### Filer

1. **`/src/app/api/image-proxy/route.ts`** - API-endpoint som proxar bilder
2. **`/src/app/organizer-pages/[id]/edit/page.tsx`** - Använder proxyn
3. **`/src/app/organizer-pages/new/page.tsx`** - Använder proxyn

### Användning

#### Helper-funktion

```typescript
function getProxiedImageUrl(url: string): string {
  if (!url) return ''
  // Only proxy external images
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  }
  return url
}
```

#### I komponenter

```tsx
// Före (CORS-problem)
<img src={imageUrl} />

// Efter (fungerar!)
<img src={getProxiedImageUrl(imageUrl)} />
```

### API Endpoint

**URL:** `/api/image-proxy?url=https://example.com/image.jpg`

**Parametrar:**
- `url` (required) - URL till bilden som ska proxas

**Response:**
- Returnerar bilden med rätt `Content-Type`
- Sätter cache headers för prestanda
- Sätter CORS headers för att tillåta åtkomst

**Exempel:**

```bash
# Test i browsern eller curl
curl http://localhost:3000/api/image-proxy?url=https://example.com/image.jpg
```

### Fördelar

✅ **Löser CORS-problem** - Alla bilder laddas via servern  
✅ **Transparent** - Ingen märkbar skillnad för användaren  
✅ **Caching** - Bilder cachas för bättre prestanda  
✅ **Enkel** - Kräver bara en helper-funktion i komponenter

### Begränsningar

⚠️ **Server-last** - Alla bilder går via Next.js servern  
⚠️ **Latens** - Kan vara något långsammare än direkt laddning  
⚠️ **Ingen bildoptimering** - Bilder serveras i original-storlek

### Framtida förbättringar

- [ ] Lägg till bild-caching på servern
- [ ] Implementera bildoptimering (resize, compress)
- [ ] Använd Next.js Image component för automatisk optimering
- [ ] Lägg till rate limiting för att förhindra missbruk

### Troubleshooting

**Problem:** Bilder laddar fortfarande inte

**Lösning:**
1. Kontrollera att proxyn används: `src` ska börja med `/api/image-proxy?url=`
2. Öppna Network-fliken i DevTools och titta efter proxy-requests
3. Testa API:et direkt: `http://localhost:3000/api/image-proxy?url=...`
4. Kolla server-loggar för felmeddelanden

**Problem:** Bilden laddar långsamt

**Möjliga orsaker:**
- Originalbilden är stor
- Extern server är långsam
- Många bilder laddas samtidigt

**Lösning:**
- Implementera server-side caching
- Använd bildoptimering
- Lägg till loading indicators

### Säkerhet

- ✅ URL-validering: Kontrollerar att URL är giltig
- ✅ Content-Type validation: Endast bilder tillåts
- ⚠️ Rate limiting: Saknas (lägg till i framtiden)
- ⚠️ URL whitelist: Saknas (lägg till om behov uppstår)

### Performance

**Cache-headers:**
```javascript
'Cache-Control': 'public, max-age=31536000, immutable'
```

Bilder cachas i browsern i 1 år, vilket minimerar requests.

**Tips:**
- Använd lazy loading: `loading="lazy"` på img-taggar
- Implementera skeleton loading för bättre UX
- Överväg att pre-fetcha kritiska bilder

## Exempel

### Full implementation i en komponent

```typescript
import { useState } from 'react'

function getProxiedImageUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  }
  return url
}

export default function ImageGallery({ images }: { images: string[] }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {images.map((url, index) => (
        <img
          key={index}
          src={getProxiedImageUrl(url)}
          alt={`Image ${index + 1}`}
          className="w-full h-32 object-cover rounded"
          loading="lazy"
          onError={(e) => {
            console.error('Failed to load:', url)
            e.currentTarget.src = '/placeholder.jpg'
          }}
        />
      ))}
    </div>
  )
}
```

---

**Skapad:** 2025-11-08  
**Status:** ✅ Implementerad och fungerar

