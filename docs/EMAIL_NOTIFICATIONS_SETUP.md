# Email Notifications Setup Guide

## Översikt

Detta system skickar automatiska dagliga email-rapporter efter varje scraping-körning från GitHub Actions. Rapporten innehåller:

- ✅ Status för alla scrapers (lyckade/misslyckade)
- 📊 Antal events hittade och importerade
- 🔄 Antal dubbletter
- ⏱️ Total körtid
- 📝 Detaljerad status per scraper
- 🔗 Länk till GitHub Actions loggar

## Steg 1: Skapa Resend-konto

1. Gå till [resend.com](https://resend.com)
2. Skapa ett gratis konto
3. Verifiera din email

## Steg 2: Hämta API-nyckel

1. I Resend Dashboard, gå till **API Keys**
2. Klicka **Create API Key**
3. Ge den ett namn (t.ex. "iVarberg Production")
4. Kopiera nyckeln (börjar med `re_...`)

## Steg 3: Lägg till API-nyckel i GitHub Secrets

1. Gå till din GitHub repository
2. Klicka **Settings** → **Secrets and variables** → **Actions**
3. Klicka **New repository secret**
4. Name: `RESEND_API_KEY`
5. Value: Klistra in din Resend API-nyckel
6. Klicka **Add secret**

## Steg 4: Skapa databas-tabell

1. Gå till din Supabase Dashboard
2. Öppna **SQL Editor**
3. Kopiera innehållet från `database/migrations/CREATE_EMAIL_RECIPIENTS_TABLE.sql`
4. Kör SQL-koden

Detta skapar tabellen `email_recipients` för att hantera mottagare.

## Steg 5: Lägg till mottagare

Det finns två sätt att lägga till email-mottagare:

### Via Admin UI (Rekommenderas)

1. Logga in i admin-panelen
2. Gå till **Email-notifikationer** i sidebaren
3. Skriv in email-adress och namn
4. Klicka **Lägg till**

### Via SQL (Direkt i databasen)

```sql
INSERT INTO email_recipients (email, name, notification_types, enabled)
VALUES ('din@email.com', 'Ditt Namn', ARRAY['daily_report'], true);
```

## Steg 6: Verifiera domän (Valfritt men rekommenderat)

### Med Resend Free Plan:
- Kan endast skicka från `onboarding@resend.dev`
- Max 100 emails/dag
- Max 3,000 emails/månad

### Med egen domän (Efter verifiering):
- Skicka från din egen domän (t.ex. `noreply@ivarberg.se`)
- Högre gränser
- Mer professionellt

**Verifiera domän:**
1. I Resend Dashboard, gå till **Domains**
2. Klicka **Add Domain**
3. Ange din domän
4. Följ instruktionerna för att lägga till DNS-poster
5. Vänta på verifiering (kan ta några minuter)

**Uppdatera from-adress:**
Efter verifiering, ändra i `src/lib/services/email-service.ts`:

```typescript
from: 'iVarberg Admin <noreply@ivarberg.se>', // Byt till din verifierade domän
```

## Testning

### Testa lokalt:
```bash
# Sätt miljövariabler i .env.local
RESEND_API_KEY=re_your_key_here
NEXT_PUBLIC_SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
OPENAI_API_KEY=your_key
GITHUB_ACTIONS=true

# Kör scraper manuellt
npm run scrape
```

### Testa från GitHub Actions:
1. Gå till **Actions** tab i GitHub
2. Välj **Daily Event Scraper**
3. Klicka **Run workflow**
4. Välj **main** branch
5. Klicka **Run workflow**

Efter körningen ska email skickas till alla aktiva mottagare.

## Hantera mottagare via Admin UI

### Lägg till mottagare:
1. Gå till **Email-notifikationer**
2. Fyll i email och namn (valfritt)
3. Klicka **Lägg till**

### Aktivera/Inaktivera:
- Klicka på **Aktiv**/**Inaktiv** knappen för att växla
- Inaktiva mottagare får inga emails men behålls i systemet

### Ta bort:
- Klicka **Ta bort** för att permanent radera en mottagare

## Email-innehåll

Emails skickas med följande subject:
- ✅ **Lyckad:** `✅ Scraper-rapport: X nya events`
- ⚠️ **Delvis:** `⚠️ Scraper-rapport: X misslyckade`

Email-body innehåller:
- Status-header med färgkodning
- 4 stats-kort (Lyckade, Nya events, Hittade, Tid)
- Detaljerad lista över alla scrapers
- Eventuella felmeddelanden
- Länk till GitHub Actions loggar

## Felsökning

### Inget email kommer:
1. **Kontrollera API-nyckel:** Är den korrekt i GitHub Secrets?
2. **Kontrollera mottagare:** Finns det aktiva mottagare i databasen?
3. **Kontrollera loggar:** Se GitHub Actions loggar för felmeddelanden
4. **Kontrollera Resend:** Logga in på Resend och se "Logs" för sent status

### Email går till spam:
1. Verifiera din egen domän (se ovan)
2. Lägg till SPF, DKIM och DMARC records
3. Använd en professionell from-adress

### Rate limits:
- Resend Free: 100 emails/dag
- Om du har många mottagare, uppgradera till Resend Pro
- Eller implementera batching/throttling

## Framtida förbättringar

Möjliga tillägg:
- ✉️ Veckosammanfattningar
- 🚨 Endast vid fel
- 📱 SMS-notifikationer via Twilio
- 💬 Slack/Discord webhooks
- 📈 Trendrapporter (mer/färre events än förra veckan)
- 🎨 Anpassningsbara email-mallar per mottagare

## Relaterade filer

- `src/lib/services/email-service.ts` - Email-service med Resend
- `scripts/run-scrapers.ts` - Scraper som triggar emails
- `src/app/admin/settings/notifications/page.tsx` - Admin UI
- `database/migrations/CREATE_EMAIL_RECIPIENTS_TABLE.sql` - DB migration
- `.github/workflows/daily-scraper.yml` - GitHub Actions workflow

## Support

Vid frågor eller problem:
1. Kolla Resend dokumentation: https://resend.com/docs
2. Kolla GitHub Actions loggar
3. Kolla Supabase loggar för databas-fel

