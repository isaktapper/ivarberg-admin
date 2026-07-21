/**
 * Supabase/PostgREST returnerar max 1000 rader per query oavsett hur många
 * som matchar. Alla ställen som behöver HELA resultatmängden (statistik,
 * dubblettdetektering, listor med client-side-filtrering) måste därför
 * paginera med .range() - annars räknas bara de första 1000 raderna.
 */

const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Hämta alla rader genom att loopa .range()-sidor tills en sida är ofull.
 *
 * OBS: queryn MÅSTE ha en stabil .order() (t.ex. på id eller created_at),
 * annars kan rader dupliceras eller tappas mellan sidorna.
 *
 * Exempel:
 *   const events = await fetchAllRows<Event>((from, to) =>
 *     supabase.from('events').select('*').order('id').range(from, to)
 *   );
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const all: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return all;
}
