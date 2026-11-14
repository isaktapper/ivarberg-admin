# Fas 5: Falkenberg live, första stad på nya stacken

**Mål:** ifalkenberg.nu är live på den nya stacken (admin för flera städer, generisk
scraping, `apps/web`). Stacken testas skarpt med riktig trafik på en sajt som inte har
någon ranking att förlora, innan Varberg flyttar.

**Tid:** ca 1–2 veckor att lansera, sedan 3–4 veckors drift innan fas 6 · **Beror på:** fas 2, 3, 4

---

## Steg

### Före lansering
- [ ] ivarberg.nu filtrerar på `municipality_code = '1383'` (PR från fas 3 mergad och
      verifierad). **Måste vara klart innan något Falkenbergsevent publiceras.**
- [ ] Skapa tenanten `falkenberg` i admin (Städer): kommun 1382, domän `ifalkenberg.nu`,
      `status 'draft'`.
- [ ] Tema: logga, färger, hero-bilder (per säsong), OG-bild, favicon.
- [ ] `areas` för 1382 (t.ex. Centrum, Skrea, Ullared, Glommen, Vessigebro, Övriga
      kommunen). Verifiera mot postnummer.
- [ ] Kör `discover-sources --municipality=1382`, granska och aktivera källorna. Kör
      skuggläge i några dagar och aktivera sedan skarpt.
- [ ] Innehåll enligt checklistan i [SKALNINGSPLAN.md §8](../SKALNINGSPLAN.md#8-innehåll-per-stad):
      minst 20 platser med bild, guidetexter, FAQ och "om oss" (Inu Group i footer).
- [ ] Granska den första veckans events. Justera kvalitetströskeln
      (`autoPublishMinQuality`) för staden.

### Lansering
- [ ] Lägg till `ifalkenberg.nu` på `web`-projektet i Vercel och peka DNS dit.
- [ ] Indexering påslagen **bara för den här tenanten** (`noindex` styrs per tenant och
      inte globalt, så att `next.ivarberg.nu` fortfarande har `noindex`).
- [ ] Sätt `status 'live'`.
- [ ] Search Console: lägg till domänen, skicka in sitemapen.
- [ ] PostHog: dashboard filtrerad på `tenant = falkenberg`.
- [ ] Google Maps-nyckel: lägg till `ifalkenberg.nu` i referrer-begränsningen.

### Instagram
- [ ] Skapa `@ifalkenberg.nu` och koppla kontot i Make.
- [ ] Make: router på `tenant` i det befintliga scenariot. Kontrollera Makes
      operationsgräns.
- [ ] **Migration:** ta bort det gamla `UNIQUE(post_date)` på `instagram_posts`. Det
      nya indexet `(tenant_id, post_date)` från fas 1 tar över. Görs först nu, eftersom
      det behövs först när två städer postar samma dag.
- [ ] `features.instagram = true` för Falkenberg. Testa med `DRY_RUN` först.

### Drift i 3–4 veckor
- [ ] Logga alla buggar och fixa dem i stacken. De drabbar inte Varberg.
- [ ] Mät: events per vecka, andel automatiskt publicerade, indexerade sidor, besökare,
      Core Web Vitals (fältdata), AI-kostnad per stad, din tid per vecka.
- [ ] Notera allt som var manuellt eller krångligt. Det blir underlaget för playbooken i
      fas 7.

## Skydd för ivarberg.nu
- ivarberg.nu filtrerar på kommun innan Falkenberg får events.
- Ändringen av Instagram-constrainten testas i staging och körs en vardag. Varbergs post
  den dagen kontrolleras manuellt.
- Falkenbergs källor körs på VPS:en. Varbergs scraping är oförändrad.

## Rollback
- Ta ifalkenberg.nu offline (`status 'paused'` → 404 eller underhållssida), eller ta bort
  domänen från Vercel. Påverkar inte Varberg.

## Klart när
- [ ] ifalkenberg.nu har varit live i 3–4 veckor utan allvarliga incidenter.
- [ ] Det finns minst 50 kommande events, och innehållet är komplett.
- [ ] Sajten är indexerad i Google, och Core Web Vitals är godkända.
- [ ] Tiden för att sätta upp staden är dokumenterad.

---

## Startprompt för Claude Code

```
Vi genomför fas 5 i docs/skalning/FAS-5-falkenberg.md (läs docs/skalning/README.md och
docs/SKALNINGSPLAN.md §8 och §9). Fas 2–4 är klara. Hjälp mig sätta upp tenanten
falkenberg: områden för kommun 1382 med postnummer, kör discover-sources och sammanfatta
källorna för mitt godkännande, ta fram AI-utkast på platser och guidetexter som
opublicerade poster i admin, skriv migrationen som tar bort UNIQUE(post_date) på
instagram_posts (med down-del) och gör per-tenant-noindex i apps/web. Kontrollera först
att ivarberg.nu filtrerar på municipality_code. Om den inte gör det, stanna och säg till.
```
