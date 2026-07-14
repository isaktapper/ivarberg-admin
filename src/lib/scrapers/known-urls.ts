/**
 * Läser vilka organizer_event_url:er som redan finns i databasen.
 * Används av Firecrawl-scrapersarna för att bara hämta detaljsidor för NYA
 * events - det håller Firecrawl-förbrukningen inom gratisplanen.
 * Endast läsning, skriver aldrig något.
 */
import { createClient } from '@supabase/supabase-js';

export async function loadKnownEventUrls(pattern: string): Promise<Set<string>> {
  const urls = new Set<string>();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ Supabase-env saknas - kan inte läsa kända event-URL:er (alla detaljsidor hämtas)');
    return urls;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('events')
      .select('organizer_event_url')
      .ilike('organizer_event_url', pattern)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Kunde inte läsa kända URL:er: ${error.message}`);
    for (const row of data ?? []) {
      if (row.organizer_event_url) urls.add(row.organizer_event_url);
    }
    if (!data || data.length < pageSize) break;
  }
  return urls;
}
