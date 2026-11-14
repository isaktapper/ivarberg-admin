# Fas 2: Admin för flera städer

**Mål:** admin.inugroup.se kan hantera flera städer: stadsväljare, inställningar,
innehåll, användare och jobb per stad. För Varberg ser allt ut och beter sig som idag.

**Tid:** ca 1–2 veckor · **Beror på:** fas 1 · **Parallellt med:** fas 3, 4

Detaljer: [SKALNINGSPLAN.md §4](../SKALNINGSPLAN.md#4-påverkan-på-den-befintliga-appen-admin),
[§5.2](../SKALNINGSPLAN.md#52-llm-kostnad-per-stad), [§9](../SKALNINGSPLAN.md#9-instagram-och-sociala-kanaler),
[§10](../SKALNINGSPLAN.md#10-e-post-och-notiser).

---

## Steg

### Grund
- [ ] `getActiveTenant()` (server) läser cookien `active_tenant`, kontrollerar medlemskap
      och har Varberg som default. En React-context för klientkomponenter.
- [ ] Hjälpfunktioner för filtrerade frågor: events filtreras på
      `municipality_code in tenant.municipality_codes`, övriga tabeller på `tenant_id`.
- [ ] Stadsväljare i `Sidebar.tsx`. **Visas bara om användaren har fler än en stad.**

### Sidor
- [ ] Events (lista, granska, dubbletter, statistik), hero, tips, Instagram, notiser och
      arrangörssidor filtreras på aktiv stad.
- [ ] Granskningskön får fliken "Okänd kommun".
- [ ] Ny: **Sajtinställningar** (tema, flaggor, SEO, kontakt) med zod-validering och
      kontrastkontroll av färger.
- [ ] Ny: **Innehåll** (platser och textblock) med bilduppladdning.
- [ ] Ny: **Användare** (bjud in via Supabase, roller `tenant_admin`/`editor`).
- [ ] Ny: **Städer** (bara platform admin): skapa tenant med kommun, domän och status.
- [ ] Scrapers-sidan läser källor från `sources`. Körningen sker fortfarande via det
      gamla registret (`engine = 'legacy'`).

### Tjänster
- [ ] `event-importer.ts`: kopplar in `municipalityResolver`, som sätter
      `municipality_code` explicit (`null` → fliken "Okänd kommun"). `area_id` sätts via
      `areas`-tabellen för kommunen. **Text-`area` skrivs fortfarande**, eftersom Vite-sajten
      läser den.
- [ ] AI-prompter blir mallar med `{city_name}`/`{site_name}`: `organizer-ai-generator.ts`
      (rätta även `ivarberg.se` → rätt domän), `instagram-post-runner.ts`,
      `aiCategorizer.ts` och `rewrite-description`.
- [ ] `openai-client.ts`: `tenant` som PostHog-property på alla AI-anrop.
- [ ] Instagram: runnern tar `tenant` som argument. Cron och workflow loopar över tenants
      med `features.instagram = true` (bara Varberg i den här fasen). Make-payloaden får
      `tenant` och `instagram_account`. Nuvarande env-värden används som fallback för
      Varberg.
- [ ] E-post: rapport per tenant och en samlad rapport till plattformen.
- [ ] `ADMIN_BASE_URL` → `https://admin.inugroup.se` (godkännandelänkar). Gamla länkar
      till admin.ivarberg.nu fungerar fortfarande.

### RLS på befintliga tabeller
- [ ] Policies för `tenant_members` (läs och skriv inom egen stad) och platform admins
      (allt).
- [ ] **Anon-policies som Vite-sajten använder får inte ändras.** Verifiera mot staging med
      Vite-sajten lokalt: startsida, eventsida, arrangörssida, tipsformulär, nyhetsbrev.
- [ ] `scripts/test-tenant-isolation.ts`: en testanvändare i `demo` får inte kunna läsa
      eller skriva något från Varberg.

## Skydd för ivarberg.nu
- Varberg är default överallt, och stadsväljaren är dold för användare med en stad.
- Instagram-flödet för Varberg får samma payload som idag plus två fält. Testa i
  Make med `DRY_RUN` innan merge.
- Merga i delar: (1) grund + filtrering, (2) nya sidor, (3) tjänster, (4) RLS. Kör
  smoke-testet och vänta ett dygn mellan delarna.

## Rollback
- Kod: reverta respektive PR. RLS: down-SQL som återställer tidigare policies (spara de
  gamla policyerna i migrationsfilen innan de ändras).

## Klart när
- [ ] Du kan växla mellan Varberg och `demo`, och allt i `demo` är tomt eller separat.
- [ ] Isoleringstestet går igenom.
- [ ] Varbergs dagliga scraping, Instagram och e-postrapport fungerar som tidigare.
- [ ] PostHog visar AI-kostnad uppdelad på `tenant`.

---

## Startprompt för Claude Code

```
Vi genomför fas 2 i docs/skalning/FAS-2-admin.md (läs docs/skalning/README.md och
docs/SKALNINGSPLAN.md §4, §5.2, §9, §10). Fas 1 är klar: tenants, sources, areas, places
och content_blocks finns, och befintliga tabeller har tenant_id/municipality_code. Bygg
admin för flera städer enligt checklistan. Varberg ska vara default överallt och se ut
precis som idag, och stadsväljaren visas bara för användare med fler än en stad. Följ
designsystemet i docs/DESIGN_SYSTEM.md för nya sidor. Dela upp i fyra PR:er (grund +
filtrering, nya sidor, tjänster, RLS) från branchen scale/fas-2. RLS-ändringar levereras
som SQL-filer i database/migrations/scale/ som jag kör manuellt, med de gamla policyerna
sparade i down-delen.
```
