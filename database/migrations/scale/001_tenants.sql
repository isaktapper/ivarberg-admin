-- =============================================================================
-- 001_tenants.sql — städer (tenants) och vem som får administrera dem
-- =============================================================================
-- Bara tillägg. Inget befintligt ändras, så dagens admin och ivarberg.nu märker
-- ingenting. Körs manuellt i Supabase SQL-editorn. Kör 002 direkt efteråt.
--
-- OBS: lägg aldrig hemligheter (API-nycklar, webhooks) i tenants. Tabellen är
-- läsbar med anon-nyckeln eftersom de publika sajterna hämtar sitt tema härifrån.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text UNIQUE NOT NULL,               -- 'varberg' (= SITE_SLUG på sajten)
  name               text NOT NULL,                      -- 'ivarberg.nu' (sajtens namn)
  city_name          text NOT NULL,                      -- 'Varberg' (för texter och prompter)
  municipality_codes text[] NOT NULL DEFAULT '{}',       -- SCB-kommunkoder, {'1383'}
  primary_domain     text UNIQUE NOT NULL,               -- 'ivarberg.nu'
  theme              jsonb NOT NULL DEFAULT '{}',        -- färger, logga, favicon, hero, og-bild
  features           jsonb NOT NULL DEFAULT '{}',        -- vilka delar av sajten som är på
  seo                jsonb NOT NULL DEFAULT '{}',        -- titel, beskrivning, rubrik
  contact            jsonb NOT NULL DEFAULT '{}',        -- e-post, Instagram, adress
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'paused')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Ser och får göra allt i alla städer
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tillgång till en enskild stad (används när någon utanför ska in i bara en stad)
CREATE TABLE IF NOT EXISTS tenant_members (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'editor' CHECK (role IN ('tenant_admin', 'editor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Varberg är stad nummer 1 och har ett fast id, eftersom 002 använder det som
-- standardvärde på befintliga tabeller.
INSERT INTO tenants (id, slug, name, city_name, municipality_codes, primary_domain, theme, seo, contact, features, status)
VALUES (
  '00000000-0000-4000-8000-000000001383',
  'varberg',
  'ivarberg.nu',
  'Varberg',
  '{1383}',
  'ivarberg.nu',
  '{"colors": {"primary": "#0F5AA6", "dark": "#0B1B3A", "accent": "#B84A14", "background": "#F7F2EA", "highlight": "#7FD1C8"}}',
  '{}',
  '{"email": "info@ivarberg.nu", "instagramUrl": "https://instagram.com/ivarberg.nu", "instagramHandle": "@ivarberg.nu", "address": "Fästningsgatan 5, 432 44 Varberg"}',
  '{"areaFilter": true, "guides": true, "seasons": true, "taxonomyPages": true, "newsletter": true, "instagram": true}',
  'live'
)
ON CONFLICT (id) DO NOTHING;

-- Alla som kan logga in idag har full tillgång. Det behålls: de blir platform admins.
INSERT INTO platform_admins (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- RLS ------------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

-- Publika sajter läser sin egen rad (även utkast, så att en ny stad går att
-- förhandsgranska innan den är live). Allt skrivande sker med service role via
-- /api/admin/tenants, som kontrollerar platform_admins.
DROP POLICY IF EXISTS "Anyone can read tenants" ON tenants;
CREATE POLICY "Anyone can read tenants" ON tenants FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can read own platform admin row" ON platform_admins;
CREATE POLICY "Users can read own platform admin row" ON platform_admins FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own memberships" ON tenant_members;
CREATE POLICY "Users can read own memberships" ON tenant_members FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Grants (krävs uttryckligen för nya tabeller sedan 2026-10-30)
GRANT SELECT ON tenants TO anon, authenticated;
GRANT SELECT ON platform_admins, tenant_members TO authenticated;
GRANT ALL ON tenants, platform_admins, tenant_members TO service_role;

SELECT 'Städer installerade ✅' AS status, (SELECT count(*) FROM tenants) AS antal_stader, (SELECT count(*) FROM platform_admins) AS antal_platform_admins;

-- =============================================================================
-- DOWN (kör 002:s down först)
-- =============================================================================
-- DROP TABLE IF EXISTS tenant_members;
-- DROP TABLE IF EXISTS platform_admins;
-- DROP TABLE IF EXISTS tenants;
