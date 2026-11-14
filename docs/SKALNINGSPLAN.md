# Skalningsplan: från ivarberg.nu till i{stad}.nu

*Skriven 2026-10-20. Täcker arkitektur, datamodell, påverkan på befintlig kod, PostHog,
SEO-ombyggnad av publika sajten, scraping, innehåll, sociala medier, drift, försäljning
och en fasplan. Uppdatera dokumentet när beslut ändras.*

*Uppdaterad 2026-10-20: Inu Tapper AB står bakom nätverket, admin flyttar till
admin.inugroup.se. Fasplanen är utbruten till [docs/skalning/](skalning/README.md),
med en körbar fil per fas och principerna för att bygga utan att störa driften av
ivarberg.nu.*

---

## 0. Sammanfattning

**Målet:** samma plattform driver ivarberg.nu, ifalkenberg.nu, ihalmstad.nu osv. Varje
sajt är egen utåt (egen domän, design, innehåll, SEO, Instagram), men allt körs av **en
kodbas och en databas**. När modellen är bevisad i 2–3 städer säljs samma plattform som
white label till kommuner, destinationsbolag och citysamverkan.

**Beslut som redan är fattade:**

| Beslut | Val |
|---|---|
| Bolag och nätverk | **Inu Tapper AB** står bakom. Nätverket heter **Inu Group** (inugroup.se) |
| Kodbaser | **En** (admin i repots rot som idag + `apps/web` + `packages/core` som pnpm-workspace) |
| Databaser | **En** Supabase-databas, isolering via RLS |
| Sajter | **En sajt per kommun**, egen domän (ivarberg.nu, ifalkenberg.nu …) |
| Events | **Ett event tillhör en kommun** och visas på en sajt. Inga delade events mellan sajter |
| Mellan sajter | Länkar ("Händer i närheten", nätverk i footern), styrt av flagga |
| Anpassning per kund | Data i databasen: tema, feature flags, innehåll. **Aldrig `if (tenant === 'x')`** |
| Scrapers | Globala. Varje källa körs en gång och events sorteras till rätt kommun |
| Publika sajten | Görs om till **Next.js (App Router) med serverrendering** |
| Admin | **En** admin på **admin.inugroup.se** med stadsväljare. Kommunkunder loggar in och ser bara sin stad. admin.ivarberg.nu fortsätter fungera under övergången |

**Ordning i korthet:** grunddata (tenants + kommun på events) → admin multi-tenant →
publika sajten till Next.js (SEO) parallellt med generisk scraping → stad nr 2 →
playbook för fler städer → försäljning till kommuner med riktiga siffror.

---

## 1. Nuläge (inventering 2026-10-20)

### 1.1 Två repon

| Repo | Stack | Roll |
|---|---|---|
| `ivarberg_admin` | Next.js 16, Supabase, OpenAI, PostHog (server) | Admin (Kustkontoret), scrapers, AI-tjänster, Instagram, cron |
| `ivarberg-events-hub-main` | Vite + React SPA, react-router, react-helmet, posthog-js | Publika ivarberg.nu |

### 1.2 Databastabeller (används i båda repona)

`events`, `organizers`, `organizer_pages`, `event_tips`, `hero_featured_events`,
`instagram_posts`, `newsletter_subscriptions`, `email_recipients`, `system_alerts`,
`scraper_logs`, `scraper_progress_logs`, `scraper_schedules`, `duplicate_event_logs`,
`event_audit_log`.

Inga tabeller har tenant- eller kommunbegrepp. `events.area` är Varbergsspecifikt
(se `areaResolver.ts`). `instagram_posts` har `UNIQUE(post_date)`, som måste bli per stad.

### 1.3 Schemalagda jobb

| Jobb | Var | Schema |
|---|---|---|
| Scraping | GitHub Actions `daily-scraper.yml` → `scripts/run-scrapers.ts` | 05:00 UTC |
| Instagram | Vercel cron `/api/cron/instagram-post` (06, 09) + GH Actions backup | dagligen |

### 1.4 Hårdkodat för Varberg

- **Admin:** "Varberg" på ~290 ställen. De tyngsta: `scraper-registry.ts` (källor i kod),
  `constants.ts` (`SCRAPER_SOURCES`), `areaResolver.ts` (områden, venues, postnummer),
  `event-id-generator.ts` (slug-prefix), AI-prompter i `organizer-ai-generator.ts` och
  `instagram-post-runner.ts`, avsändare i `email-service.ts` (`onboarding@resend.dev`),
  `ADMIN_BASE_URL`-fallbacks.
- **Publika sajten:** 23 filer i `src/`, plus `index.html` (statisk meta för Varberg på
  alla sidor), `vercel.json` (rewrites med `/evenemang-varberg` m.fl.),
  `api/_lib/constants.ts` (`SITE`, områden), `api/_lib/copy.ts` (guidetexter),
  `api/_lib/recommendations.ts` (restauranger, stränder, sevärdheter som kod),
  `public/llms.txt`, `public/robots.txt`.

### 1.5 Env-variabler som förutsätter en enda sajt

`MAKE_WEBHOOK_URL`, `MAKE_WEBHOOK_API_KEY`, `NTFY_TOPIC`, `INSTAGRAM_APPROVAL_FLOW`,
`INSTAGRAM_AUTO_PUBLISH`, `ADMIN_EMAIL`, `ALERT_EMAIL`, `ALERT_PHONE_NUMBER`,
`ADMIN_BASE_URL`, `VITE_PUBLIC_POSTHOG_KEY` (en PostHog-nyckel för publika sajten).
Allt som är "per stad" ska flyttas till tenant-config. Det som är "för Isak/plattformen"
(alerts, nycklar) får ligga kvar som env.

