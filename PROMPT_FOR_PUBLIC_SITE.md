# Prompt för Publika Sidan - Hero Featured Events Integration

## 📋 Uppgift
Integrera riktiga hero featured events från databasen istället för mockdata.

---

## 🎯 Vad som ska göras

Din publika sida använder för närvarande mockdata för "Main Featured Event" och "Secondary Featured Events" i hero-sektionen. Nu finns ett komplett system i admin-panelen för att hantera dessa featured events, och du ska integrera det.

---

## 🔌 API Endpoint

**URL**: `/api/hero-featured` (eller din admin-URL + `/api/hero-featured`)

**Metod**: GET

**Response format**:
```json
{
  "main": {
    "id": 123,
    "event_id": "evt_abc123",
    "name": "Julmarknad på Societeten",
    "description": "En fantastisk julmarknad...",
    "description_format": "markdown",
    "date_time": "2024-12-15T10:00:00+00:00",
    "location": "Varberg",
    "venue_name": "Societeten",
    "price": "Gratis",
    "image_url": "https://...",
    "organizer_event_url": "https://...",
    "event_website": "https://...",
    "booking_url": "https://...",
    "categories": ["Jul", "Marknader"],
    "organizer_id": 5,
    "featured": true,
    "status": "published",
    "created_at": "2024-11-01T10:00:00+00:00",
    "updated_at": "2024-11-20T15:30:00+00:00",
    "organizer": {
      "id": 5,
      "name": "Societeten",
      "location": "Varberg",
      "venue_name": "Societeten",
      "website": "https://...",
      // ... rest of organizer data
    }
  },
  "secondary": [
    {
      // Same structure as main event
      "id": 124,
      "name": "Teaterföreställning",
      // ...
    },
    {
      "id": 125,
      "name": "Konsert",
      // ...
    }
    // ... upp till 5 events totalt
  ]
}
```

**Notera**: 
- `main` kan vara `null` om inget main featured event är valt
- `secondary` är alltid en array (kan vara tom `[]`)
- Events är redan sorterade efter prioritet
- Endast `published` events returneras

---

## 🔄 Föreslagna ändringar

### 1. Ta bort mockdata
Hitta var du för närvarande definierar mockdata för main och secondary featured events och ta bort det.

### 2. Skapa en data-fetching funktion

```typescript
// Lägg till denna funktion där du hanterar data-fetching
async function fetchHeroFeaturedEvents() {
  try {
    const response = await fetch('https://YOUR_ADMIN_URL/api/hero-featured')
    
    if (!response.ok) {
      throw new Error('Failed to fetch featured events')
    }
    
    const data = await response.json()
    return {
      main: data.main,
      secondary: data.secondary || []
    }
  } catch (error) {
    console.error('Error fetching hero featured events:', error)
    // Returnera fallback eller tom data
    return {
      main: null,
      secondary: []
    }
  }
}
```

### 3. Använd data i din komponent

Beroende på ditt framework (React, Vue, Svelte, etc.), uppdatera din hero-sektion:

**React exempel**:
```typescript
const [mainFeatured, setMainFeatured] = useState(null)
const [secondaryFeatured, setSecondaryFeatured] = useState([])

useEffect(() => {
  async function loadFeaturedEvents() {
    const { main, secondary } = await fetchHeroFeaturedEvents()
    setMainFeatured(main)
    setSecondaryFeatured(secondary)
  }
  loadFeaturedEvents()
}, [])
```

**Next.js Server Component exempel**:
```typescript
// I din page.tsx eller component
async function HeroSection() {
  const { main, secondary } = await fetchHeroFeaturedEvents()
  
  return (
    <div>
      {main && <MainFeaturedCard event={main} />}
      <div className="secondary-grid">
        {secondary.map(event => (
          <SecondaryFeaturedCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  )
}
```

### 4. Hantera edge cases

```typescript
// Om inget main featured event finns
{mainFeatured ? (
  <MainFeaturedCard event={mainFeatured} />
) : (
  <div>Inga featured events för tillfället</div>
)}

// Om inga secondary events finns
{secondaryFeatured.length > 0 ? (
  secondaryFeatured.map(event => <SecondaryCard key={event.id} event={event} />)
) : (
  <div>Fler events kommer snart!</div>
)}
```

---

## 📊 Event Data Struktur

Varje event innehåller:

