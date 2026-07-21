# Prompt för Publika Sidan - Gratis-badge på events

## 📋 Uppgift

Events-tabellen har fått en ny kolumn `is_free` som talar om ifall ett event är gratis. Visa en "Gratis"-badge på eventkort och eventdetaljsidor – men **bara** när vi är säkra.

## 🗄️ Datamodell

Kolumn på `events`-tabellen:

```
is_free  boolean | null
```

| Värde   | Betydelse                                  |
|---------|--------------------------------------------|
| `true`  | Säkert gratis (verifierad källa eller entydigt pris) |
| `false` | Säkert att det kostar                       |
| `null`  | Okänt – ingen pålitlig prisinfo finns       |

Värdet sätts i admin-systemet vid import (härlett från pålitliga källor, konservativt) och kan overridas manuellt av admin. **Publika sidan ska aldrig själv räkna ut detta.**

## ✅ Regler för visning

1. **Visa "Gratis"-badge endast när `is_free === true`.** Strikt jämförelse mot `true`.
2. **Visa ingenting om pris när `is_free` är `null`.** Okänt betyder okänt – gissa aldrig, och tolka aldrig saknat pris som gratis.
3. **När `is_free === false`**: visa ingen badge. Om ni vill kan ni visa prissträngen från `price`-kolumnen som informationstext, men observera att den är **fritext i blandade format** ("65 kr", "485", "Från 1095:-", "Ordinarie 300 kr, Medlem 250 kr") – visa den i så fall rakt av som text, försök inte parsa eller formatera om den.
4. **Härled ALDRIG gratis-status från `price`-strängen på publika sidan.** All tolkning sker i admin-systemet. Om `price` innehåller ordet "gratis" men `is_free` inte är `true` finns det en anledning (t.ex. "gratis endast för medlemmar").

## 💻 Exempel

```tsx
{event.is_free === true && (
  <span className="badge">Gratis</span>
)}
```

Eventuellt pris som informationstext (valfritt):

```tsx
{event.is_free === false && event.price && (
  <span className="price-text">{event.price}</span>
)}
```

## 🔍 Kom ihåg i queries

Lägg till `is_free` i select:en där events hämtas, t.ex.:

```ts
.select('id, name, date_time, ..., price, is_free')
```

## 📊 Nuläge i databasen (2026-07-14)

- ~47 % av kommande publicerade events har `is_free = true` (badge visas)
- ~34 % har `null` (inget visas – korrekt, vi vet inte)
- Resten har `false` (kostar)
