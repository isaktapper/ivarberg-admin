# Fas 3: Generisk scraping

**Mål:** en ny källa är en rad i `sources`, inte en ny klass. En ny stad får data inom en
arbetsdag, och Firecrawl-beroendet försvinner nästan helt.

**Tid:** ca 2–3 veckor · **Beror på:** fas 1 (`sources`) · **Parallellt med:** fas 2, 4

Detaljer: [SKALNINGSPLAN.md §6](../SKALNINGSPLAN.md#6-scraping-i-stor-skala).

---

## Steg

### Pipeline
- [ ] `src/lib/scrapers/generic/`: strategierna JSON-LD → WP Tribe/ICS/RSS →
      plattformsadaptrar → LLM-extraktion. Utdata är `ScrapedEvent[]`. (Om prototypsessionen
      "Prototyp: generisk scraper testad mot Falkenberg" har körts: bygg vidare på den.)
- [ ] `scraper-registry.ts` läser `sources`: `engine = 'legacy'` → befintlig klass,
      `engine = 'generic'` → pipelinen.
- [ ] Ändringsdetektering via `sources.last_content_hash`.
- [ ] Dubbletter mellan källor: fingeravtryck av normaliserad titel, datum och kommun.
      `is_aggregator` ersätter att Visit Varberg sorteras sist.
- [ ] Kostnadstak per körning och källa (LLM-anrop, Firecrawl-sidor).
- [ ] Hälsolarm: färre events än `expected_weekly_events`, eller ingen lyckad körning på
      3 dagar.

### Skuggläge
- [ ] `scripts/run-scrapers.ts --shadow`: kör den generiska pipelinen för källor med
      `engine = 'legacy'` och skriver en jämförelse (hittade events, fält som saknas,
      skillnader) till `scraper_shadow_reports` eller en JSON-fil. **Skriver inte till
      `events`.**
- [ ] Jämför i minst en vecka per källa. Byt `engine` till `generic` en källa i taget när
      resultatet är minst lika bra.

### Körmiljö
- [ ] VPS med svensk/nordisk IP (Hetzner), Node, Playwright, cron och samma `.env` som
      GitHub Actions. User-Agent med kontaktadress.
- [ ] Först: VPS:en kör **bara** skuggläge och källor från andra kommuner. Dagens
      GitHub Actions-scraper för Varberg rörs inte.
- [ ] När alla Varbergskällor är på `generic` och VPS:en gått stabilt i 2 veckor:
      Varberg flyttas till VPS:en, och GitHub Actions blir manuell reserv.

### Discovery och admin
- [ ] `scripts/discover-sources.ts --municipality=<kod>` enligt
      [§6.5](../SKALNINGSPLAN.md#65-upptäcka-källor-för-en-ny-stad). Skapar `sources` med
      `enabled = false`.
- [ ] Admin: "Lägg till källa" (URL → torrkörning → förhandsvisning → spara) och
      hälsostatus per källa. Samordna med fas 2, som äger Scrapers-sidan.

## Skydd för ivarberg.nu
- Varbergs källor kör `legacy` tills skuggläget visar paritet. Byte sker per källa och går
  att backa genom att sätta `engine = 'legacy'` igen.
- Discovery och nya källor för andra kommuner skriver events med andra kommunkoder, så
  de syns inte på ivarberg.nu (Vite-sajten behöver filtrera på `municipality_code`, se
  nedan).

> **Viktigt:** dagens Vite-sajt visar **alla** publicerade events. Innan första
> event från en annan kommun publiceras måste ivarberg.nu filtrera på
> `municipality_code = '1383'`. Det är en liten PR i `ivarberg-events-hub-main`
> (events-frågorna i `src/` + `api/_lib/events.ts` + sitemapen) och den **enda**
> ändringen i Vite-repot före fas 6. Gör den innan Falkenbergs källor aktiveras.

## Rollback
- `engine = 'legacy'` per källa. Stäng av VPS-cron. Avaktivera källor (`enabled = false`).

## Klart när
- [ ] Minst 70 % av en ny kommuns events hittas utan specialkod (testa på Falkenberg).
- [ ] Alla Varbergskällor går på `generic`, eller har dokumenterats som skäl att behålla
      `legacy`.
- [ ] Firecrawl-förbrukningen är nära noll under en vanlig vecka.
- [ ] ivarberg.nu filtrerar på kommun.

---

## Startprompt för Claude Code

```
Vi genomför fas 3 i docs/skalning/FAS-3-scraping.md (läs docs/skalning/README.md, särskilt
princip 4 om skuggläge, och docs/SKALNINGSPLAN.md §6). Tabellen sources finns med
engine='legacy' för Varbergs 5 källor. Bygg den generiska pipelinen, låt
scraper-registry läsa sources, implementera skuggläget (--shadow, skriver inte till
events), ändringsdetektering, dubbletthantering mellan källor, kostnadstak, hälsolarm och
discovery-scriptet. Dagens Varbergsscraping i GitHub Actions får inte ändra beteende. Ge
mig också en separat PR till ivarberg-events-hub-main som filtrerar alla events-frågor
och sitemapen på municipality_code = '1383'. Branch: scale/fas-3.
```
