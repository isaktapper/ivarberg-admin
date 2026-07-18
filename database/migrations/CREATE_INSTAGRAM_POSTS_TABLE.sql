-- Tabell för dagliga automatiska Instagram-poster
-- Ger idempotens (en post per dag) och historik för variationsregler
-- Kör denna migration i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS instagram_posts (
  id SERIAL PRIMARY KEY,

  -- Kalenderdag i Europe/Stockholm som posten gäller (en post per dag)
  post_date DATE NOT NULL UNIQUE,

  -- Primärt event (postens bild) och övriga listade event
  event_id INTEGER REFERENCES events(id),
  also_event_ids INTEGER[] DEFAULT '{}',

  -- Innehållet som skickades till Make/Instagram
  caption TEXT,
  image_url TEXT,          -- Original-URL från events.image_url
  proxied_image_url TEXT,  -- /api/instagram-image-URL som skickades till Make

  -- Resultat
  status TEXT NOT NULL CHECK (status IN ('published', 'skipped', 'failed')),
  error TEXT,
  candidates_count INTEGER,
  posted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index för snabba queries
CREATE INDEX IF NOT EXISTS idx_instagram_posts_post_date ON instagram_posts(post_date DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_event_id ON instagram_posts(event_id);

-- RLS policies
ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

-- Tillåt authenticated users att läsa (för framtida admin-UI)
CREATE POLICY "Authenticated users can view instagram posts"
  ON instagram_posts
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role kan skapa poster (scriptet kör med service role)
CREATE POLICY "Service role can insert instagram posts"
  ON instagram_posts
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role kan uppdatera poster
CREATE POLICY "Service role can update instagram posts"
  ON instagram_posts
  FOR UPDATE
  TO service_role
  USING (true);

COMMENT ON TABLE instagram_posts IS 'Historik över dagliga automatiska Instagram-poster (en per dag, Europe/Stockholm)';
COMMENT ON COLUMN instagram_posts.post_date IS 'Kalenderdag i Europe/Stockholm som posten gäller';
COMMENT ON COLUMN instagram_posts.also_event_ids IS 'Event-id:n som listades under "Det händer också"';