### 1.6 SEO-läget idag

- Startsidan, eventsidor (`/event/:id`), arrangörssidor och `/tips` är **klientrenderade**.
  Rå HTML är en tom `<div id="root">` med Varbergs standardmeta. Google renderar JS
  (därför rankar ni), men AI-crawlers och Googles citeringslager ser ingenting.
  **Eventsidorna, alltså majoriteten av URL:erna, är osynliga utan JS.**
- Landningssidorna (`/idag`, `/i-helgen`, `/kategori/*`, `/omrade/*`, guiderna) är redan
  serverrenderade som Vercel-funktioner som bygger HTML-strängar (`api/_lib/render.ts`).
  De fungerar bra, men designen finns nu i **två implementationer** (React-komponenter
  och HTML-strängar) som måste hållas i synk.
- Bra som redan finns: dynamisk sitemap, `llms.txt`, robots som släpper in AI-crawlers,
  JSON-LD på landningssidorna.

---

## 2. Målarkitektur

```
                      ┌──────────────────────────────────────────┐
ivarberg.nu ─────┐    │  apps/web  (Next.js, Vercel-projekt "web") │
ifalkenberg.nu ──┼──► │  middleware: host → tenant                │
ihalmstad.nu ────┤    │  rewrite → /[tenant]/...  (ISR per tenant)│
evenemang.x.se ──┘    └───────────────┬──────────────────────────┘
                                      │ läser
admin.inugroup.se ──► admin (rot) ────┤ (Next.js, Vercel-projekt "admin")
                      stadsväljare    │
                                      ▼
                      ┌──────────────────────────────┐
                      │ Supabase (en databas, RLS)    │
                      │ tenants, events(kommun), …    │
                      └──────────────▲───────────────┘
                                     │ skriver
                      Scraper-worker (VPS med svensk IP / GH Actions)
                      sources-tabell → pipeline → kommun-resolver → events
```

### 2.1 Monorepo

```
ivarberg_admin/                (repots rot = admin, som idag, flyttas INTE)
├─ src/                        admin (oförändrad plats)
├─ scripts/                    scrapers, backfills (som idag)
├─ apps/
│  └─ web/                     ny Next.js-app (ersätter ivarberg-events-hub-main)
├─ packages/
│  └─ core/                    delat: databastyper, tenant-schema (zod), kategorier,
│                              datumlogik, JSON-LD-byggare, kommunkoder
└─ pnpm-workspace.yaml         packages: ['apps/*', 'packages/*']
```

Admin ligger kvar i roten. Att flytta den till `apps/admin` ger ingen funktion men
riskerar att bryta Vercel-bygget, GitHub Actions-sökvägar och `tsx`-scripten mitt i
den dagliga driften. Flytten kan göras senare, i en egen PR, när allt annat är klart.
Två Vercel-projekt pekar på samma repo: `admin` (rot) och `web` (`apps/web`).
Alla stadsdomäner läggs på `web`-projektet.

### 2.2 Tenant-upplösning (web)

1. `middleware.ts` läser `host`, slår upp tenant via domän (cachad i minnet eller Edge
   Config, inte en DB-fråga per request).
2. Requesten skrivs om internt: `ifalkenberg.nu/event/abc` → `/falkenberg/event/abc`.
3. Alla routes ligger under `app/[tenant]/…`. Cachen (ISR) blir då per tenant av sig själv.
4. Okänd domän → 404. `www.` → 301 till apex.
5. Om ett event tillhör en annan kommun än domänen (t.ex. gammal länk) → **301 till rätt
   domän**.

### 2.3 Lokal utveckling

Använd `varberg.localhost:3000` och `falkenberg.localhost:3000` (fungerar utan
hosts-fil i moderna webbläsare). Lägg till `localhost`-domäner i tenant-tabellen eller i
en dev-mappning i middleware.

---

## 3. Datamodell

### 3.1 Kommunkoder

Använd SCB:s kommunkoder som stabil nyckel: Varberg `1383`, Falkenberg `1382`,
Halmstad `1380`, Kungsbacka `1384`, Laholm `1381`, Hylte `1315`. Lägg en tabell
`municipalities (code, name, county, slug)` och fyll den med alla 290 kommuner en gång.

### 3.2 Nya tabeller

