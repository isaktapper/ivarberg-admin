# Fas 4: Ny publik sajt (Next.js), parallellt bygge

**Mål:** `apps/web` är en komplett, serverrenderad och SEO-optimerad publik sajt som
klarar flera städer. Den körs för Varberg på en förhandsdomän med `noindex` och har full
URL-paritet med dagens ivarberg.nu. **Ingen produktionsdomän pekar på den än.**

**Tid:** ca 3–4 veckor · **Beror på:** fas 1 · **Parallellt med:** fas 2, 3

Detaljer: [SKALNINGSPLAN.md §2.2](../SKALNINGSPLAN.md#22-tenant-upplösning-web),
[§5](../SKALNINGSPLAN.md#5-posthog), [§7](../SKALNINGSPLAN.md#7-publika-sajten-ombyggnad-till-seo-vänlig-nextjs).

---

## Steg

### Grund
- [ ] `apps/web`: Next.js (samma version som admin), Tailwind, `@inu/core`.
- [ ] Nytt Vercel-projekt `web` med root `apps/web`. Domäner: `next.ivarberg.nu` (Varberg)
      och `demo.inugroup.se` (demo). Header `X-Robots-Tag: noindex` på **alla** svar så
      länge `NEXT_PUBLIC_INDEXABLE` inte är satt.
- [ ] `middleware.ts`: host → tenant (cachad), rewrite till `/[tenant]/…`, 404 för okänd
      host, `www` → apex, 301 för events från en annan kommun.
- [ ] Tema: CSS-variabler från `tenant.theme`. `next/font` med självhostad Poppins.

### Sidor (samma URL:er som idag)
- [ ] `/`, `/event/[slug]`, `/arrangor/[slug]`, `/idag`, `/imorgon`, `/i-helgen`,
      `/i-veckan`, `/kategori/[slug]`, `/omrade/[slug]`, guider
      (`/evenemang-{stad}`, `/att-gora-i-{stad}`, `/{stad}-kalender`), `/tips`, `/om-oss`.
- [ ] Porta design och komponenter från Vite-appen (`src/components`) och HTML:en i
      `api/_lib/render.ts` till Server Components, med en implementation per komponent.
- [ ] Sök och filter som klientkomponenter, med state i URL:en.
- [ ] Guidetexter och platser från `content_blocks` och `places`.
- [ ] Tipsformulär och nyhetsbrev skriver med tenantens `tenant_id`.
- [ ] Flaggor: `linkToOrganizers`, `showPrices`, `areaFilter`, `tipsForm`, `newsletter`,
      `showNearby`, `networkFooter`.

### SEO
- [ ] `generateMetadata` per sida med canonical till `tenant.primary_domain`.
- [ ] JSON-LD i rå HTML (Event, ItemList, BreadcrumbList, FAQPage, WebSite, Organization),
      portat från `api/_lib/jsonld.ts` till `packages/core`.
- [ ] Dynamiska OG-bilder (`opengraph-image.tsx`).
- [ ] `sitemap.ts` (index + events/pages/organizers), `robots.ts`, `llms.txt` per tenant.
      `/api/sitemap.xml` → 301 `/sitemap.xml`.
- [ ] Passerade events: `noindex, follow` efter 30 dagar.
- [ ] `noindex` + canonical på filterkombinationer.

### Data och cache
- [ ] ISR (listor 900 s, eventsidor 3600 s, guider 86400 s).
- [ ] `POST /api/revalidate` (skyddad med hemlighet) som admin anropar när events, hero,
      innehåll eller inställningar ändras. Admin-sidan av det görs i fas 2 eller här.

### Analys
- [ ] PostHog via `/ingest`-proxy, superproperties `tenant`, `site_domain`, `is_customer`.
      Samma eventnamn som i `POSTHOG_EVENTS_DOCUMENTATION.md`, plus
      `nearby_site_clicked` och `network_link_clicked`.
- [ ] Cookieless-läge om `features.analyticsCookieless`.
- [ ] Under förhandsvisningen: separat PostHog-property eller `site_domain =
      next.ivarberg.nu` så att testtrafik kan filtreras bort.

### Verifiering
- [ ] `scripts/url-parity.ts`: för varje URL i baselinen (fas 0) och dagens sitemap,
      jämför `ivarberg.nu` mot `next.ivarberg.nu` (status, titel, H1, canonical, antal
      JSON-LD-objekt). Mål: 100 % 200 eller avsiktlig 301.
- [ ] Rich Results Test på eventsida, periodsida och guide.
- [ ] Lighthouse mobil på 10 sidor: LCP < 2,0 s, CLS < 0,05, INP < 200 ms, tillgänglighet ≥ 95.
- [ ] Tangentbordsnavigering och skärmläsare på startsida och eventsida (WCAG).

## Skydd för ivarberg.nu
- Ingen produktionsdomän pekar på `web`. `noindex` överallt, så att Google inte indexerar
  förhandsdomänen som dubblett.
- Läser samma databas men skriver bara tips och nyhetsbrev (testa med `demo`-tenanten).

## Rollback
- Inget att backa i produktion. Ta bort Vercel-projektet om det behövs.

## Klart när
- [ ] URL-pariteten är 100 %, Rich Results är godkänt och Lighthouse-målen är nådda.
- [ ] `demo.inugroup.se` visar en annan stads tema och innehåll från samma kod.
- [ ] En publicering i admin syns på förhandsdomänen inom en minut (revalidate).

---

## Startprompt för Claude Code

```
Vi genomför fas 4 i docs/skalning/FAS-4-ny-publik-sajt.md (läs docs/skalning/README.md och
docs/SKALNINGSPLAN.md §2.2, §5 och §7). Bygg apps/web som en Next.js-app för flera städer i
den här monorepo-workspacen. Använd den befintliga publika sajten i
../ivarberg-events-hub-main som facit för design, komponenter, URL:er, JSON-LD
(api/_lib/jsonld.ts) och PostHog-events (docs/POSTHOG_EVENTS_DOCUMENTATION.md). Alla
URL:er för Varberg ska vara identiska med dagens. Allt innehåll som idag är hårdkodat
hämtas från tenants, content_blocks och places. Sajten ska ha noindex överallt tills
NEXT_PUBLIC_INDEXABLE sätts. Skriv även scripts/url-parity.ts. Branch: scale/fas-4. Bygg
en sidtyp i taget och verifiera var och en mot dagens ivarberg.nu.
```
