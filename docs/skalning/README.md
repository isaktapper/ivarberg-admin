# Skalning: faser och arbetssätt

Strategin och arkitekturen beskrivs i [../SKALNINGSPLAN.md](../SKALNINGSPLAN.md). Den här
mappen är **körplanen**: en fil per fas, i den ordning de ska göras. Varje fil har mål,
beroenden, steg, skydd för ivarberg.nu, rollback, "klart när" och en startprompt som kan
klistras in i en ny Claude Code-session.

**Bakom nätverket:** Inu Tapper AB. Nätverket heter Inu Group. Admin för alla städer blir
**admin.inugroup.se**.

---

## Faser

| Fas | Fil | Tid (ca) | Beror på | Syns för besökare? |
|---|---|---|---|---|
| 0 | [Förberedelser och skyddsnät](FAS-0-forberedelser.md) | 1 v | – | Nej |
| 1 | [Datamodell (bara tillägg)](FAS-1-datamodell.md) | 2 v | 0 | Nej |
| 2 | [Admin för flera städer](FAS-2-admin.md) | 1–2 v | 1 | Nej |
| 3 | [Generisk scraping](FAS-3-scraping.md) | 2–3 v | 1 | Nej |
| 4 | [Ny publik sajt (Next.js), parallellt bygge](FAS-4-ny-publik-sajt.md) | 3–4 v | 1 | Nej (förhandsdomän) |
| 5 | [Falkenberg live, första stad på nya stacken](FAS-5-falkenberg.md) | 1–2 v | 2, 3, 4 | Ja, bara ifalkenberg.nu |
| 6 | [ivarberg.nu flyttar till nya stacken + städning](FAS-6-ivarberg-overgang.md) | 1 dag + 8 v bevakning | 5 (stabil i 3–4 v) | Ja |
| 7 | [Fler städer och playbook](FAS-7-fler-stader.md) | löpande | 6 | Ja |
| 8 | [Försäljning till kommuner](FAS-8-forsaljning.md) | löpande | 5 + data | – |

```
Fas 0 ─► Fas 1 ─┬─► Fas 2 ─┐
                ├─► Fas 3 ─┼─► Fas 5 (Falkenberg) ─► Fas 6 (Varberg) ─► Fas 7
                └─► Fas 4 ─┘          │
                                      └─► Fas 8 (försäljning, när det finns data)
```

**Fas 2, 3 och 4 kan köras parallellt** i separata sessioner och worktrees, eftersom de
rör olika delar av koden: admin-UI (`src/app`, `src/components`), scrapers (`src/lib/scrapers`,
`scripts/`) och den nya publika appen (`apps/web`). Den enda gemensamma ytan är
`packages/core`. Ändringar där görs i små PR:er som mergas tidigt.

**Viktigt val i ordningen:** Falkenberg (fas 5) lanseras **före** Varberg flyttas (fas 6).
Den nya stacken testas skarpt på en sajt utan befintlig ranking att förlora. Varberg byter
först när stacken har gått stabilt i 3–4 veckor.

---

## Bygga vid sidan av utan att störa ivarberg.nu

### Princip 1: produktion rörs bara av ändringar som inte gör något för Varberg

- `main` i det här repot deployar admin och scrapers precis som idag. Publika ivarberg.nu
  körs från `ivarberg-events-hub-main` och **rörs inte alls förrän fas 6**.
- Allt skalningsarbete görs i branches (`scale/fas-1-datamodell` osv.), gärna som Claude
  Code-sessioner i egna worktrees. Den vanliga driften (buggfixar, nya källor,
  Instagram) fortsätter på `main` som vanligt.
- En PR får bara mergas till `main` om den **inte ändrar något för Varberg**: samma data,
  samma sidor, samma jobb. Ny funktionalitet ligger antingen i nya mappar (`apps/web`) som
  inte är kopplade till produktionsdomäner, eller bakom en flagga som är av i produktion.
- Små PR:er. Rebasa skalningsbrancherna mot `main` ofta så att driftfixar följer med.

### Princip 2: databasen ändras i tre steg (expand → migrate → contract)

Alla delar samma Supabase-databas, så databasen är den största risken.

1. **Expand (fas 1–5):** bara tillägg. Nya tabeller och nya kolumner som är nullable eller
   har default. Inga omdöpningar, inga borttagningar, inga skärpta constraints. Gammal kod
   märker ingenting.
