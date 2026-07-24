-- Karusellstöd för dagliga Instagram-poster: en post kan nu ha 1-5 slides.
-- Befintliga kolumner behåller sin betydelse:
--   event_id          = slide 1:s event (primärt event)
--   image_url         = slide 1:s original-URL
--   proxied_image_url = slide 1:s publicerade Storage-URL
--   also_event_ids    = captionens "Det händer också"-lista (textomnämnanden)
-- Kör denna migration i Supabase SQL Editor

ALTER TABLE instagram_posts
  ADD COLUMN IF NOT EXISTS slide_event_ids INTEGER[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS slide_image_urls TEXT[] DEFAULT '{}';

COMMENT ON COLUMN instagram_posts.slide_event_ids IS
  'Event-id:n per slide i publiceringsordning (index 0 = primärt event)';
COMMENT ON COLUMN instagram_posts.slide_image_urls IS
  'Publika Supabase Storage-URL:er per slide, samma ordning som slide_event_ids';