```sql
-- Sajter/kunder
create table tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,            -- 'varberg'
  name          text not null,                   -- 'iVarberg'
  city_name     text not null,                   -- 'Varberg' (för texter/prompter)
  municipality_codes text[] not null,            -- {'1383'} (lista för framtida regionkunder)
  primary_domain text unique not null,           -- 'ivarberg.nu'
  extra_domains text[] default '{}',             -- {'evenemang.varberg.se'}
  theme         jsonb not null default '{}',     -- färger, logga, typsnitt, hero-bilder
  features      jsonb not null default '{}',     -- feature flags, valideras med zod
  seo           jsonb not null default '{}',     -- titlar, beskrivningar, guide-slugs
  contact       jsonb not null default '{}',     -- e-post, sociala konton
  status        text not null default 'draft',   -- draft | live | paused
  is_customer   boolean not null default false,  -- egen sajt vs betalande kund
  created_at    timestamptz default now()
);

-- Vem får administrera vilken sajt
create table tenant_members (
  tenant_id uuid references tenants(id) on delete cascade,
  user_id   uuid references auth.users(id) on delete cascade,
  role      text not null check (role in ('tenant_admin','editor')),
  primary key (tenant_id, user_id)
);
create table platform_admins (user_id uuid primary key references auth.users(id));

-- Områden per kommun (ersätter hårdkodningen i areaResolver.ts)
create table areas (
  id serial primary key,
  municipality_code text not null references municipalities(code),
  name text not null, slug text not null,
  venue_keywords text[] default '{}',
  place_keywords text[] default '{}',
  postal_ranges int4range[] default '{}',
  sort_order int default 0,
  unique (municipality_code, slug)
);

-- Scraperkällor (ersätter SCRAPER_CONFIGS i kod)
create table sources (
  id serial primary key,
  name text not null,
  url text not null,
  strategy text not null,          -- 'jsonld' | 'wp-tribe' | 'ics' | 'adapter:<namn>' | 'llm' | 'custom:<klass>'
  config jsonb default '{}',       -- selektorer, paginering, maxDetailPages …
  default_municipality_code text,  -- om källan bara gäller en kommun
  default_organizer_id int references organizers(id),
  default_category text,
  is_aggregator boolean default false,  -- körs sist (som Visit Varberg idag)
  enabled boolean default true,
  expected_weekly_events int,      -- för hälsolarm
  last_success_at timestamptz,
  last_content_hash text           -- ändringsdetektering
);

-- Kurerat innehåll (ersätter recommendations.ts och copy.ts)
create table places (                 -- restauranger, stränder, sevärdheter, aktiviteter
  id serial primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  kind text not null,                 -- 'restaurant' | 'beach' | 'sight' | 'activity'
  name text not null, slug text not null,
  description text, image_url text, address text, lat float8, lng float8,
  url text, sort_order int default 0, published boolean default true
);
create table content_blocks (         -- guidetexter, FAQ, säsongsguide, "om oss"
  id serial primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  key text not null,                  -- 'att_gora_intro', 'faq_att_gora', 'seasons' …
  body jsonb not null,
  unique (tenant_id, key)
);
```

> **Kom ihåg:** migrationer körs manuellt i SQL-editorn. Från och med 2026-10-30
> kräver nya tabeller `GRANT` till `anon`/`authenticated`/`service_role`. Lägg därför
> GRANT-rader i varje migration.

### 3.3 Ändringar i befintliga tabeller

| Tabell | Ändring | Kommentar |
|---|---|---|
| `events` | `+ municipality_code text` (index) | Sätts av kommun-resolvern vid import. NULL → granskningskö |
| `events` | `area` → `area_id int references areas` | Backfilla från nuvarande textvärden |
| `organizers` | `+ municipality_code text` (nullable) | Arrangörer är globala. Koden används för matchning och filtrering |
| `organizer_pages` | `+ tenant_id` | SEO-innehåll är per sajt |
| `event_tips` | `+ tenant_id` | Sätts av sajten som tipset skickas från |
| `hero_featured_events` | `+ tenant_id` | |
| `instagram_posts` | `+ tenant_id`; `UNIQUE(post_date)` → `UNIQUE(tenant_id, post_date)` | Annars kan bara en stad posta per dag |
| `newsletter_subscriptions` | `+ tenant_id` | |
| `email_recipients` | `+ tenant_id` (NULL = plattformsnivå) | |
| `scraper_logs`, `scraper_progress_logs` | `+ source_id` | Globala, inget tenant_id |
| `scraper_schedules` | ersätts av schema per källa eller globalt | |
| `system_alerts`, `duplicate_event_logs`, `event_audit_log` | oförändrade (`+ tenant_id` nullable vid behov) | Plattformsnivå |

**Varför `municipality_code` på events och inte `tenant_id`:** eventet beskriver en
verklig plats. Vilken sajt som visar det följer av tenantens `municipality_codes`. Om en
kommun senare köper en egen sajt för en kommun där ni redan har en egen sajt, eller en
region vill visa flera kommuner, går det att lägga till en `tenant_events`-tabell för
kurering per sajt utan att riva något. Bygg inte det nu.

### 3.4 Event-URL:er

`event_id`-sluggen förblir globalt unik. Ta bort Varbergsspecifika prefixregler i
`event-id-generator.ts` och gör dem generiska (`visit-{stad}-`, `{stad}-`). URL:en blir
`https://{tenantens domän}/event/{slug}`.

### 3.5 Feature flags och tema (zod-schema i `packages/core`)

```ts
export const TenantFeatures = z.object({
  linkToOrganizers:     z.boolean().default(false), // iVarberg: aldrig länka ut (egen policy)
  showPrices:           z.boolean().default(true),
  areaFilter:           z.boolean().default(true),
  tipsForm:             z.boolean().default(true),
  newsletter:           z.boolean().default(false),
  instagram:            z.boolean().default(false),
  instagramApproval:    z.enum(['ntfy','auto','off']).default('ntfy'),
  showNearby:           z.boolean().default(true),   // "Händer i närheten" → andra sajter
  networkFooter:        z.boolean().default(true),
  analyticsCookieless:  z.boolean().default(false),  // kommuner vill ofta slippa cookiebanner
  categories:           z.array(z.string()).default(DEFAULT_CATEGORIES),
  languages:            z.array(z.enum(['sv','en'])).default(['sv']),
  autoPublishMinQuality: z.number().min(0).max(100).default(80),
})

export const TenantTheme = z.object({
  logoUrl: z.string(), faviconLight: z.string(), faviconDark: z.string(),
  colors: z.object({ primary: z.string(), accent: z.string(), bg: z.string(), fg: z.string() }),
  font: z.enum(['poppins','inter','source-serif']).default('poppins'),
  heroImages: z.array(z.object({ url: z.string(), season: z.string().optional() })),
  ogImage: z.string(),
})
```

Regler:
- Nya flaggor får alltid ett default så att inga migrationer behövs för befintliga tenants.
- När en kund ber om något nytt byggs det som en flagga, **avstängd som standard**.
- Flaggor som handlar om affär och innehåll ligger i databasen. PostHogs feature flags
  används bara för experiment och gradvis utrullning av kod.

