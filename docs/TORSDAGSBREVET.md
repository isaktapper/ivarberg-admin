# Torsdagsbrevet

Nyhetsbrevet från ivarberg.nu. Går ut torsdagar 07:00 svensk tid med "Veckans tre"
(tre utvalda helgevenemang med en rad var) och en lista över resten av helgen.

**Grundregeln: brevet går aldrig ut utan att en människa har godkänt det.**
Finns inget godkännande blir det inget brev den veckan.

## Så går en vecka till

| När (svensk tid) | Vad som händer |
| --- | --- |
| Onsdag ca 16–17 | Cronen skapar veckans **förslag**: helgens publicerade evenemang (fredag 00:00–söndag 23:59) hämtas, upprepade tillfällen av samma evenemang slås ihop, kandidaterna poängsätts och AI:n föreslår tre evenemang med en rad var samt ämnesrad, preheader och intro. Du får en ntfy-notis med länk. |
| Onsdag ca 20–21 | Påminnelse om förslaget fortfarande väntar. |
| Torsdag ca 06–07 | Sista påminnelsen. |
| När du godkänner | Aktiva prenumeranter synkas till Resend-segmentet och ett Broadcast schemaläggs till **torsdag 07:00**. Godkänner du efter 07:00 skickas det direkt. |
| Fredag 18:00 | Tidsgränsen. Därefter går veckans brev inte att godkänna, och ett förslag som aldrig godkändes markeras "Hoppad" vid nästa körning. |

Cronen skapar förslag och påminner. Den skickar aldrig brevet.

### Godkännandesidan

Länken i notisen går till `/newsletter/approve/<token>` (ingen inloggning, token är
behörigheten, samma upplägg som Instagram). Där kan du:

- välja och ordna tre evenemang bland helgens kandidater
- redigera raden om varje evenemang, ämnesrad, preheader, intro, avslutning och P.S.
- se förhandsvisningen (mejlets riktiga html)
- skicka ett testmejl till en adress du anger
- godkänna, ångra ett godkännande (det schemalagda utskicket avbokas) eller hoppa över veckan

Sidan visar när brevet går ut och till hur många. Ändringar sparas med **Spara**, och
även när du förhandsvisar, skickar test eller godkänner.

Under **Nyhetsbrev** i adminmenyn finns alla utskick med status, antal prenumeranter,
en knapp för att skapa (eller göra om) veckans förslag för hand och länk till
godkännandesidan.

### Status på ett utskick

| Status | Betyder |
| --- | --- |
| Väntar (`proposed`) | Förslag finns, väntar på godkännande |
| Godkänns (`approved`) | Godkännandet pågår (kortvarigt lås medan prenumeranter synkas) |
| Schemalagd (`scheduled`) | Broadcast ligger i Resend och går ut på utsatt tid |
| Skickad (`sent`) | Utskickat |
| Hoppad (`skipped`) | Inget brev den veckan |
| Misslyckad (`failed`) | Något gick fel vid godkännandet. Inget skickades. Försök igen från godkännandesidan |

## Prenumeranter

Supabase (`newsletter_subscriptions`) är källan. Vid varje godkännande synkas listan
till Resend-segmentet:

- aktiva som saknas i segmentet skapas som kontakter och läggs till (`resend_contact_id` sparas)
- den som avregistrerat sig via länken i mejlet (i Resend) markeras `unsubscribed` i Supabase
- den som är `unsubscribed` eller `bounced` i Supabase stängs av i Resend
- ingen sätts någonsin tillbaka till prenumererande

Avregistreringslänken i brevet är Resends egen (`{{{RESEND_UNSUBSCRIBE_URL}}}`), så
avregistreringar landar i Resend först och förs över till Supabase vid nästa utskick.

Kända begränsningar:

- Det finns ingen dubbel opt-in. Status `pending` finns i tabellen men används inte än.
- Den som avregistrerat sig och anmäler sig igen på sajten får "redan anmäld" och förblir
  avregistrerad. Det får lösas för hand (sätt `status = 'active'` i Supabase och ta bort
  avregistreringen på kontakten i Resend) tills sajten har ett flöde för det.
- Studsar förs inte över automatiskt. Sätt `status = 'bounced'` för hand vid behov.
- Kontakter som lagts till för hand i Resend-segmentet får också brevet. Godkännandet
  säger till om det finns sådana.

## Kom igång – checklista

