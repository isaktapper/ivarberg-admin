# Dubblettdetektering

Dubletter hanteras automatiskt, utan manuell granskning. Koden ligger i
`src/lib/services/dedup/` och är generisk: inga ortsnamn, lokalnamn eller
ordlistor är hårdkodade, så samma logik fungerar för alla städer.

## När den körs

1. **Vid import** (`event-importer.ts`): varje skrapat event jämförs mot databasen
   och mot tidigare event i samma körning. En dublett importeras inte. I stället får
   det befintliga eventet källans URL (`alternate_urls`) och de fält det saknar
   (bild, pris, bokningslänk, beskrivning).
2. **Varje natt** efter skraparna (`scripts/run-scrapers.ts`): alla kommande event
   jämförs parvis. Säkra dubletter slås ihop: förloraren får status `duplicate` och
   `duplicate_of` pekar på vinnaren. Inget raderas.

Manuellt: `pnpm dedupe-events --dry-run` visar vad som skulle slås ihop, `pnpm dedupe-events` gör det.

## Hur ett par bedöms

| Steg | Vad |
|---|---|
| URL | Samma käll-URL (eller en känd `alternate_urls`) = samma event |
| Tid | Mer än 3 h isär = olika. Samma källa med olika tider = olika tillfällen |
| Plats | Samma om namnen är lika, samma gatuadress, ett inlärt alias eller ≤250 m enligt koordinater. Olika om båda har exakta koordinater >1 km isär |
| Namn | Viktad ordjämförelse. Ovanliga ord (artist, titel) väger tungt och vanliga ord ("workshop", "höstlov") lätt, räknat ur databasen. Ord ur platsnamnet räknas inte |
| AI | Gråzonsfall avgörs av gpt-4o-mini med fakta om tid och plats (max 40 anrop per körning) |

Gränserna står i `matcher.ts`, och testfall från riktiga par finns i
`__tests__/matcher.test.ts` (`pnpm test:dedup`).

**Koordinater** hämtas från OpenStreetMap Nominatim (gratis, 1 anrop/s) och cachas
per plats i `venue_geocodes`, så varje plats slås upp en gång.
**Platsalias** (`venue_aliases`) lärs in automatiskt när två event med samma tid och
nästan samma namn ligger på olika platsnamn.

**Vilket event som behålls:** utvalt/hero > publicerat > arrangörens egen källa >
mest ifyllt > äldst.

## Ångra

Admin → Event → Dubletter listar varje beslut med motivering. **Ångra** visar det
dolda eventet igen, eller importerar det skrapade eventet från den sparade kopian.
Ett ångrat par slås aldrig ihop automatiskt igen.

## Databas

Kräver `database/migrations/ADD_GENERIC_DEDUP.sql`. Utan migrationen fungerar
importen som förut, men utan sammanslagning, alias och cache.