### 3.6 RLS

- `platform_admins` får allt.
- `tenant_members` får läsa och skriva rader där `tenant_id` är deras, och events där
  `municipality_code = any(tenant.municipality_codes)`.
- `anon` (publika sajten) får läsa publicerade events, tenants med `status = 'live'`,
  publicerade `places` och `content_blocks`, samt skriva `event_tips` och
  `newsletter_subscriptions`.
- Scripts kör med service role. **Varje script måste ta emot tenant eller kommun
  explicit** och får aldrig anta Varberg.
- Lägg ett testscript som loggar in som en testanvändare i tenant A och verifierar att
  inget från tenant B går att läsa eller skriva.

---

## 4. Påverkan på den befintliga appen (admin)

### 4.1 Gränssnitt

| Del | Ändring |
|---|---|
| Skalet (`components/shell/Sidebar.tsx`) | Stadsväljare överst. Valet sparas i cookie och styr alla listor. Platform admin kan välja "Alla städer" |
| Events (lista, granska, dubbletter, statistik) | Filtreras på vald stads kommunkoder. Kolumn "Kommun" i "Alla städer"-läget |
| Granskningskö | Ny flik "Okänd kommun": events som resolvern inte kunde placera |
| Arrangörer | Globala. Filtrera på kommun. Arrangörssidor (`organizer-pages`) är per stad |
| Hero, tips, Instagram, notiser | Per stad |
| Scrapers-sidan | Visar källor från `sources`. Nytt: "Lägg till källa" (URL → förhandsvisning av vad pipelinen hittar → spara) och hälsostatus per källa |
| **Ny: Sajtinställningar** | Tema, flaggor, domäner, SEO-texter, kontakt. Platform admin ser allt, tenant admin ser en delmängd |
| **Ny: Innehåll** | Redigera `places` och `content_blocks` (ersätter kodfilerna i publika repot) |
| **Ny: Användare** | Bjud in kommunanvändare (Supabase invite) och sätt roll |
| **Ny: Städer** (platform admin) | Skapa ny tenant med en guide: kommun → domän → tema → källor → innehåll → go live |

### 4.2 API-routes och tjänster

| Fil/område | Ändring |
|---|---|
| `src/lib/scrapers/scraper-registry.ts` | Byggs om: läser `sources`, väljer strategi. Nuvarande klasser blir `custom:<klass>`-strategier tills de ersatts |
| `src/lib/services/event-importer.ts` | Kör kommun-resolvern efter area-resolvern. Hanteringen av "Visit Varberg-plattform" generaliseras till `source.is_aggregator` |
| `src/lib/services/areaResolver.ts` | Delas i `municipalityResolver` (postnummer/ort → kommunkod, se §6.4) och `areaResolver` (läser `areas` för kommunen) |
| `aiCategorizer.ts`, `organizer-ai-generator.ts`, `instagram-post-runner.ts`, `rewrite-description` | Prompter blir mallar med `{city_name}` och `{site_name}` från tenant. `ivarberg.se` i organizer-prompten är dessutom fel domän idag |
| `instagram-*`-tjänsterna | Tar `tenant` som argument. Webhook och konto-id per tenant (§9) |
| `/api/cron/instagram-post` | Loopar över tenants med `features.instagram = true` |
| `email-service.ts` | Verifierad avsändardomän i Resend (`notiser@inugroup.se`), rapport per tenant och en samlad till plattformen |
| `alert-service.ts`, `ntfy.ts` | Plattformslarm (till dig) oförändrade. Notiser per stad kan få eget ntfy-ämne |
| `image-proxy` | Tillåt bilder för alla tenant-domäner. Kontrollera allowlist och CORS |
| `src/lib/constants.ts` | `SCRAPER_SOURCES` tas bort (källor kommer från DB) |
| `src/middleware.ts` | Oförändrad auth. Hämta medlemskap och sätt aktiv tenant |
| Google Maps-nyckel | Lägg alla nya domäner i nyckelns HTTP-referrer-begränsning i Google Cloud |
| Supabase Auth | Lägg admin-domänen i redirect URLs. Publika sajter har ingen inloggning |

### 4.3 Scripts och jobb

- `scripts/run-scrapers.ts`: kör alla aktiva källor med parallellitet begränsad per
  värd. Valfritt filter `--municipality=1382` eller `--source=12`.
- Backfills (`backfill-areas.ts`, `recategorize-events.ts` m.fl.): får parameter för
  kommun eller tenant.
- `daily-instagram-post.yml`: loopar över tenants (eller matrix per tenant).
- Nytt engångsscript: `backfill-municipality.ts` som sätter `1383` på alla befintliga
  events och kör resolvern för att hitta de som egentligen ligger utanför Varberg.

---

## 5. PostHog

Idag finns två användningar:
1. **Publika sajten** (`posthog-js`): ~15 egna events (`event_viewed`, `search_performed`,
   `quick_filter_clicked`, `tip_submitted`, `organizer_cta_clicked` …), dokumenterade i
   `ivarberg-events-hub-main/docs/POSTHOG_EVENTS_DOCUMENTATION.md`.
2. **Admin och scripts** (`posthog-node` + `@posthog/ai`): LLM-analys av alla OpenAI-anrop
   (kostnad, latens) via `openai-client.ts`.

### 5.1 Rekommendation: ett PostHog-projekt för alla sajter

- Behåll **ett** projekt (EU-moln, som idag). Free tier räcker länge, och jämförelser
  mellan städer blir enkla.
