# Ny stad: rutin

Alla städer delar samma admin, samma databas och samma kod. En stad är en rad i
tabellen `tenants` plus ett Vercel-projekt som pekar på stadens domän.

## Engångsförberedelse (görs en gång, inte per stad)

1. **Ta en backup** av databasen i Supabase.
2. Kör i Supabase SQL-editorn, i den här ordningen:
   - `database/migrations/scale/001_tenants.sql`
   - `database/migrations/scale/002_tenant_columns.sql`

   Båda är rena tillägg. Varje ny kolumn har Varberg som standardvärde, så
   ivarberg.nu, scrapers, Instagram och nyhetsbrevet fortsätter som förut.
3. Deploya admin (branchen `scale/flera-stader`). Under Analys finns nu **Städer**.
4. Deploya sajten (samma branchnamn i `ivarberg-events-hub-main`). Utan
   `SITE_SLUG` beter den sig exakt som innan.
5. När en andra stad börjar få event: sätt `SITE_SLUG=varberg` på
   ivarberg.nu-projektet i Vercel och deploya om. Då filtreras Varbergs sajt på
   Varbergs kommunkod, och färger och texter kan ändras under Städer. **Gör det
   innan den andra staden har publicerade event**, annars syns de på ivarberg.nu.

## Per stad (ungefär tio minuter)

1. **Admin → Städer → Ny stad.** Fyll i stad och kommunkod. Domän, sajtnamn och
   kortnamn föreslås automatiskt. Välj färger och ladda upp logga. Spara.
   - Kommunkoden är SCB:s fyrsiffriga kod (Falkenberg 1382, Halmstad 1380,
     Kungsbacka 1384, Laholm 1381).
2. **Vercel → Add New → Project.** Importera samma repo som ivarberg.nu.
   Kopiera miljövariablerna från ivarberg.nu-projektet och lägg till
   `SITE_SLUG=<kortnamnet>`. Deploya.
3. **Koppla domänen** under Domains i det nya projektet och peka DNS enligt
   Vercels anvisning.
4. **Google Cloud:** lägg till domänen i Maps-nyckelns tillåtna webbadresser
   (adressfältet i tipsformuläret använder den).
5. **Kontrollera sajten.** Namn, färger och logga ska stämma. Den är tom tills
   staden har event.
6. **Lägg in event.** Byt till staden i stadsväljaren i admin. Event du skapar
   och tips som kommer in via stadens sajt hamnar i den staden.
7. **Sätt status Live** under Städer när sajten har innehåll. Utkast och pausade
   städer är dolda för sökmotorer. Lägg sedan till domänen i Google Search
   Console och skicka in `https://<domän>/api/sitemap.xml`.

## Vad en ny stad har och inte har

| Del | Ny stad |
|---|---|
| Startsida, eventsidor, arrangörssidor | Ja |
| Tipsformulär (med AI-ifyllnad) och Tyck till | Ja |
| Egen sitemap, robots.txt och llms.txt | Ja |
| Egna färger, logga, bilder, titlar och kontaktuppgifter | Ja, under Städer |
| Nyhetsbrevsrutan | Går att slå på. Utskick per stad finns inte än |
| Guider, säsongssidor, kategori- och områdessidor | Nej. Texterna är Varbergs. Sidorna svarar 404 för andra städer |
| Områdesfilter | Nej. Områdena är Varbergs |
| Scrapers | Nej. Nästa steg |
| Instagram-flödet och Torsdagsbrevet | Nej. Byggda för ett konto och en lista |

## Så hänger det ihop

- **Event** har `municipality_code`. En stads sajt visar event vars kod finns i
  stadens `municipality_codes`.
- **Tips, arrangörssidor, hero-event, nyhetsbrevsanmälningar och synpunkter** har
  `tenant_id`.
- **Arrangörer** är gemensamma för alla städer.
- **Admin:** stadsväljaren visas när det finns mer än en stad. Valet sparas i
  cookien `active_tenant` och styr alla listor. `useTenant()` i klientkod,
  `getActiveTenant()` i API-routes, hjälpfunktioner i `src/lib/tenants.ts`.
- **Sajten:** `getSite()` på servern och `useSite()` i klientkomponenter
  (`src/config/` i sajtens repo). Hårdkoda aldrig stadens namn eller domän i ny
  kod.
- **Behörighet:** alla som kunde logga in när migrationen kördes blev
  `platform_admins` och ser alla städer. En ny användare ser ingen stad förrän
  hen läggs i `platform_admins` eller `tenant_members`. Det finns inget
  gränssnitt för det än; lägg in raden i Supabase.

## Det här är inte gjort än

- Scrapers per stad (källor i databasen i stället för i koden).
- AI-skrivna SEO-sidor per stad (guider, säsonger, kategorier).
- Instagram och nyhetsbrev per stad.
- Områden per stad.
- Radnivåskydd (RLS) per stad. I dag ser varje inloggad användare all data via
  databasen; stadsväljaren är en vy, inte en säkerhetsgräns. Släpp inte in
  utomstående i admin innan det är byggt.
- Den större planen finns i `docs/SKALNINGSPLAN.md`. Det här är dess datamodell
  i en enklare första version, med en Vercel-deploy per stad i stället för en
  gemensam.
