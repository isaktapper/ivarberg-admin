import { createClient } from '@supabase/supabase-js';

/**
 * Genererar ett unikt event_id baserat på eventnamn och källa
 * Följer samma mönster som scrapern använder
 */
export async function generateUniqueEventId(
  eventName: string,
  source: string = 'manual',
  supabaseClient?: ReturnType<typeof createClient>
): Promise<string> {
  // Använd medskickad client eller skapa en server-side client
  const supabase = supabaseClient || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Generera slug från eventnamnet
  const slug = eventName
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80); // Max 80 tecken
  
  // Använd endast eventnamnet som bas (utan source-prefix)
  let baseEventId = slug;
  
  // Kolla om detta event_id redan finns
  let counter = 1;
  let finalEventId = baseEventId;
  
  while (await eventIdExists(finalEventId, supabase)) {
    // Om ID redan finns, lägg till suffix
    finalEventId = `${baseEventId}-${counter}`;
    counter++;
    
    // Säkerhetsspärr: om counter blir för hög, lägg till source
    if (counter > 10) {
      const sourceSlug = source.toLowerCase().replace(/\s+/g, '-');
      finalEventId = `${sourceSlug}-${baseEventId}-${counter}`;
    }
  }
  
  return finalEventId;
}

/**
 * Kollar om ett event_id redan finns i databasen
 */
async function eventIdExists(
  eventId: string,
  supabase: ReturnType<typeof createClient>
): Promise<boolean> {
  const { data } = await supabase
    .from('events')
    .select('id')
    .eq('event_id', eventId)
    .limit(1);
  
  return (data?.length ?? 0) > 0;
}

