# Fas 1: Datamodell (bara tillägg)

**Mål:** databasen förstår städer och kommuner. Varberg finns som tenant nummer 1, och
all befintlig data är märkt med Varberg. **Ingen befintlig kod behöver ändras för att
fortsätta fungera.**

**Tid:** ca 2 veckor · **Beror på:** fas 0 · **Därefter parallellt:** fas 2, 3, 4

Detaljerad datamodell: [SKALNINGSPLAN.md §3](../SKALNINGSPLAN.md#3-datamodell).

---

## Steg

### Migrationer (i `database/migrations/scale/`, staging först, sedan produktion)
- [ ] `001_municipalities.sql`: tabellen `municipalities (code, name, county, slug)` med
      alla 290 kommuner (seed från SCB:s kommunlista).
- [ ] `002_tenants.sql`: `tenants`, `tenant_members`, `platform_admins`. Lägg in
      Varberg (`slug 'varberg'`, `municipality_codes {'1383'}`, `primary_domain
      'ivarberg.nu'`, `status 'live'`) och tenanten `demo` (`status 'draft'`). Lägg in dig
      som platform admin.
- [ ] `003_areas.sql`: `areas`, seedad från `src/lib/services/areaResolver.ts` (alla
      områden, venue-nyckelord, ortnamn och postnummerintervall för 1383).
- [ ] `004_sources.sql`: `sources` med kolumnen `engine text default 'legacy'`, seedad från
      `SCRAPER_CONFIGS` (5 källor, `default_municipality_code '1383'`, Visit Varberg
      `is_aggregator = true`).
- [ ] `005_content.sql`: `places` och `content_blocks`. Seeda Varberg från publika repots
      `api/_lib/recommendations.ts` och `api/_lib/copy.ts` (via ett script, se nedan).
- [ ] `006_tenant_columns.sql`: tillägg på befintliga tabeller:
  - `events.municipality_code text default '1383'` + index
  - `events.area_id int references areas` (nullable). **Kolumnen `area` (text) behålls.**
  - `organizers.municipality_code text` (nullable)
  - `tenant_id uuid not null default '<varberg-id>' references tenants` på
    `organizer_pages`, `event_tips`, `hero_featured_events`, `instagram_posts`,
    `newsletter_subscriptions`, `email_recipients`
  - Ett nytt unikt index `instagram_posts (tenant_id, post_date)` **bredvid** det
    befintliga `UNIQUE(post_date)`, som får ligga kvar till fas 5.
- [ ] RLS **bara på de nya tabellerna** i den här fasen: anon får läsa tenants med
      `status = 'live'`, `municipalities`, `areas` och publicerade `places`/`content_blocks`.
      Platform admins får allt. Policies på befintliga tabeller rörs inte förrän i fas 2.

### Kod
- [ ] `packages/core`: zod-scheman `TenantFeatures` och `TenantTheme`
      ([§3.5](../SKALNINGSPLAN.md#35-feature-flags-och-tema-zod-schema-i-packagescore)),
      typer för de nya tabellerna och kommunkonstanter.
- [ ] `src/types/database.ts`: nya fält som optional.
- [ ] `scripts/seed-content-from-public-repo.ts`: läser recommendations och copy från
      `../ivarberg-events-hub-main/api/_lib/` och skriver till `places` och `content_blocks`.
- [ ] `src/lib/services/municipalityResolver.ts` + enhetstester (prioritetsordning
      enligt [§6.4](../SKALNINGSPLAN.md#64-kommun-resolver)). **Kopplas inte in i
      importern än.**
- [ ] `scripts/backfill-municipality.ts --dry-run`: kör resolvern på alla events och
      skriver en rapport (hur många som blir 1383, en annan kommun eller okänt). Events
      som resolvern placerar utanför Varberg **listas för manuell granskning** och
      ändras inte automatiskt.
- [ ] `scripts/backfill-area-id.ts`: sätter `area_id` från dagens `area`-text.

## Skydd för ivarberg.nu
- Bara tillägg. Default-värden gör att gammal kod som skapar events, tips och
  Instagram-poster automatiskt får Varberg.
- Ingen RLS-ändring på befintliga tabeller.
- Kör smoke-testet och en manuell scraping efter varje produktionsmigration. Kontrollera
  att nya events får `municipality_code = '1383'` och att ett tips från ivarberg.nu får
  Varbergs `tenant_id`.

## Rollback
- Varje migration har en down-del (drop av nya kolumner och tabeller). Ingen befintlig data
  skrivs över, så en rollback förlorar bara nya fält.

## Klart när
- [ ] Alla migrationer har körts i staging och i produktion.
- [ ] Smoke-testet är grönt, och scraping, Instagram och tipsformuläret fungerar som förut.
- [ ] Rapporten från backfill-municipality visar hur stor andel som kan placeras. Mål:
      minst 95 % blir 1383, resten granskas.
- [ ] `places` och `content_blocks` innehåller allt innehåll som idag ligger i kodfilerna.

---

## Startprompt för Claude Code

```
Vi genomför fas 1 i docs/skalning/FAS-1-datamodell.md (läs docs/skalning/README.md,
särskilt princip 2 om expand/contract, och docs/SKALNINGSPLAN.md §3). Skriv migrationerna
001–006 i database/migrations/scale/ med up, down och GRANT. Jag kör dem manuellt, så
generera ingen kod som kör dem mot produktion. Gör sedan kodstegen: packages/core-scheman,
typer, seed-scriptet för innehåll, municipalityResolver med tester (inte inkopplad i
importern) samt backfill-scripten med --dry-run. Ingen befintlig RLS-policy och ingen
befintlig kolumn får ändras. Branch: scale/fas-1. Avsluta med en checklista över vilka
SQL-filer jag ska köra, i vilken ordning, först i staging.
```
