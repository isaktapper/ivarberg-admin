-- Enable Row Level Security on event_tips table
-- This migration adds RLS policies to protect PII (submitter_email, submitter_name)

-- Enable RLS on the event_tips table
ALTER TABLE event_tips ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public to submit tips (for the public submission form)
-- This allows anyone to insert new event tips via the public form
CREATE POLICY "Allow public insert on event_tips"
  ON event_tips
  FOR INSERT
  WITH CHECK (true);

-- Policy: Only authenticated users can read tips (for admin dashboard)
-- This restricts viewing of tips (including PII) to authenticated admin users
CREATE POLICY "Authenticated users can read event_tips"
  ON event_tips
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Only authenticated users can update tips
-- This restricts status changes and edits to authenticated admin users
CREATE POLICY "Authenticated users can update event_tips"
  ON event_tips
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Policy: Only authenticated users can delete tips
-- This restricts deletion to authenticated admin users
CREATE POLICY "Authenticated users can delete event_tips"
  ON event_tips
  FOR DELETE
  USING (auth.role() = 'authenticated');
