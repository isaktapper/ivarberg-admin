# Fas 6: ivarberg.nu flyttar till nya stacken + städning

**Mål:** ivarberg.nu körs på `apps/web`, utan rankingtapp. Därefter städas
övergångslösningarna bort (contract-steget), och Vite-repot arkiveras.

**Tid:** en bytesdag, sedan 8 veckors bevakning, och städning efter 4 veckor · **Beror på:** fas 5 stabil i 3–4 veckor

Detaljer: [SKALNINGSPLAN.md §7.9](../SKALNINGSPLAN.md#79-migrering-utan-att-tappa-ranking).

---

## Förberedelser (veckan före)
- [ ] Ny körning av `url-parity.ts` mot `next.ivarberg.nu`: 100 %.
- [ ] Färsk export från Search Console (jämför med baselinen från fas 0).
- [ ] Alla buggar från Falkenbergs driftperiod är åtgärdade.
- [ ] Gå igenom PostHog: samma events skickas från nya sajten som från den gamla (jämför
      `event_viewed`, `search_performed`, `tip_submitted` m.fl. på förhandsdomänen).
- [ ] Bytesdag: tisdag eller onsdag förmiddag, inte före en stor evenemangshelg.
- [ ] Sänk TTL på DNS-posterna till 300 s dagen innan (om DNS ligger utanför Vercel).

## Bytesdagen
1. [ ] Sätt `NEXT_PUBLIC_INDEXABLE` / per-tenant-indexering för Varberg.
2. [ ] Flytta domänen `ivarberg.nu` (och `www`) från det gamla Vercel-projektet till `web`.
3. [ ] Kontrollera direkt: `url-parity.ts` mot produktion, smoke-test, rå HTML på en
       eventsida (JSON-LD finns), sitemap, robots och llms.txt.
4. [ ] Search Console: skicka in `/sitemap.xml`. Begär indexering av startsidan och 5
       viktiga sidor.
5. [ ] PostHog: kontrollera att sidvisningar kommer in med `tenant = varberg` och att
       nivån ligger nära en vanlig dag.
6. [ ] Revalidate: publicera ett testevent i admin och kontrollera att det syns.

**Rollback (beslut senast samma kväll vid allvarliga fel):** flytta tillbaka
`ivarberg.nu` till det gamla Vercel-projektet. Behåll det gamla projektet orört i 60 dagar.

## Bevakning (8 veckor)
- [ ] Dagligen i 2 veckor: täckningsrapporten och 404:or i Search Console, smoke-test,
      PostHog.
- [ ] Jämför klick och visningar mot baselinen efter 2, 4 och 8 veckor. En svag dipp de
      första 1–2 veckorna är normal. Om klicken ligger mer än 15 % under efter 4 veckor:
      felsök (canonical, intern länkning, saknade sidor).

## Städning (efter 4 stabila veckor)
- [ ] `admin.ivarberg.nu` → 301 till `admin.inugroup.se`.
- [ ] Ta bort default-värdena `municipality_code DEFAULT '1383'` och `tenant_id DEFAULT
      <varberg>`. All kod sätter dem nu explicit. Kontrollera först med en sökning i
      koden och en veckas loggar.
- [ ] Ta bort `events.area` (text) när ingenting läser den längre. Den gamla Vite-sajten
      var sista läsaren.
- [ ] Ta bort legacy-scrapers vars källor kört `generic` stabilt. Flytta Varbergs
      scraping till VPS:en. GitHub Actions blir manuell reserv.
- [ ] Ta bort `SCRAPER_SOURCES` och andra konstanter som ersatts av databasen.
- [ ] Arkivera `ivarberg-events-hub-main` (read-only på GitHub) och ta bort det gamla
      Vercel-projektet efter 60 dagar.
- [ ] Uppdatera `docs/` (README, SCRAPER_MASTER_GUIDE m.fl.) till den nya strukturen.

## Klart när
- [ ] ivarberg.nu har gått på nya stacken i 8 veckor, med klick på eller över baseline.
- [ ] Inga övergångslösningar (defaults, legacy-kolumner, Vite-repot) finns kvar.
- [ ] Båda sajterna drivs helt från ett repo och en admin.

---

## Startprompt för Claude Code

```
Vi förbereder fas 6 i docs/skalning/FAS-6-ivarberg-overgang.md (läs docs/skalning/README.md
och docs/SKALNINGSPLAN.md §7.9). Kör url-parity mot next.ivarberg.nu och rapportera
avvikelser, jämför PostHog-events mellan gamla och nya sajten, och ta fram en
bytesdagschecklista med exakta kommandon och kontroller. Gör inga domänändringar. Dem
gör jag själv. Efter bytet (separat session): skriv contract-migrationerna (ta bort
defaults, events.area, legacy-kod) med down-delar, efter att ha sökt igenom kod och loggar
efter kvarvarande användning.
```