- Registrera superproperties vid init så att **varje** event får dem automatiskt:
  ```ts
  posthog.register({ tenant: 'falkenberg', site_domain: 'ifalkenberg.nu', is_customer: false })
  ```
- Behåll alla befintliga eventnamn. Lägg bara till `tenant` och uppdatera
  dokumentationen.
- **Historisk data:** gamla events saknar `tenant`. I insikter: filtrera på
  "`tenant` = varberg ELLER `tenant` saknas" fram till migreringsdatumet, eller använd
  `$host = ivarberg.nu`, som redan finns på alla gamla events.
- Skapa en dashboard-mall med filter per tenant (besökare, eventvisningar,
  sökningar, tips, CTA-klick). Duplicera den per stad.
- Nya events: `nearby_site_clicked` (klick till annan stadssajt), `network_link_clicked`.

### 5.2 LLM-kostnad per stad

Skicka `tenant` (eller `municipality_code`) som property på varje AI-anrop i
`openai-client.ts` (`posthogProperties`). Då syns **OpenAI-kostnad per stad**. Det är
direkt underlag för prissättningen mot kommuner.

### 5.3 Statistik till kommunkunder

Kommuner vill se siffror. Bygg en statistiksida per tenant i admin som hämtar från
PostHogs Query API (HogQL) med filter `tenant = X`: besökare, populäraste events,
söktermer, klick ut till arrangörer, tips. Det blir en del av Premium-paketet
(kvartalsrapport som PDF).

### 5.4 Integritet och cookies

- Flaggan `analyticsCookieless` → `persistence: 'memory'` / cookieless-läge. Det behövs
  ingen cookiebanner, men återkommande besökare går inte att följa. Kommuner föredrar
  oftast detta.
- Med Next.js: reverse proxy för PostHog via `rewrites` (`/ingest/*` →
  `eu.i.posthog.com`) på varje domän. Det minskar bortfallet från adblockers.
- PostHog-cookies är per domän, så samma person på två stadssajter räknas som två.
  Det är rätt beteende för ändamålet.

### 5.5 Under migreringen till Next.js

- `PostHogProvider` som klientkomponent i `app/[tenant]/layout.tsx`.
- `defaults: '2025-05-24'` fångar sidvisningar vid navigering i App Router automatiskt.
  Verifiera att `$pageview` inte dubbleras.
- Kör gamla och nya sajten mot samma projekt. Jämför antal sidvisningar per dag före och
  efter bytet för att upptäcka tracking-bortfall.

---

## 6. Scraping i stor skala

### 6.1 Generisk pipeline

Varje källa i `sources` körs genom strategierna i ordning, eller bara den som är angiven:

1. **JSON-LD** (`schema.org/Event`) på listsidan och detaljsidorna.
2. **Kända flöden:** WordPress The Events Calendar (`/wp-json/tribe/events/v1/events`),
   iCal/ICS, RSS.
3. **Plattformsadaptrar:** en adapter per system som återkommer i många städer, till
   exempel Sitevision-kalendrar (de flesta kommuner), visit-sajternas gemensamma
   plattformar och biljettsystem som ebiljett och Tickster. En adapter täcker många städer.
4. **LLM-extraktion:** HTML → markdown (turndown finns redan) → gpt-4o-mini med
   structured output → `ScrapedEvent[]`.
5. **Custom:** befintliga handskrivna klasser, så länge de behövs.

Utdata är alltid `ScrapedEvent`, så `event-importer` fungerar oförändrad.

### 6.2 Körmiljö

- Problemet idag: sajter blockerar GitHub Actions-IP:n, så Firecrawl används som
  reserv och credits tar slut.
- **Lösning:** en liten VPS med svensk eller nordisk IP (Hetzner, cirka 50 kr/mån) som kör
  scraper-workern med cron och Playwright för JS-tunga sidor. Firecrawl blir sista utväg.
- Alternativt: behåll GitHub Actions för källor som inte blockerar och kör bara de
  blockerade via VPS:en.
- Parallellitet: max 2 samtidiga anrop per värd och artiga fördröjningar.

### 6.3 Effektivitet och kvalitet

- **Ändringsdetektering:** hasha listsidan (`sources.last_content_hash`). Om den är
  oförändrad hämtas inga detaljsidor. Kända URL:er filtreras som idag (`known-urls.ts`).
- **Dubbletter mellan källor:** fingeravtryck av normaliserad titel, datum och kommun,
  plus embedding-likhet som backup. Ersätter "kör Visit Varberg sist" med
  `is_aggregator`-prioritet: originalkällan vinner alltid.
- **Källhälsa:** larma när en källa ger klart färre events än `expected_weekly_events`
  (inte bara vid 0) eller när `last_success_at` är äldre än 3 dagar.
- **Kostnadstak:** max antal LLM-anrop och Firecrawl-sidor per körning och per källa.

### 6.4 Kommun-resolver

Prioritetsordning (samma princip som idag: gissa aldrig):
1. Källans `default_municipality_code` (t.ex. Varbergs Teater → 1383).
2. Känd venue eller arrangör med kommunkod.
3. Postnummer i adressen → kommun (bygg tabellen en gång från öppen postnummerdata).
4. Ortnamn i adressen → kommun (tätortslista från SCB).
5. Geokodning av adressen (Google Geocoding, som redan finns för Places) → kommun.
6. Annars `NULL` → granskningskön "Okänd kommun".

### 6.5 Upptäcka källor för en ny stad

Ett script (`scripts/discover-sources.ts --municipality=1382`) som:
1. Söker fram kommunens evenemangskalender, visit-sajten, teater, arena, bibliotek,
   idrottsföreningar och nattliv (gratis sök plus fetch, inte Firecrawl).
