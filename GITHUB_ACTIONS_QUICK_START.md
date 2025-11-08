# GitHub Actions - Quick Start Guide

## ✅ Vad har skapats

1. **`scripts/run-scrapers.ts`** - Standalone scraper-script som kör alla scrapers
2. **`.github/workflows/daily-scraper.yml`** - GitHub Actions workflow som kör automatiskt kl 06:00
3. **`tsx`** - Installerat som dev dependency för att köra TypeScript-scripts
4. **Dokumentation** - Komplett setup-guide i `docs/GITHUB_ACTIONS_SETUP.md`

## 🚀 Nästa steg

### 1. Testa lokalt (Optional men rekommenderat)

```bash
npm run scrape
```

Eller direkt med tsx:
```bash
npx tsx --env-file=.env.local scripts/run-scrapers.ts
```

Om du får fel om saknade environment variables, se till att `.env.local` innehåller:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xypvnwdfbhbsdcftzbvr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=din_service_role_key
OPENAI_API_KEY=sk-din_openai_key
```

### 2. Pusha till GitHub

```bash
git add .
git commit -m "Add GitHub Actions scraper workflow"
git push origin main
```

### 3. Lägg till GitHub Secrets

Gå till ditt repo på GitHub → **Settings** → **Secrets and variables** → **Actions**

Klicka **New repository secret** och lägg till dessa 3 secrets:

| Secret Name | Var hittar jag värdet? |
|-------------|----------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role key (secret) |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |

### 4. Testa workflow manuellt

1. Gå till **Actions**-fliken i ditt GitHub repo
2. Klicka på "Daily Event Scraper" i vänstermenyn
3. Klicka **Run workflow** → **Run workflow**
4. Vänta ~3-6 minuter
5. Klicka på körningen för att se detaljerade logs

### 5. Verifiera att events importerades

- Gå till din admin-panel → `/scrapers`
- Kolla "Körningshistorik" - du ska se den senaste körningen
- Gå till `/events` - se nya events

## 📅 Automatisk schemaläggning

Workflow körs nu automatiskt **varje dag kl 06:00** svensk tid (05:00 UTC).

Du behöver inte göra något mer - events scrapar sig själva! 🎉

## 📊 Övervaka

- **GitHub Actions**: Se alla körningar under **Actions**-fliken
- **Admin Panel**: `/scrapers` för detaljerad historik och logs
- **Email**: GitHub mailar dig automatiskt vid fel

## 🔧 Ändra schema

Redigera `.github/workflows/daily-scraper.yml`:

```yaml
on:
  schedule:
    - cron: '0 5 * * *'  # Ändra här (UTC-tid)
```

Exempel:
- `0 5 * * *` - Varje dag kl 06:00 svensk tid
- `0 5,17 * * *` - Två gånger/dag: 06:00 och 18:00
- `0 5 * * 1-5` - Vardagar kl 06:00

## 📖 Mer info

Se `docs/GITHUB_ACTIONS_SETUP.md` för fullständig dokumentation.

## ✅ Checklista

- [ ] `tsx` installerat ✅ (Klart!)
- [ ] Script skapad ✅ (Klart!)
- [ ] Workflow skapad ✅ (Klart!)
- [ ] Testat lokalt (kör: `npx tsx --env-file=.env.local scripts/run-scrapers.ts`)
- [ ] Pushad till GitHub
- [ ] GitHub secrets tillagda (alla 3)
- [ ] Workflow testad manuellt
- [ ] Events i Supabase verifierade

---

**Grattis!** 🎉 Dina scrapers kör nu automatiskt varje dag!