Gör stegen i ordning. Inget skickas till prenumeranter förrän sista steget är gjort.

- [ ] **1. Kör SQL.** Kör `database/migrations/ADD_NEWSLETTER_FLOW.sql` i Supabase SQL-editorn.
      Sista raden visar antal aktiva prenumeranter (ska stämma med antalet anmälda).
      Testa sedan en anmälan på ivarberg.nu så att formuläret fortfarande fungerar.
- [ ] **2. Verifiera avsändardomänen.** Lägg till `news.ivarberg.nu` under Domains i Resend,
      lägg in DNS-posterna (SPF, DKIM, gärna DMARC) och vänta tills domänen är "Verified".
- [ ] **3. Skapa ett segment** i Resend (Audience → Segments), t.ex. "Torsdagsbrevet". Kopiera
      segmentets id. Lämna det tomt, kontakterna läggs in vid första godkännandet.
- [ ] **4. Kontrollera API-nyckeln.** `RESEND_API_KEY` måste ha **Full access**. En nyckel med
      bara "Sending access" kan inte hantera kontakter och Broadcasts.
- [ ] **5. Sätt miljövariablerna** i Vercel (se tabellen nedan) och driftsätt.
      Låt `NEWSLETTER_ENABLED` vara osatt tills vidare.
- [ ] **6. Skapa ett förslag och testa.** Gå till Nyhetsbrev i admin, tryck **Skapa veckans
      förslag**, öppna godkännandesidan, titta på förhandsvisningen och skicka ett testmejl
      till dig själv. Kolla det i Gmail, Apple Mail och Outlook (bilder, länkar, logga).
- [ ] **7. Slå på.** Sätt `NEWSLETTER_ENABLED=true` i Vercel och driftsätt igen. Sätt också
      repo-variabeln `NEWSLETTER_ENABLED=true` i GitHub (Settings → Secrets and variables →
      Actions → Variables). Det är den som slår på de schemalagda körningarna.
- [ ] **8. Första riktiga brevet.** Godkänn på onsdagen och kontrollera i Resend under
      Broadcasts att utskicket ligger schemalagt till torsdag 07:00 och att segmentet har rätt
      antal kontakter.

### Miljövariabler

Nya för nyhetsbrevet:

| Variabel | Krävs | Beskrivning |
| --- | --- | --- |
| `NEWSLETTER_ENABLED` | för utskick | `true` slår på cronen och gör att brev kan godkännas. Osatt = cronen gör ingenting och godkännande vägras. Förslag, förhandsvisning och testmejl fungerar ändå. |
| `RESEND_NEWSLETTER_SEGMENT_ID` | för utskick | Id för segmentet i Resend som brevet skickas till. |
| `NEWSLETTER_FROM` | rekommenderas | Avsändare. Standard `ivarberg.nu <hej@news.ivarberg.nu>`. |
| `NEWSLETTER_REPLY_TO` | nej | Svarsadress, om svar ska gå någon annanstans än avsändaren. |
| `NEWSLETTER_SITE_URL` | nej | Publika sajten (länkar och logga). Standard `https://ivarberg.nu`. |
| `NEWSLETTER_ADDRESS` | nej | Postadress i sidfoten. Utan den används mallens standard. |
| `NEWSLETTER_SIGNOFF` | nej | Standardavslutning, `\n` för radbrytning. Annars tas avslutningen från förra brevet. |
| `NEWSLETTER_TEST_EMAIL` | nej | Förifylld adress för testmejl på godkännandesidan. |