2. Hämtar venues via Google Places (typ: teater, konsertlokal, bar, museum, arena).
3. Kör varje URL genom pipelinen i torrläge och rapporterar strategi, antal events och
   kvalitet.
4. Skapar `sources`-rader med `enabled = false` som du godkänner i admin.

**Mål: en ny stad har data inom en arbetsdag, utan ny kod.**

### 6.6 Juridik kring scraping

- Hämta bara faktauppgifter (titel, tid, plats, pris). Beskrivningar AI-skrivs om (finns
  redan). Bilder: använd arrangörens pressbilder och ta bort på begäran. Ha en tydlig
  kontaktväg för det.
- Respektera `robots.txt` och skicka en identifierbar User-Agent med kontaktadress
  (gäller VPS-workern).

---

## 7. Publika sajten: ombyggnad till SEO-vänlig Next.js

### 7.1 Varför Next.js och inte fortsätta med Vite

1. **Eventsidorna är osynliga utan JS.** Det är de flesta URL:erna och de mest
   långsvansiga sökningarna ("{eventnamn} varberg").
2. **Multi-tenant kräver servern.** Rätt titel, logga, färger, canonical och JSON-LD per
   domän måste finnas i HTML:en innan JS körs. En SPA kan inte göra det per domän utan
   hack.
3. **Två renderingsvägar idag** (React plus HTML-strängar i `api/_lib/render.ts`) blir en.
4. Admin kör redan Next.js, så ni har en stack och delad kod i `packages/core`.

### 7.2 Routes (samma URL:er som idag, ingen SEO-förlust)

```
app/[tenant]/
├─ page.tsx                         /                 startsida
├─ event/[slug]/page.tsx            /event/:slug      eventsida
├─ arrangor/[slug]/page.tsx         /arrangor/:slug
├─ [period]/page.tsx                /idag /imorgon /i-helgen /i-veckan
├─ kategori/[slug]/page.tsx         /kategori/:slug
├─ omrade/[slug]/page.tsx           /omrade/:slug
├─ [guide]/page.tsx                 /evenemang-{stad} /att-gora-i-{stad} /{stad}-kalender
├─ tips/page.tsx, om-oss/page.tsx
├─ sitemap.ts, robots.ts, llms.txt/route.ts, opengraph-image.tsx
```

Guide-sluggarna byggs från `tenant.slug`. För Varberg blir de exakt dagens
`/evenemang-varberg` osv.

### 7.3 Rendering och cache

- Server Components hämtar data direkt från Supabase (anon-nyckel med RLS).
- **ISR:** listor `revalidate: 900`, eventsidor `revalidate: 3600`, guider `86400`.
- **Omedelbar uppdatering:** när ett event publiceras eller ändras i admin anropar admin
  ett skyddat endpoint i web som kör `revalidateTag('events:1383')` eller
  `revalidatePath`. Ändringar syns på sekunder, och sajten är ändå statiskt snabb.
- Periodsidorna (`/idag`) behöver datumrullning: `revalidate: 900` räcker, eftersom
  sidan regenereras vid nästa besök efter midnatt.
- Interaktivitet (sök, filter, multiselect) blir klientkomponenter ovanpå en
  serverrenderad lista. Filterstate i URL:en (`?kategori=scen&period=i-helgen`).

### 7.4 Metadata och strukturerad data

- `generateMetadata` per sida: unik titel ("{Event} – {datum} i {stad} | {sajt}"),
  beskrivning, **canonical till tenantens primära domän**, OG/Twitter.
- **Dynamiska OG-bilder** med `next/og`: eventbild, titel, datum och stadens logga.
  Ger bättre delningar på Facebook och Instagram.
- **JSON-LD i rå HTML** (bygg i `packages/core/jsonld.ts`, portera från
  `api/_lib/jsonld.ts`):
  - Eventsida: `Event` med `startDate`, `endDate`, `eventStatus` (inklusive
    `EventCancelled` för status `cancelled`), `eventAttendanceMode`, `location` (`Place` +
    `PostalAddress` + `geo`), `image`, `offers` (pris, `isAccessibleForFree`), `organizer`.
  - Listor: `ItemList` av `Event`. Guider: `FAQPage`. Alla: `BreadcrumbList`.
  - Sajtnivå: `WebSite` med `SearchAction` och `Organization` per tenant.
- Filterkombinationer i URL:en: `noindex, follow` + canonical till bassidan. Bara
  `/kategori/*`, `/omrade/*`, perioder och guider indexeras, annars uppstår tusentals
  tunna sidor.

### 7.5 Passerade events

- Sidan finns kvar (länkar och bakåtlänkar ska inte brytas), med tydlig markering att
  eventet har passerat och länkar till kommande liknande events.
- 30 dagar efter eventet: `noindex, follow`. Passerade events finns redan inte i
  sitemapen.
- Återkommande event med samma namn: överväg en seriesida (`/serie/{slug}`) som samlar
  tillfällena. Det är starkt för sökningar som "julmarknad varberg".

### 7.6 Sitemap, robots, llms.txt per domän

- `sitemap.ts` läser tenant från host. Dela upp i `sitemap/events.xml`,
  `sitemap/pages.xml` och `sitemap/organizers.xml` (sitemap-index). Riktiga `lastmod` från
  `updated_at`.
- Behåll `/api/sitemap.xml` som 301 → `/sitemap.xml` och uppdatera Search Console.
- `robots.ts` per domän (samma regler som idag, släpp in AI-crawlers).
- `llms.txt` genereras per tenant från tenant-config och content blocks.

### 7.7 Prestanda (Core Web Vitals)

- `next/image` med AVIF/WebP och rätt `sizes`. Bilder via befintlig image-proxy eller
  Supabase Storage.
