-- Godkännandeflöde för den dagliga Instagram-posten.
--
-- Cronen skapar på morgonen ett FÖRSLAG (status 'pending') i stället för att
-- posta direkt, och skickar en ntfy-notis med länk till en godkännandesida i
-- admin. Där kan man välja huvudevent, ordna övriga slides, justera captionen
-- och publicera - eller hoppa över dagen. Ett pending-förslag publiceras
-- automatiskt av nästa cron-körning efter kl 10 (Stockholm) om ingen hunnit
-- svara (kan stängas av med INSTAGRAM_AUTO_PUBLISH=false).
--
-- Körs manuellt i Supabase SQL-editorn.

-- Nya statusvärden: 'pending' (förslag väntar på godkännande)
ALTER TABLE instagram_posts DROP CONSTRAINT IF EXISTS instagram_posts_status_check;
ALTER TABLE instagram_posts
  ADD CONSTRAINT instagram_posts_status_check
  CHECK (status IN ('pending', 'published', 'skipped', 'failed'));

-- Förslaget: kandidater med bildbedömning per format, AI:ns rekommendation
-- (huvudevent, slides, format, caption) och "också idag"-listan. Se
-- src/lib/services/instagram-proposal.ts för strukturen.
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS proposal JSONB;

-- Engångstoken i godkännandelänken (/instagram/approve/<token>). Sidan och
-- API:t nås utan inloggning - token är behörigheten.
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS approval_token TEXT UNIQUE;

-- När och hur posten godkändes: 'manual' (sidan), 'ntfy' (knapp i notisen),
-- 'auto' (deadline utan svar), 'direct' (gamla direktflödet / --direct)
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS approval_source TEXT
  CHECK (approval_source IS NULL OR approval_source IN ('manual', 'ntfy', 'auto', 'direct'));

-- När ntfy-notisen skickades
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_instagram_posts_approval_token ON instagram_posts(approval_token);

COMMENT ON COLUMN instagram_posts.proposal IS 'AI-förslag för dagens post (kandidater, bildbedömning, rekommenderade slides och caption)';
COMMENT ON COLUMN instagram_posts.approval_token IS 'Token i godkännandelänken, ger behörighet att publicera/hoppa över dagens post';