Används redan av annat och behövs även här (kontrollera att de finns i Vercel):
`RESEND_API_KEY`, `NTFY_TOPIC` (+ ev. `NTFY_SERVER`, `NTFY_TOKEN`),
`ADMIN_BASE_URL`, `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Utan `OPENAI_API_KEY` (eller om AI:n inte svarar) blir förslaget de tre högst rankade
evenemangen med tomma rader som du fyller i själv.

## Schemaläggning

Brevet schemaläggs bara av **GitHub Actions** (`.github/workflows/weekly-newsletter.yml`), som kör
`scripts/run-newsletter.ts` direkt i GitHubs miljö. Vercel cron används inte.

| Tid (UTC) | Vad |
| --- | --- |
| onsdag 14:15 och 16:15 | Veckans förslag skapas och notisen skickas |
| onsdag 19:15 | Påminnelse om förslaget inte är godkänt |
| torsdag 05:15 och 07:15 | Sista påminnelsen |

GitHubs schemalagda körningar kan bli upp till ett par timmar sena. Därför får varje steg två
försök, och allt är idempotent per torsdag (`newsletter_issues.issue_date` är unik och varje
påminnelse registreras), så dubbla körningar är ofarliga. Själva utskicket påverkas inte av
förseningar: Resend håller det godkända brevet till torsdag 07:00.

Godkännandesidan och knappen **Godkänn** körs i admin-appen, eftersom det är en webbsida. Det är
det enda steget som inte ligger i GitHub Actions.

**Hemligheter och variabler i GitHub** (Settings → Secrets and variables → Actions):

- Secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`,
  `RESEND_API_KEY`, `NTFY_TOPIC`, `ALERT_EMAIL`, `POSTHOG_API_KEY`. De flesta finns redan för
  scraper- och Instagram-körningarna.
- Variables: `NEWSLETTER_ENABLED=true` (huvudbrytaren), och vid behov `ADMIN_BASE_URL`,
  `NTFY_SERVER`, `NEWSLETTER_SIGNOFF`.

Manuellt:

- I GitHub: Actions → Weekly Newsletter (Torsdagsbrevet) → Run workflow. Välj `dry_run` för att
  bara ta fram förslaget, eller `force` för att skapa det oavsett veckodag.
- I admin: sidan Nyhetsbrev → **Skapa veckans förslag**.
- Lokalt:

```bash
pnpm newsletter -- --dry-run
pnpm newsletter -- --force
```

## Felsökning

| Symptom | Trolig orsak |
| --- | --- |
| Adminsidan säger att nyhetsbrevet inte är färdiginstallerat | Migrationen är inte körd |
| "Utskick är inte påslaget. Saknas: …" | Miljövariablerna i listan saknas i Vercel |
| Godkännandet misslyckas med fel från Resend om avsändaren | `news.ivarberg.nu` är inte verifierad, eller `NEWSLETTER_FROM` pekar på en annan domän |
| Godkännandet misslyckas vid kontakter eller Broadcast | API-nyckeln har bara "Sending access", eller fel segment-id |
| "Det finns inga aktiva prenumeranter i Resend-segmentet" | Inga aktiva rader i `newsletter_subscriptions`, eller alla är avregistrerade i Resend |
| Ingen notis på onsdagen | `NTFY_TOPIC` saknas, eller `NEWSLETTER_ENABLED` är inte `true`. Förslaget går ändå att skapa från adminsidan |
| Status står kvar på "Godkänns" | Godkännandet avbröts. Efter fem minuter går det att gå tillbaka till förslaget från godkännandesidan och godkänna igen |
| Ett kort saknar bild i mejlet | Evenemangets bild gick inte att läsa när mejlbilden skulle skapas |

## Var koden finns

| Del | Fil |
| --- | --- |
| Innehållskontraktet och mejlmallen | `src/lib/newsletter/types.ts`, `email-template.ts` |
| Datum och klockslag (Europe/Stockholm) | `src/lib/newsletter/dates.ts` |
| Kandidater, sammanslagning, poäng | `src/lib/newsletter/weekend-events.ts` |
| AI-förslag och tonregler | `src/lib/newsletter/ai.ts` |
| Förslagets datamodell, bygge av innehållet | `src/lib/newsletter/proposal.ts` |
| Mejlbilder (JPEG 1200×675) | `src/lib/newsletter/images.ts` |
| Resend: synk, Broadcast, testmejl | `src/lib/newsletter/resend.ts` |
| Spara, förhandsvisa, godkänna, ångra | `src/lib/newsletter/issues.ts` |
| Cron-pipelinen | `src/lib/newsletter/runner.ts` |
| Miljövariabler | `src/lib/newsletter/config.ts` |
| API | `src/app/api/newsletter/approve/[token]`, `src/app/api/admin/newsletter` |
| Sidor | `src/app/newsletter/approve/[token]`, `src/app/(admin)/newsletter` |
| Databas | `database/migrations/ADD_NEWSLETTER_FLOW.sql` |

Mejlbilderna läggs i samma publika Storage-bucket som Instagram-bilderna
(`instagram-posts`), under `newsletter/<torsdag>/`. Rensa inte den mappen: gamla brev i
folks inkorgar pekar på bilderna.
