-- =============================================================================
-- 002_tenant_columns.sql — märk befintlig data med stad
-- =============================================================================
-- Bara tillägg. Varje ny kolumn har Varberg som standardvärde, så allt som
-- dagens kod skapar (scrapers, tips från ivarberg.nu, admin) får rätt värde utan
-- kodändring. Inga policies och inga befintliga kolumner ändras.
--
-- events får kommunkod (ett event ligger på en verklig plats; vilken sajt som
-- visar det följer av stadens kommunkoder). Innehåll som hör till en sajt får
-- tenant_id.
--
-- Instagram, nyhetsbrev och e-postrapporter är fortfarande bara Varberg och
-- rörs inte här.
-- =============================================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS municipality_code text DEFAULT '1383';
CREATE INDEX IF NOT EXISTS idx_events_municipality_code ON events(municipality_code);

ALTER TABLE organizer_pages
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000001383' REFERENCES tenants(id);
ALTER TABLE event_tips
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000001383' REFERENCES tenants(id);
ALTER TABLE hero_featured_events
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000001383' REFERENCES tenants(id);
ALTER TABLE newsletter_subscriptions
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000001383' REFERENCES tenants(id);
ALTER TABLE site_feedback
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000001383' REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_organizer_pages_tenant ON organizer_pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_event_tips_tenant ON event_tips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hero_featured_tenant ON hero_featured_events(tenant_id);

-- Verifiera: allt befintligt ska ligga på Varberg
SELECT 'events' AS tabell, municipality_code AS stad, count(*) FROM events GROUP BY 2
UNION ALL SELECT 'event_tips', tenant_id::text, count(*) FROM event_tips GROUP BY 2
UNION ALL SELECT 'organizer_pages', tenant_id::text, count(*) FROM organizer_pages GROUP BY 2;

-- =============================================================================
-- DOWN
-- =============================================================================
-- ALTER TABLE events DROP COLUMN IF EXISTS municipality_code;
-- ALTER TABLE organizer_pages DROP COLUMN IF EXISTS tenant_id;
-- ALTER TABLE event_tips DROP COLUMN IF EXISTS tenant_id;
-- ALTER TABLE hero_featured_events DROP COLUMN IF EXISTS tenant_id;
-- ALTER TABLE newsletter_subscriptions DROP COLUMN IF EXISTS tenant_id;
-- ALTER TABLE site_feedback DROP COLUMN IF EXISTS tenant_id;