- **`next/font` med självhostad Poppins** i stället för Google Fonts-länken i
  `index.html`. Det går snabbare, och att ladda Google Fonts från Googles servrar har
  bedömts som GDPR-problem i EU. Det spelar roll för kommunkunder.
- Mål: LCP < 2,0 s på mobil, CLS < 0,05, INP < 200 ms.

### 7.8 Internlänkning

- Eventsida → kategori, område, arrangör, samma plats, "Mer i helgen".
- Startsida → perioder, kategorier, områden, guider.
- Footer → nätverket (iVarberg · iFalkenberg · iHalmstad) om `networkFooter` är på.
- "Händer i närheten" → topp 3 i grannkommunerna, länkade till deras sajt (`showNearby`).

### 7.9 Migrering utan att tappa ranking

1. **Baseline:** exportera från Search Console (klick, visningar, topp-URL:er, indexerade
   sidor) och crawla dagens sajt till en URL-lista (sitemap + topp-URL:er från GSC).
2. Bygg `apps/web` och kör den på förhandsdomänen `next.ivarberg.nu` med
   `noindex`-header.
3. **URL-paritet:** ett script som anropar varje URL i listan mot förhandsdomänen och
   kräver 200 (eller 301 till rätt ställe). Jämför titel, H1, canonical och JSON-LD.
4. Rich Results Test och Lighthouse på 10 representativa sidor.
5. Byt domän i Vercel (flytta ivarberg.nu till `web`-projektet) under en lugn dag
   (tisdag förmiddag, inte inför en helg med stora events).
6. Skicka in den nya sitemapen i GSC. Bevaka täckning och 404:or dagligen i 2 veckor och
   jämför med baseline efter 2, 4 och 8 veckor.
7. Arkivera `ivarberg-events-hub-main` när allt är stabilt.

### 7.10 Tillgänglighet

Om en kommun köper en sajt omfattas den av lagen om tillgänglighet till digital offentlig
service (WCAG 2.1 AA, numera i praktiken WCAG 2.2 via EN 301 549) och behöver en
tillgänglighetsredogörelse. Bygg det rätt från början: semantisk HTML, fokusmarkeringar,
kontrast i alla teman (validera tenant-färger automatiskt i inställningarna), alt-texter
och tangentbordsnavigering i filtren.

---

## 8. Innehåll per stad

Era publika sidor ska ha kurerade tips med bilder, och eventlistor bara som komplement.
Det kräver mest manuellt arbete per stad, så det behöver en process:

1. **Flytta allt hårdkodat** (`recommendations.ts`, `copy.ts`, `public/llms.txt`,
   hero-bilder) till `places`, `content_blocks` och `tenant.theme`. Seeda Varberg från
   dagens filer.
2. **AI-utkast med mänsklig granskning:** ett script genererar förslag på 20–30
   platser (Google Places + sajtcrawl) och guidetexter för en ny stad. De hamnar som
   opublicerade i admin, och du godkänner, redigerar och väljer bilder.
3. **Checklista per ny stad:** logga, färger, 3–4 hero-bilder (med säsong), OG-bild,
   minst 20 platser med bild, guidetexter (evenemang, att göra, kalender), FAQ, områden,
   "om oss".
4. **Arrangörssidor:** återanvänd `organizer-crawler` + `organizer-ai-generator` med
   promptmall per stad.

---

## 9. Instagram och sociala kanaler

- Ett Instagramkonto per stad (`@ifalkenberg.nu` osv.). Konto-id och kanal lagras i
  `tenant.contact`. Tokens lagras i Supabase Vault, inte i env.
- **Make:** ett scenario med router på `tenant` i webhook-payloaden, i stället för ett
  scenario per stad. Kontrollera Makes gratisgräns för operationer: med 5 städer ×
  karusell dagligen kan den ta slut. Uppgradera då eller posta direkt via Graph API.
- **ntfy:** ett ämne för dig med stadsnamnet i notisen. Kunder som ska godkänna själva
  får eget ämne eller e-post.
- Godkännandesidan (`/instagram/approve/[token]`) visar stadens branding.
- Unikhet: `UNIQUE(tenant_id, post_date)` (§3.3).

---

## 10. E-post och notiser

- Verifiera inugroup.se som avsändardomän i Resend (idag `onboarding@resend.dev`) och
  skicka från `notiser@inugroup.se`.
- Daglig scraperrapport: en samlad rapport till dig, plus valfritt per stad till
  `email_recipients` med det stadens `tenant_id`.
- Nyhetsbrev (om `newsletter` aktiveras): per tenant, med egen avsändare.

---

## 11. Drift, säkerhet och kostnader

### 11.1 Plattform

| Tjänst | Krav | Ungefärlig kostnad/mån |
|---|---|---|
| Vercel | **Pro krävs för kommersiellt bruk** (Hobby är bara för icke-kommersiellt). Flera domäner per projekt ingår | ~$20 per medlem |
| Supabase | Pro för dagliga backuper och PITR när kunder betalar | ~$25 |
| VPS för scraping | Hetzner CX22 eller liknande | ~€5 |
| OpenAI | gpt-4o-mini, kategorisering, omskrivning, LLM-extraktion | uppskattat 50–300 kr/stad (mät via PostHog §5.2) |
| PostHog | Free tier räcker länge | 0 |
| Resend | Free tier 3 000 mejl/mån | 0 till ~$20 |
| Make | Gratis eller Core beroende på antal operationer | 0 till ~$10 |
| Domäner | .nu cirka 100–200 kr/år styck | ~15 kr/stad |

**Totalt för 5 städer: uppskattningsvis 1 000–1 500 kr/mån.** Verifiera mot aktuella
prislistor innan budget sätts.

