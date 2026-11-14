# Fas 0: Förberedelser och skyddsnät

**Mål:** allt som behövs för att bygga säkert finns på plats innan någon kod för flera
städer skrivs. Ingenting ändras för besökare eller i den dagliga driften.

**Tid:** ca 1 vecka · **Beror på:** – · **Kan köras parallellt med:** –

---

## Steg

### Saker du gör själv (konton, köp, DNS)
- [ ] Kontrollera och köp domänerna `ifalkenberg.nu`, `ihalmstad.nu` och `ikungsbacka.nu`.
      Säkerställ att `inugroup.se` ägs av Inu Tapper AB.
- [ ] Uppgradera Vercel till **Pro**. Det krävs för kommersiellt bruk.
- [ ] Uppgradera Supabase till **Pro** för dagliga backuper. Överväg PITR inför fas 6.
- [ ] Skapa ett **staging-projekt i Supabase** (gratisnivå) i EU-region.
- [ ] Lägg till `admin.inugroup.se` som **extra domän** på admin-projektet i Vercel.
      admin.ivarberg.nu fortsätter fungera.
- [ ] Supabase Auth → URL Configuration: lägg till `https://admin.inugroup.se/**` i
      Redirect URLs.
- [ ] Verifiera `inugroup.se` i Resend (DNS-poster för SPF och DKIM).
- [ ] Exportera **SEO-baseline** från Search Console för ivarberg.nu: klick, visningar och
      CTR per sida för de senaste 3 månaderna, indexerade sidor och topp 200-sökfrågor.
      Spara under `docs/skalning/baseline/`.
- [ ] Sätt upp uptime-övervakning av `https://ivarberg.nu`, `/idag`,
      `/api/sitemap.xml` och `https://admin.inugroup.se/login`.

### Kod (Claude Code-session)
- [ ] `scripts/smoke-test.ts` + `.github/workflows/smoke-test.yml` (dagligen 07:00 svensk
      tid och manuellt). Kontroller enligt [README, princip 5](README.md#princip-5-skyddsnät-som-byggs-först-fas-0).
      Larm via befintliga `alert-service`/`ntfy`.
- [ ] Byt avsändare i `src/lib/services/email-service.ts` till `notiser@inugroup.se`
      (via env `EMAIL_FROM` med nuvarande värde som fallback).
- [ ] **pnpm-workspace:** `pnpm-workspace.yaml` med `packages: ['apps/*', 'packages/*']`,
      och ett tomt `packages/core` (package.json, tsconfig, `src/index.ts`). Admin
      ligger kvar i roten och importerar `@inu/core`. Verifiera att `pnpm install
      --frozen-lockfile` fungerar i GitHub Actions och att Vercel bygger.
- [ ] Script för att kopiera schemat till staging: `pg_dump --schema-only` mot
      produktionens session pooler-URL och `psql` mot staging. Om CLI/nätverk inte når
      projektet: kör `database/migrations` i ordning och komplettera för hand. Lägg
      dessutom ett seed-script som kopierar ~200 events, alla organizers och lite tips
      till staging.
- [ ] `.env.staging` (inte incheckad) med staging-nycklar. Kontrollera att Vite-sajten
      kan köras lokalt mot staging (`VITE_SUPABASE_URL` osv.), eftersom det behövs för att
      testa RLS i fas 1–2.
- [ ] Skapa mappen `database/migrations/scale/` med en README som beskriver reglerna
      för migrationer (up/down/GRANT/staging först).

## Skydd för ivarberg.nu
- Inga databasändringar i produktion.
- Workspace-ändringen är den enda riskabla kodändringen. Verifiera med preview-deploy och
  en manuell körning av `daily-scraper` (`workflow_dispatch`) innan merge.

## Rollback
- Workspace: reverta PR:en.
- Domän: ta bort `admin.inugroup.se` från Vercel. Ingen påverkan på admin.ivarberg.nu.

## Klart när
- [ ] Smoke-testet går grönt dagligen och larmar om en kontroll fallerar (testa genom att
      peka det mot en felaktig URL).
- [ ] Det går att logga in på admin.inugroup.se.
- [ ] Staging-databasen har samma schema som produktion och har testdata.
- [ ] Admin bygger med `@inu/core` från workspacen, och scraper- och Instagram-jobben
      fungerar som vanligt.
- [ ] SEO-baselinen är sparad.

---

## Startprompt för Claude Code

```
Vi genomför fas 0 i docs/skalning/FAS-0-forberedelser.md (läs även docs/skalning/README.md
och docs/SKALNINGSPLAN.md för sammanhang). Gör kodstegen under "Kod": smoke-test-script
och workflow, EMAIL_FROM i email-service, pnpm-workspace med tomt packages/core (@inu/core)
som admin importerar, schema-kopiering och seed till staging, samt
database/migrations/scale/README.md. Admin ska ligga kvar i repots rot. Ingenting får
ändras i produktionsdatabasen eller i beteendet för ivarberg.nu. Verifiera att `pnpm build`
och `pnpm install --frozen-lockfile` fungerar. Jobba i en branch scale/fas-0 och öppna en PR.
```
