/**
 * Script för att skapa scraper_progress_logs tabell via Supabase client
 * Kör: npx tsx scripts/create-progress-table.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createProgressLogsTable() {
  console.log('🔧 Skapar scraper_progress_logs tabell...\n');

  const sql = `
-- 1. Skapa tabell
CREATE TABLE IF NOT EXISTS scraper_progress_logs (
  id BIGSERIAL PRIMARY KEY,
  log_id BIGINT NOT NULL REFERENCES scraper_logs(id) ON DELETE CASCADE,
  step VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  progress_current INTEGER DEFAULT 0,
  progress_total INTEGER,
  estimated_time_remaining_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index
CREATE INDEX IF NOT EXISTS idx_scraper_progress_logs_log_id
  ON scraper_progress_logs(log_id);
CREATE INDEX IF NOT EXISTS idx_scraper_progress_logs_created_at
  ON scraper_progress_logs(created_at DESC);

-- 3. RLS
ALTER TABLE scraper_progress_logs ENABLE ROW LEVEL SECURITY;

-- 4. Policies
DROP POLICY IF EXISTS "Allow public read access to progress logs"
  ON scraper_progress_logs;
CREATE POLICY "Allow public read access to progress logs"
  ON scraper_progress_logs
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow service role to insert progress logs"
  ON scraper_progress_logs;
CREATE POLICY "Allow service role to insert progress logs"
  ON scraper_progress_logs
  FOR INSERT
  WITH CHECK (true);
`;

  try {
    // Försök köra SQL direkt
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('❌ Fel vid SQL-körning:', error);
      console.log('\n📝 Försök istället:');
      console.log('1. Gå till Supabase Dashboard → SQL Editor');
      console.log('2. Kopiera SQL från database/migrations/CREATE_SCRAPER_PROGRESS_LOGS_FIXED.sql');
      console.log('3. Kör SQL:en där');
      return;
    }

    console.log('✅ Tabell skapad!');

    // Verifiera att tabellen finns
    const { data: tables, error: checkError } = await supabase
      .from('scraper_progress_logs')
      .select('*')
      .limit(1);

    if (!checkError) {
      console.log('✅ Verifierad: Tabellen finns och fungerar!');
    } else {
      console.log('⚠️  Tabell kanske skapades men kunde inte verifieras');
    }

  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

createProgressLogsTable();