### 11.2 Säkerhet

- RLS-test mellan tenants i CI (§3.6).
- Revalidate-endpointen i web skyddas med en hemlighet. Admin anropar den server-till-server.
- Tenant-admins kan aldrig ändra `municipality_codes`, domäner eller `is_customer`. Bara
  platform admin kan det.
- Granskningslogg (`event_audit_log`) får `user_id` och `tenant_id`, så att det framgår
  vem på vilken kommun som ändrade vad.
- Personuppgiftsbiträdesavtal (PUB-avtal) med kommunkunder. Underbiträden: Supabase (EU), Vercel,
  PostHog (EU), Resend, OpenAI. Dokumentera regioner.

### 11.3 Miljöer

- Skapa ett **staging-projekt i Supabase** (gratisnivån räcker) och kör varje migration
  där först, eftersom migrationerna körs manuellt.
- Vercel preview-deploys för både admin och web.
- Seed-script som skapar två testtenants med några events var.

---

## 12. Affär

### 12.1 Två ben

**A. Eget nätverk (i{stad}.nu):** bevisa trafik och täckning. Intäkter från framhävning
för arrangörer (hero, Instagram, nyhetsbrev), lokala annonsörer och sponsrade nyhetsbrev.

**B. Licens till kommuner, destinationsbolag och citysamverkan:**

| Paket | Innehåll | Pris (förslag) |
|---|---|---|
| Flöde | Widget och API/ICS att bädda in på kundens egen sajt | 3–5 tkr/mån |
| White label-sajt | Egen domän och design, admininlogg, tipsformulär, statistik | 8–15 tkr/mån + 25–40 tkr i uppstart |
| Premium | + sociala medier, nyhetsbrev, kurerat innehåll, kvartalsrapport | 20–30 tkr/mån |

100–360 tkr/år ligger under direktupphandlingsgränsen (cirka 700 tkr sedan 2025, men
kontrollera aktuell nivå). Det gör affären snabb för kunden.

### 12.2 Säljprocess

1. Bygg demosajten **innan** mötet med discovery-scriptet (§6.5): "Här är er stad:
   X evenemang från Y källor, varav Z inte finns på er kalender idag."
2. Kontakter: destinations- eller turistchef, näringslivschef, kommunikationschef,
   centrumförening.
3. Positionera er som **motorn bakom** kommunens kalender, inte som en konkurrent till
   visit-sajten.
4. Referenskund: Varberg (kommunen, Destination Varberg eller Varberg City) med en
   pilot på 3 månader till halva priset.
5. Timing: budgeten för nästa år sätts på hösten. Mindre köp tas ofta ur
   verksamhetsbudgeten under året.

### 12.3 Behövs innan första kunden

- Avtalsmall (SaaS-avtal + PUB-avtal), tillgänglighetsredogörelse-mall, prislista,
  pitchdeck med siffror från egna sajter, exportfunktion ("ni äger er data").
- Länkpolicy: kommunkunder kommer nästan säkert vilja länka till arrangörer. Det styrs av
  `linkToOrganizers`. Era egna sajter behåller nuvarande policy.

---

## 13. Fasplan

Fasplanen ligger i **[docs/skalning/](skalning/README.md)**: en fil per fas med mål,
steg, skydd för ivarberg.nu, rollback, "klart när" och en startprompt för en
Claude Code-session. Där finns också principerna för att bygga allt utan att påverka
den dagliga driften.

---

## 14. Beslut och öppna frågor

| Fråga | Status |
|---|---|
| Bolag och nätverkets namn | **Beslutat:** Inu Tapper AB, nätverket Inu Group |
| Admin-domän | **Beslutat:** admin.inugroup.se för alla städer. admin.ivarberg.nu blir redirect efter övergången |
| Avsändardomän för e-post | **Beslutat:** inugroup.se |
| Repostruktur | **Beslutat:** admin kvar i roten, `apps/web` + `packages/core` bredvid |
| Stad nr 2 | Förslag: Falkenberg. Den blir också första stad på den nya publika stacken, före Varberg |
| Länkpolicy på egna sajter | Förslag: behåll "aldrig länka ut". Flaggan finns för kunder |
| Arrangörer globala eller per stad | Förslag: globala med `municipality_code`, sidorna per stad |
| Vercel-plan | Pro (krav vid kommersiellt bruk) |
| Konsumentvarumärke | i{stad}.nu. Inu Group syns i footer, "om oss" och mot kunder |

---

## 15. Risker

| Risk | Konsekvens | Motåtgärd |
|---|---|---|
| Rankingtapp vid migrering | Mindre trafik i Varberg | URL-paritet, 301:or, baseline, byte en lugn dag (§7.9) |
| Data läcker mellan tenants | Förtroendeskada hos kommunkund | RLS-test i CI, scripts kräver explicit tenant |
| Kurering tar för mycket tid per stad | Skalar inte | AI-utkast plus godkännande, checklista, prioritera källor med hög kvalitet |
| Sajter blockerar scraping | Hål i datan | VPS med svensk IP, flera strategier, hälsolarm |
| Kostnaden för LLM-extraktion växer | Marginalen krymper | Ändringsdetektering, kostnadstak, mätning per stad |
| Operationsgränser i Make | Instagram stannar | En router-scenario, övervakning, uppgradera eller gå direkt via Graph API |
| Kommuner ser er som konkurrent till visit-sajten | Ingen affär | Positionera som motorn bakom deras kalender, erbjud Flöde-paketet |
| Ett system för alla → en bugg slår ut alla sajter | Driftstörning överallt | Riskabla ändringar bakom flagga, rulla ut på iVarberg först, preview-deploys |
