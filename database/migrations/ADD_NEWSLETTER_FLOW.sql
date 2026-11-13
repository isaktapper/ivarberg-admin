-- Torsdagsbrevet: nyhetsbrevet som går ut torsdagar 07:00 (Europe/Stockholm).
--
-- Flödet (se docs/TORSDAGSBREVET.md och src/lib/newsletter/runner.ts):
--   1. Onsdag eftermiddag skapar cronen ett FÖRSLAG (status 'proposed') med
--      helgens kandidater, AI:ns urval och text, och skickar en ntfy-notis
--      med länk till godkännandesidan (/newsletter/approve/<token>).
--   2. En människa väljer tre evenemang, justerar texten och godkänner.
--   3. Vid godkännande synkas aktiva prenumeranter till Resend-segmentet och
--      ett Broadcast schemaläggs till torsdag 07:00. Utan godkännande skickas
--      inget brev den veckan.
--
-- Körs manuellt i Supabase SQL-editorn. Går att köra flera gånger.

-- ---------------------------------------------------------------------------
-- 1. newsletter_subscriptions (finns redan, skapad av publika sajten)
-- ---------------------------------------------------------------------------

-- Supabase är källan för prenumeranter. Befintliga rader blir 'active' genom
-- kolumnens standardvärde.
ALTER TABLE newsletter_subscriptions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS resend_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE newsletter_subscriptions DROP CONSTRAINT IF EXISTS newsletter_subscriptions_status_check;
ALTER TABLE newsletter_subscriptions
  ADD CONSTRAINT newsletter_subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'unsubscribed', 'bounced'));

CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_status ON newsletter_subscriptions(status);

COMMENT ON COLUMN newsletter_subscriptions.status IS 'pending = väntar på bekräftelse (används inte än), active = får brevet, unsubscribed = avregistrerad (återaktiveras aldrig automatiskt), bounced = adressen studsar';
COMMENT ON COLUMN newsletter_subscriptions.resend_contact_id IS 'Kontaktens id i Resend. NULL = inte synkad än, skapas vid nästa utskick';
COMMENT ON COLUMN newsletter_subscriptions.unsubscribed_at IS 'När avregistreringen registrerades (hämtas från Resend vid synk)';
COMMENT ON COLUMN newsletter_subscriptions.source IS 'Var anmälan gjordes, t.ex. footer eller jul-i-varberg. NULL för äldre rader';

-- Publika sajten lägger in rader med anon-nyckeln (bara email + name). De nya
-- kolumnerna ska inte gå att sätta den vägen: en ny rad måste börja som
-- 'active' utan Resend-koppling. Policyn är RESTRICTIVE, alltså ett extra
-- villkor ovanpå den befintliga insert-policyn. Den ger ingen ny åtkomst och
-- påverkar inte sajtens anmälan. service_role går förbi RLS.
DROP POLICY IF EXISTS "Nya prenumeranter börjar som aktiva utan Resend-koppling" ON newsletter_subscriptions;
CREATE POLICY "Nya prenumeranter börjar som aktiva utan Resend-koppling"
  ON newsletter_subscriptions
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'active' AND resend_contact_id IS NULL AND unsubscribed_at IS NULL);

-- Admin (cron + godkännande) läser och uppdaterar med service role
GRANT ALL ON newsletter_subscriptions TO service_role;

-- ---------------------------------------------------------------------------
-- 2. newsletter_issues (ny): ett utskick per torsdag
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS newsletter_issues (
  id SERIAL PRIMARY KEY,

  -- Torsdagen brevet går ut (kalenderdag i Europe/Stockholm). Ett utskick per vecka.
  issue_date DATE NOT NULL UNIQUE,

  -- proposed  = förslag väntar på godkännande
  -- approved  = godkänt, Broadcast håller på att skapas (kortvarigt lås)
  -- scheduled = Broadcast schemalagt i Resend
  -- sent      = utskickat
  -- skipped   = inget brev den veckan (överhoppat eller aldrig godkänt)
  -- failed    = utskicket misslyckades, går att försöka igen från godkännandesidan
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'scheduled', 'sent', 'skipped', 'failed')),

  -- Kandidater + AI-förslag, se src/lib/newsletter/proposal.ts
  proposal JSONB,
  -- Brevets innehåll som det ser ut just nu (NewsletterContent i src/lib/newsletter/types.ts)
  content JSONB,

  -- Token i godkännandelänken (/newsletter/approve/<token>). Sidan och API:t
  -- nås utan inloggning, token är behörigheten.
  approval_token TEXT UNIQUE,
  approved_at TIMESTAMPTZ,

  -- När Broadcastet är schemalagt att gå ut, och dess id i Resend
  scheduled_for TIMESTAMPTZ,
  resend_broadcast_id TEXT,
  sent_at TIMESTAMPTZ,

  error TEXT,
  -- Antal mottagare i Resend-segmentet när brevet godkändes
  recipient_count INTEGER,

  -- ntfy: när förslaget aviserades och vilka påminnelser som gått ut
  -- ('evening' = onsdag kväll, 'morning' = torsdag morgon)
  notified_at TIMESTAMPTZ,
  reminders_sent TEXT[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_issues_status ON newsletter_issues(status);

-- updated_at sätts av samma triggerfunktion som email_recipients och
-- newsletter_subscriptions redan använder
DROP TRIGGER IF EXISTS update_newsletter_issues_updated_at ON newsletter_issues;
CREATE TRIGGER update_newsletter_issues_updated_at
  BEFORE UPDATE ON newsletter_issues
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: inga policys för anon. Inloggade admin-användare får läsa (samma som
-- instagram_posts), allt skrivande sker med service role.
ALTER TABLE newsletter_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view newsletter issues" ON newsletter_issues;
CREATE POLICY "Authenticated users can view newsletter issues"
  ON newsletter_issues
  FOR SELECT
  TO authenticated
  USING (true);

-- Grants (krävs uttryckligen för nya tabeller sedan 2026-10-30)
GRANT SELECT ON newsletter_issues TO authenticated;
GRANT ALL ON newsletter_issues TO service_role;
GRANT USAGE, SELECT ON SEQUENCE newsletter_issues_id_seq TO service_role;

COMMENT ON TABLE newsletter_issues IS 'Torsdagsbrevet: ett utskick per torsdag, från förslag till skickat';
COMMENT ON COLUMN newsletter_issues.issue_date IS 'Torsdagen brevet går ut (Europe/Stockholm)';
COMMENT ON COLUMN newsletter_issues.proposal IS 'Helgens kandidater med poäng och AI:ns förslag på urval och text';
COMMENT ON COLUMN newsletter_issues.content IS 'Brevets innehåll (NewsletterContent), det som förhandsvisas och skickas';
COMMENT ON COLUMN newsletter_issues.approval_token IS 'Token i godkännandelänken, ger behörighet att redigera, godkänna och ångra';

-- Verifiera
SELECT
  (SELECT count(*) FROM newsletter_subscriptions WHERE status = 'active') AS aktiva_prenumeranter,
  (SELECT count(*) FROM newsletter_issues) AS utskick,
  'Torsdagsbrevet installerat' AS status;
