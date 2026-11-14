# Fas 8: Försäljning till kommuner

**Mål:** första betalande kund (kommun, destinationsbolag eller citysamverkan) på
plattformen, med avtal, prisnivå och leverans som går att upprepa.

**Tid:** löpande · **Beror på:** fas 5 + 2–3 månaders data från egna städer

Detaljer: [SKALNINGSPLAN.md §12](../SKALNINGSPLAN.md#12-affär).

---

## Steg

### Produkt
- [ ] **Flöde-paketet:** `GET /api/v1/events?municipality=<kod>` i `apps/web`, med
      API-nyckel per kund, en inbäddningsbar widget (`<script>` eller iframe) och en
      ICS-feed.
- [ ] **Statistiksida** per tenant i admin (PostHogs Query API filtrerad på `tenant`) och en
      kvartalsrapport som PDF.
- [ ] **Export:** kunden kan ladda ner sina events, platser och tips (CSV/JSON).
- [ ] Rollen `tenant_admin` får en avgränsad vy av Sajtinställningar (inte domäner,
      kommuner eller `is_customer`).
- [ ] Stöd för kundens egen domän (`extra_domains`, t.ex. `evenemang.falkenberg.se` via
      CNAME).

### Juridik och dokument (Inu Tapper AB)
- [ ] SaaS-avtal (tjänstebeskrivning, SLA på rimlig nivå, uppsägning, dataägande).
- [ ] Personuppgiftsbiträdesavtal (PUB-avtal) med lista över underbiträden och regioner
      (Supabase EU, Vercel, PostHog EU, Resend, OpenAI).
- [ ] Mall för tillgänglighetsredogörelse (WCAG 2.1 AA / EN 301 549).
- [ ] Policy för bilder och texter (borttagning på begäran, kontaktväg).
- [ ] Prislista (Flöde / White label / Premium, enligt §12.1).

### Säljmaterial
- [ ] Pitchdeck med siffror från de egna sajterna: events per vecka, antal källor,
      besökare, andel events som inte finns på kommunens egen kalender.
- [ ] Demosajt per mottagare, byggd med discovery innan mötet (`<stad>.demo.inugroup.se`,
      `noindex`).
- [ ] Säljsida på inugroup.se.

### Pipeline
- [ ] Lista med 20 kommuner, destinationsbolag och centrumföreningar i Halland och Västra
      Götaland, med kontaktpersoner (destinationschef, näringslivschef, kommunikationschef).
- [ ] Referenskund: erbjud Varberg (kommunen, Destination Varberg eller Varberg City) en
      pilot på 3 månader till halva priset.
- [ ] Tajma mot budgetarbetet (hösten för nästa år). Mindre köp går ofta ur
      verksamhetsbudgeten under året.

## Klart när
- [ ] Ett avtal är signerat och kunden är live på sin domän eller med widget.
- [ ] Leveransen följer playbooken utan specialkod för kunden.