**Viktiga fält för display**:
- `name` - Event-namnet
- `date_time` - ISO 8601 datum/tid
- `venue_name` eller `location` - Platsnamn
- `image_url` - Bild-URL (kan vara null)
- `categories` - Array av kategorier (t.ex. `["Jul", "Marknader"]`)
- `price` - Prisinfo som sträng (t.ex. "Gratis", "200 kr", "150-300 kr")
- `description` - Beskrivning (formateras enligt `description_format`)
- `description_format` - Format: `"markdown"`, `"html"` eller `"plaintext"`

**Länkar**:
- `event_website` - Arrangörens event-sida (primär länk att visa användaren)
- `booking_url` - Direktlänk till biljettköp
- `organizer_event_url` - Scraperns källlänk

**Organizer info** (nested object):
- `organizer.name` - Arrangörens namn
- `organizer.venue_name` - Platsnamn
- `organizer.website` - Arrangörens hemsida

---

## 🎨 Formatering tips

### Datum formatering
```typescript
// Exempel på datumformatering
const formatEventDate = (dateString: string) => {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

// Output: "lördag 15 december 10:00"
```

### Beskrivning formatering
```typescript
// Om description_format === 'markdown'
import ReactMarkdown from 'react-markdown'
<ReactMarkdown>{event.description}</ReactMarkdown>

// Om description_format === 'html'
<div dangerouslySetInnerHTML={{ __html: event.description }} />

// Om description_format === 'plaintext'
<p>{event.description}</p>
```

### Kategorier
```typescript
// Visa kategorier som badges
{event.categories.map(category => (
  <span key={category} className="category-badge">
    {category}
  </span>
))}
```

---

## 🔄 Cache & Revalidering

**Rekommendation**: Cacha denna data i några minuter för att minska serverbelastning.

**Next.js exempel**:
```typescript
// I din fetch eller API route
export const revalidate = 300 // Revalidera var 5:e minut
```

**React Query exempel**:
```typescript
const { data } = useQuery({
  queryKey: ['hero-featured'],
  queryFn: fetchHeroFeaturedEvents,
  staleTime: 5 * 60 * 1000, // 5 minuter
  cacheTime: 10 * 60 * 1000, // 10 minuter
})
```

---

## ✅ Checklist

- [ ] Ta bort mockdata för main featured event
- [ ] Ta bort mockdata för secondary featured events
- [ ] Implementera fetch-funktion till `/api/hero-featured`
- [ ] Uppdatera main featured card för att använda riktig data
- [ ] Uppdatera secondary featured cards för att använda riktig data
- [ ] Hantera edge case: inget main event valt
- [ ] Hantera edge case: inga secondary events valda
- [ ] Formatera datum korrekt
- [ ] Formatera beskrivningar baserat på `description_format`
- [ ] Visa kategorier om du vill
- [ ] Visa organizer-info om du vill
- [ ] Testa att länkar fungerar (`event_website`, `booking_url`)
- [ ] Implementera error handling vid API-fel
- [ ] Implementera loading state
- [ ] (Optional) Lägg till cache/revalidering

---

## 🧪 Testning

1. **Ingen data**: Testa när admin inte har satt några featured events
2. **Endast main**: Testa när endast main featured är satt
3. **Full data**: Testa med 1 main + 5 secondary events
4. **Delvis data**: Testa med 1 main + 2-3 secondary events
5. **Missing images**: Testa events utan bilder
6. **Missing organizer**: Testa events utan organizer

---

## 🆘 Troubleshooting

**API returnerar 404**:
- Kontrollera att URL:en är korrekt
- Verifiera att API-routen finns på admin-sidan

**API returnerar empty data**:
- Kontrollera att events är markerade som `published`
- Verifiera att featured events är satta i admin-panelen

**CORS errors**:
- Om publika sidan körs på annan domän, se till att CORS är konfigurerat på API:t

**Bilder laddas inte**:
- Kontrollera `image_url` i response
- Vissa event-bilder kan vara null

---

## 📞 Support

Om du stöter på problem med integrationen, kontakta admin-systemets utvecklare eller kolla i dokumentationen.

**API Endpoint för test**: Du kan testa API:et direkt i browsern genom att besöka: `https://YOUR_ADMIN_URL/api/hero-featured`

---

Lycka till med integrationen! 🚀


