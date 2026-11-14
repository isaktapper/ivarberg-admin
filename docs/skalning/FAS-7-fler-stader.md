# Fas 7: Fler städer och playbook

**Mål:** att lansera en ny stad är en rutin med en checklista. Den tekniska uppsättningen
tar under en dag, och kureringen av innehåll är det enda som tar tid.

**Tid:** löpande · **Beror på:** fas 6

---

## Steg

### Playbook
- [ ] `docs/NY_STAD_PLAYBOOK.md`, byggd på erfarenheterna från Falkenberg (fas 5). Den
      ska innehålla:
  1. Köp domänen och peka DNS till `web`.
  2. Skapa tenanten (Städer-guiden i admin).
  3. Områden och postnummer.
  4. Discovery → granska → skuggläge → aktivera källor.
  5. Innehåll: tema, hero, platser, guidetexter, FAQ (AI-utkast + granskning).
  6. Instagramkonto + Make-routing.
  7. Search Console, PostHog-dashboard, Google Maps-referrer.
  8. Lansera (`status 'live'`, indexering på).
  9. Första veckan: granska kvalitet och justera tröskeln.
- [ ] Automatisera det som tog längst tid i Falkenberg. Mål: steg 2–4 är ett enda
      kommando eller en enda guide i admin.

### Städer
- [ ] Halmstad (1380).
- [ ] Kungsbacka (1384).
- [ ] Därefter: välj städer utifrån sökvolym ("evenemang {stad}") och konkurrens.

### Nätverket
- [ ] När det finns minst 3 städer: slå på `showNearby` ("Händer i närheten") och
      `networkFooter`.
- [ ] En enkel sida på `inugroup.se` om nätverket. Den används i säljarbetet och för
      förtroende.
- [ ] Gemensam PostHog-dashboard som jämför städerna.

## Klart när (per stad)
- [ ] Live med minst 50 kommande events och komplett innehåll.
- [ ] Teknisk uppsättning under en dag. Tiden loggas i playbooken.