2. **Migrate:** ny kod läser och skriver de nya fälten. Backfill av gammal data.
3. **Contract (fas 6):** först när ingen kod använder det gamla tas det bort (t.ex.
   `events.area` som text och `UNIQUE(post_date)` på `instagram_posts`).

**Knepet som gör att gammal kod fungerar:** nya `tenant_id`-kolumner får
`DEFAULT <Varbergs tenant-id>` och `events.municipality_code` får `DEFAULT '1383'`.
Då får allt som dagens Vite-sajt, tipsformulär och admin skapar automatiskt rätt värden,
utan kodändring. Default-värdena tas bort i fas 6.

**Regler för varje migration:**
- [ ] SQL-filen ligger i `database/migrations/scale/NNN_namn.sql` med en **up**-del, en
      **down**-del (kommenterad) och `GRANT`-rader (krävs för nya tabeller från 2026-10-30).
- [ ] Körs först i **staging-projektet** och sedan i produktion (manuellt i SQL-editorn).
- [ ] Ta en **backup** före varje produktionsmigration.
- [ ] Ändra aldrig RLS-policies på befintliga tabeller utan att först verifiera att publika
      sajten fortfarande kan läsa `events` och `organizer_pages` och skriva `event_tips`
      och `newsletter_subscriptions` med anon-nyckeln (kör Vite-sajten lokalt mot staging).
- [ ] Kör smoke-testet (se nedan) direkt efter.

### Princip 3: Varberg är default i koden

- All ny kod hämtar stad via `getActiveTenant()`. Om ingen stad är vald blir det Varberg.
  Funktioner som får en `tenant`-parameter har Varberg som default. Beteendet blir exakt
  som idag tills någon aktivt väljer en annan stad.
- Stadsväljaren i admin visas bara när det finns mer än en stad. Fram till fas 5 finns
  bara Varberg plus en testtenant (`demo`, `status = 'draft'`), och den syns bara för dig.

### Princip 4: nya flöden körs i skuggläge först

- **Scrapers:** den nya pipelinen körs i **skuggläge**. Den skriver till en jämförelserapport
  och inte till `events`. Dagens scrapers fortsätter som vanligt. Varje källa byts sedan
  en i taget (`sources.engine = 'legacy' | 'generic'`) när skuggresultatet är minst lika bra.
- **Publik sajt:** den nya appen körs på `next.ivarberg.nu` med `noindex` tills fas 6.
  Bytet är en domänflytt i Vercel. **Rollback = flytta tillbaka domänen**, vilket tar minuter.
  Behåll det gamla Vercel-projektet i 60 dagar efter bytet.
- **Jobb:** dagens GitHub Actions-scraper och Instagram-cron körs oförändrade. Nya jobb
  (VPS-worker, Instagram per stad) läggs till bredvid och tar bara städer som inte är
  Varberg, tills Varberg flyttas över.

### Princip 5: skyddsnät som byggs först (fas 0)

- **Smoke-test** (`scripts/smoke-test.ts`) körs efter varje merge och dagligen i GitHub
  Actions. Kontrollerar att ivarberg.nu svarar på nyckel-URL:er, att det finns
  publicerade events kommande 7 dagar, att senaste scraping lyckades för mindre än 30 h
  sedan, att dagens Instagram-post finns (efter kl 12) och att admin-inloggningen svarar.
  Larmar via befintlig ntfy/e-post.
- **Uptime-övervakning** av ivarberg.nu och admin (gratis hos t.ex. UptimeRobot eller
  Better Stack).
- **SEO-baseline** från Search Console innan något publikt ändras.

### Princip 6: tidsfönster

- Inga produktionsbyten (migrationer, domänflyttar, nya jobb) på fredagar, helger eller
  dagarna före stora evenemangshelger.
- En riskabel ändring i taget. Vänta minst ett dygn (ett helt scraper- och Instagram-varv)
  innan nästa.

---

## Statusöversikt

Uppdatera tabellen när faser startar och blir klara.

| Fas | Status | Branch/PR | Kommentar |
|---|---|---|---|
| 0 | Ej startad | | |
| 1 | Ej startad | | |
| 2 | Ej startad | | |
| 3 | Ej startad | | En prototyp av den generiska scrapern finns som förslag på separat session |
| 4 | Ej startad | | |
| 5 | Ej startad | | |
| 6 | Ej startad | | |
| 7 | Ej startad | | |
| 8 | Ej startad | | |
