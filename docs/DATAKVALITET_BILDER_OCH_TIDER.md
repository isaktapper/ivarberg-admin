# Datakvalitet: döda bilder och fel tider (2026-10-31)

## 1. Döda bildlänkar från varberg.se

**Symptom:** 19 av 443 kommande publicerade events hade en `image_url` som gav 404. Alla kom från Varbergs Teater-scrapern (Kulturhuset Komedianten på varberg.se). Inga bilder från andra källor var döda.

**Orsak:**

- Scrapern tog bilden från kalender-API:ets förhandsbild: `/images/200.<id>/<version>/<fil>`. `200.`-adresserna är kopior som Sitevision genererar för listvyn. När listan renderas om får bilden ett nytt id och en ny version, och den gamla adressen ger 404. Exempel: Henrik Nyblom "Kluven" sparades som `200.27fee…/1776323198412/…`, och listan visar nu `200.60021f…/1779721020100/…`.
- Detaljsidans `og:image` pekar på originalet i bildarkivet: `/images/18.<id>/<version>/<fil>`. Den adressen ändras bara när redaktören faktiskt byter bild. Det händer också: "Bryt ihop (och kom igen)" fick en ny bild ("version-2") i oktober.
- Kända events hoppades över helt vid import (URL-dubblett). Därför uppdaterades `image_url` aldrig efter första importen. Firecrawl-varianten hämtar inte ens detaljsidan för kända events.
- En extra bugg: srcset delades på `,`, och filnamn med kommatecken blev trasiga URL:er. Exempel: "The Hebbe Family, Foto Gabby Gren" gav `https://varberg.se%20Foto%20Gabby%20Gren.JPG.webp`.

**Fix:**

| Var | Ändring |
|---|---|
| `src/lib/scrapers/varbergs-teatern-scraper.ts` | Bilden tas från detaljsidans `og:image` (`18.*`, stabil), med listans förhandsbild som reserv. Srcset parsas med `url Nw` i stället för att delas på komma. |
| `src/lib/services/event-importer.ts` | Kända events (matchade på `organizer_event_url`, kommande datum) får ny `image_url` när scrapern hittar en annan bild. Det gäller bara om den nya bilden fungerar och den gamla saknas, ligger på samma värd eller är död. Manuellt inlagda bilder från andra värdar rörs inte. Nya events sparas inte med en död bild. |
| `src/lib/services/imageValidator.ts` | HEAD-kontroll med GET som reserv. 404/410 eller HTML räknas som död. Nätverksfel och 5xx räknas som okänt, och då rörs bilden inte. |
| `scripts/check-image-urls.ts` + `daily-scraper.yml` | Dagligt kontrollsteg: listar döda bilder på kommande publicerade events, hämtar om källsidan och byter bild (`--apply`). Det använder vanlig fetch, inga Firecrawl-credits. |

**Dry run 2026-10-31:** 18 kan repareras och 1 saknar ersättning. #7664 "Jul i Duvemåla Hage – Vinterhamn" 26/12: källsidan ger 404. Eventet verkar borttaget hos varberg.se, men det ligger fortfarande publicerat hos oss.

## 2. Tiden 04:30 på "Gratis träning på Friskis under höstlovet!"

**Orsak: källdata, inte vår parsning.** Visit Varbergs JSON har `startDate 2026-10-26T03:30:00Z`/`endDate 22:00:00Z`, och visitvarberg.se visar själv "kl 04.30 - 23.00". Arrangören har lagt in öppettider ("under våra bemannade öppettider"), inte en starttid. Troligen var det 05:30–24:00 i sommartid som sparades med fel offset: eventet skapades 12/10 under sommartid och datumen ligger efter omställningen 25/10. Samma mönster finns på "Gratis sportlovsträning på Friskis!" i februari. Vår UTC→svensk tid-konvertering räknar rätt.

**Fix (`visit-varberg-scraper.ts`, `resolveLocalDateTime`):** tillfällen som startar före 06:00 och varar minst 12 timmar sparas som heldag (`T00:00:00`, som i resten av systemet betyder "ingen tid"). Korta tidiga tillfällen, t.ex. en soluppgångsyoga 05:00–06:00, behåller sin tid.

### Relaterad bugg som hittades: heldagar sparades en dag för tidigt

Heldagsevent (`useDefaultStartTime`) gjordes om till datum med `toLocaleDateString('sv-SE')` utan tidszon. På GitHub Actions, som kör i UTC, blev källans lokala midnatt `2026-10-23T22:00Z` (24 okt) därför `2026-10-23`. Filtret för passerade datum hade samma fel. Exempel: "Rys & Krogmys" har raderna 23–31 okt, medan källan har 24 okt–1 nov. Fixen är explicit `timeZone: 'Europe/Stockholm'` i både konvertering och filter.

**Engångsrättning:** `scripts/fix-visitvarberg-times.ts` (dry run 2026-10-31):

```
#7981  2026-10-31T00:00:00 -> 2026-11-01T00:00:00  Rys & Krogmys
#7900  2026-10-31T04:30:00 -> 2026-10-31T00:00:00  Gratis träning på Friskis under höstlovet!
#7901  2026-11-01T04:30:00 -> 2026-11-01T00:00:00  Gratis träning på Friskis under höstlovet!
```

Scriptet ändrar bara kommande rader. Passerade Friskis-rader (#5246–5252, #7895–7899) och resten av Rys & Krogmys-serien lämnas som de är.
