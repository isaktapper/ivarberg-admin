/**
 * Automatisk berikning av auto-skapade pending-arrangörer.
 *
 * Flöde per arrangör:
 * 1. Hitta arrangörens webbplats - normalisera befintlig URL till rotdomän,
 *    eller sök fram den via DuckDuckGo (gratis) om den saknas.
 * 2. Hämta webbplatsen med vanlig fetch + cheerio (organizer-site-fetcher)
 *    och extrahera e-post, telefon och adress. Ingen Firecrawl - noll credits.
 * 3. Låt AI bedöma: är detta en riktig arrangör, en plats/lokal, eller en
 *    dublett av en befintlig arrangör?
 * 4. Agera på bedömningen:
 *    - Riktig arrangör med hög confidence + kontaktuppgifter → auto-godkänn (active)
 *    - Dublett med hög confidence → slå ihop (flytta events, arkivera dubletten)
 *    - Plats/lokal eller osäker → fyll i det vi hittade, behåll pending med AI-notering
 *
 * Körs dels som backfill (scripts/enrich-pending-organizers.ts), dels
 * automatiskt efter varje scraper-körning (scripts/run-scrapers.ts).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { fetchSiteData, guessWebsiteCandidates, SiteData } from './organizer-site-fetcher';
import { getOpenAIClient } from './openai-client';

interface OrganizerRow {
  id: number;
  name: string;
  venue_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  location?: string | null;
  alternative_names?: string[] | null;
  status: string;
  scraper_source?: string | null;
}

interface AIVerdict {
  kind: 'organizer' | 'venue_or_place' | 'duplicate';
  duplicate_of_id: number | null;
  website_belongs_to_organizer: boolean;
  email: string | null;
  phone: string | null;
  confidence: number;
  note: string;
}

export interface EnrichmentOutcome {
  organizerId: number;
  name: string;
  action: 'approved' | 'updated_pending' | 'merged' | 'flagged' | 'failed';
  note: string;
  changes?: Record<string, unknown>;
}

export interface EnrichmentOptions {
  /** Max antal arrangörer att berika denna körning */
  limit?: number;
  /** Logga bara vad som skulle hända - skriv ingenting till databasen */
  dryRun?: boolean;
  /** Berika endast en specifik arrangör (ignorerar limit och enriched_at) */
  onlyId?: number;
  /** Inkludera arrangörer som redan berikats en gång (default: endast o-berikade) */
  force?: boolean;
}

// Domäner som aldrig är arrangörens egen webbplats
// (förmedlare, kataloger, sociala medier och biljettplattformar)
const BLOCKED_WEBSITE_DOMAINS = [
  'visitvarberg.se',
  'ivarberg.se',
  'facebook.com',
  'instagram.com',
  'google.com',
  'tripadvisor.',
  'eniro.se',
  'hitta.se',
  'wikipedia.org',
  'allevents.in',
  'eventbrite.',
  'tickster.com',
  'ebiljett.nu',
  'ticketmaster.',
  'billetto.',
  'nortic.se',
  'axs.com',
];

// Auto-godkänn kräver minst denna confidence från AI:n
const APPROVE_CONFIDENCE = 0.75;
// Sammanslagning av dubletter kräver högre säkerhet
const MERGE_CONFIDENCE = 0.85;

export class OrganizerEnricher {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Berika pending-arrangörer enligt options. Returnerar utfall per arrangör.
   */
  async enrichPendingOrganizers(options: EnrichmentOptions = {}): Promise<EnrichmentOutcome[]> {
    const { limit = 20, dryRun = false, onlyId, force = false } = options;

    let query = this.supabase
      .from('organizers')
      .select('id, name, venue_name, email, phone, website, location, alternative_names, status, scraper_source')
      .eq('status', 'pending');

    if (onlyId) {
      query = query.eq('id', onlyId);
    } else {
      if (!force) {
        query = query.is('enriched_at', null);
      }
      query = query.order('id', { ascending: true }).limit(limit);
    }

    const { data: pending, error } = await query;
    if (error) {
      throw new Error(`Kunde inte hämta pending-arrangörer: ${error.message}`);
    }
    if (!pending || pending.length === 0) {
      console.log('✅ Inga pending-arrangörer att berika');
      return [];
    }

    console.log(`\n🔎 Berikar ${pending.length} pending-arrangör(er)${dryRun ? ' [DRY-RUN]' : ''}...\n`);

    // Hämta alla icke-arkiverade arrangörer en gång - används för dublettkontroll
    const { data: allOrganizers } = await this.supabase
      .from('organizers')
      .select('id, name, alternative_names, status')
      .neq('status', 'archived');

    const outcomes: EnrichmentOutcome[] = [];

    for (const org of pending as OrganizerRow[]) {
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`🏢 ${org.name} (ID: ${org.id})`);

      try {
        const outcome = await this.enrichOne(org, allOrganizers || [], dryRun);
        outcomes.push(outcome);
        console.log(`   → ${outcome.action}: ${outcome.note}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Berikning misslyckades: ${msg}`);
        outcomes.push({ organizerId: org.id, name: org.name, action: 'failed', note: msg });

        // Markera som försökt så att den inte blockerar kön varje körning
        if (!dryRun) {
          await this.supabase
            .from('organizers')
            .update({
              enriched_at: new Date().toISOString(),
              enrichment_note: `Berikning misslyckades: ${msg.substring(0, 300)}`,
            })
            .eq('id', org.id);
        }
      }

      // Snäll mot Firecrawl/OpenAI rate limits
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    this.logSummary(outcomes, dryRun);
    return outcomes;
  }

  private async enrichOne(
    org: OrganizerRow,
    allOrganizers: Pick<OrganizerRow, 'id' | 'name' | 'alternative_names' | 'status'>[],
    dryRun: boolean
  ): Promise<EnrichmentOutcome> {
    // 1. Bestäm vilken webbplats vi ska crawla
    let websiteUrl = normalizeWebsiteUrl(org.website);
    let websiteSource: 'existing' | 'search' | null = websiteUrl ? 'existing' : null;

    if (!websiteUrl) {
      websiteUrl = await this.searchForWebsite(org.name);
      websiteSource = websiteUrl ? 'search' : null;
    }

    // 2. Hämta webbplatsen om vi har en (vanlig fetch + cheerio, inga credits)
    let site: SiteData | null = null;
    if (websiteUrl) {
      console.log(`   🌐 Webbplats (${websiteSource}): ${websiteUrl}`);
      site = await fetchSiteData(websiteUrl);
      if (!site) {
        console.warn(`   ⚠️ Kunde inte hämta ${websiteUrl}, fortsätter utan sajtdata`);
      } else if (site.email || site.phone) {
        console.log(`   📇 Hittade: ${[site.email, site.phone].filter(Boolean).join(', ')}`);
      }
    } else {
      console.log('   🌐 Ingen webbplats hittad (varken sparad eller via sökning)');
    }

    // 3. AI-bedömning
    const verdict = await this.getAIVerdict(org, websiteUrl, site, allOrganizers);
    console.log(
      `   🤖 AI: ${verdict.kind} (confidence ${(verdict.confidence * 100).toFixed(0)}%)` +
      (verdict.kind === 'duplicate' ? ` → dublett av ID ${verdict.duplicate_of_id}` : '')
    );

    // 4. Agera på bedömningen
    const now = new Date().toISOString();

    // 4a. Dublett med hög säkerhet → slå ihop
    if (
      verdict.kind === 'duplicate' &&
      verdict.duplicate_of_id &&
      verdict.confidence >= MERGE_CONFIDENCE &&
      allOrganizers.some(o => o.id === verdict.duplicate_of_id && o.id !== org.id)
    ) {
      if (!dryRun) {
        await this.mergeInto(org, verdict.duplicate_of_id, verdict.note, now);
      }
      return {
        organizerId: org.id,
        name: org.name,
        action: 'merged',
        note: `Sammanslagen med arrangör ID ${verdict.duplicate_of_id}. ${verdict.note}`,
      };
    }

    // Kontaktuppgifter: AI:ns val i första hand, annars sajtens mailto/tel/regex-fynd.
    // Skriv aldrig över befintliga värden.
    const newEmail = org.email || verdict.email || site?.email || null;
    const newPhone = org.phone || verdict.phone || site?.phone || null;
    const websiteVerified = !!websiteUrl && verdict.website_belongs_to_organizer;
    const newWebsite = org.website && websiteSource === 'existing'
      ? websiteUrl // normaliserad variant av befintlig
      : (websiteVerified ? websiteUrl : org.website || null);

    const changes: Record<string, unknown> = {};
    if (newEmail !== (org.email || null)) changes.email = newEmail;
    if (newPhone !== (org.phone || null)) changes.phone = newPhone;
    if (newWebsite !== (org.website || null)) changes.website = newWebsite;

    // 4b. Riktig arrangör med hög confidence och kontaktväg → auto-godkänn
    const canApprove =
      verdict.kind === 'organizer' &&
      verdict.confidence >= APPROVE_CONFIDENCE &&
      websiteVerified &&
      (!!newEmail || !!newPhone);

    if (canApprove) {
      if (!dryRun) {
        await this.supabase
          .from('organizers')
          .update({
            ...changes,
            status: 'active',
            needs_review: false,
            enriched_at: now,
            enrichment_note: `Auto-godkänd: ${verdict.note}`,
          })
          .eq('id', org.id);
      }
      return {
        organizerId: org.id,
        name: org.name,
        action: 'approved',
        note: verdict.note,
        changes,
      };
    }

    // 4c. Plats/lokal eller osäker bedömning → fyll i uppgifter, behåll pending
    const reviewPrefix = verdict.kind === 'venue_or_place'
      ? 'Troligen en plats/lokal, inte en arrangör'
      : verdict.kind === 'duplicate'
        ? `Möjlig dublett av ID ${verdict.duplicate_of_id} (för osäker för auto-merge)`
        : 'Behöver manuell granskning';

    if (!dryRun) {
      await this.supabase
        .from('organizers')
        .update({
          ...changes,
          enriched_at: now,
          enrichment_note: `${reviewPrefix}: ${verdict.note}`,
        })
        .eq('id', org.id);
    }

    return {
      organizerId: org.id,
      name: org.name,
      action: verdict.kind === 'organizer' ? 'updated_pending' : 'flagged',
      note: `${reviewPrefix}: ${verdict.note}`,
      changes,
    };
  }

  /**
   * Gissa arrangörens webbplats från namnet (teaterhalland.se osv), testa
   * vilka domäner som svarar och låt AI välja rätt kandidat. Gratis -
   * sökmotorernas HTML-endpoints bot-blockerar serveranrop.
   */
  private async searchForWebsite(name: string): Promise<string | null> {
    let candidates: Array<{ url: string; title: string; description: string }> = [];
    try {
      candidates = await guessWebsiteCandidates(name, 3);
    } catch {
      console.warn(`   ⚠️ Domängissning misslyckades för "${name}"`);
      return null;
    }
    if (candidates.length === 0) return null;

    const prompt = `Vilken av följande webbplatser är den officiella webbplatsen för "${name}" i Varberg, Sverige?

${candidates.map((c, i) => `${i + 1}. ${c.url}\n   Titel: ${c.title || '-'}\n   Beskrivning: ${(c.description || '-').substring(0, 150)}`).join('\n')}

Svara med ENDAST JSON: {"index": <nummer eller null om ingen är arrangörens egen webbplats>}
Välj null hellre än att gissa. Parkerade domäner, kataloger och orelaterade verksamheter räknas inte.`;

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 50,
      posthogProperties: { feature: 'organizer-enrichment-search', organizer: name },
    });

    try {
      const parsed = JSON.parse(cleanJsonResponse(response.choices[0]?.message?.content || '{}'));
      if (typeof parsed.index === 'number' && candidates[parsed.index - 1]) {
        return normalizeWebsiteUrl(candidates[parsed.index - 1].url);
      }
    } catch {
      // Ogiltig JSON = ingen träff
    }
    return null;
  }

  /**
   * AI-bedömning: riktig arrangör, plats/lokal eller dublett?
   */
  private async getAIVerdict(
    org: OrganizerRow,
    websiteUrl: string | null,
    site: SiteData | null,
    allOrganizers: Pick<OrganizerRow, 'id' | 'name' | 'alternative_names' | 'status'>[]
  ): Promise<AIVerdict> {
    const otherOrganizers = allOrganizers
      .filter(o => o.id !== org.id)
      .map(o => `${o.id}: ${o.name}${o.alternative_names?.length ? ` (även: ${o.alternative_names.join(', ')})` : ''}`)
      .join('\n');

    const prompt = `Du granskar auto-skapade arrangörer för ivarberg.se (evenemangssida för Varberg, Sverige).
Arrangörer skapas automatiskt från scrapade events, och namnet är ofta i själva verket en PLATS (t.ex. en gatuadress, ett torg eller en lokal) snarare än en verklig arrangör (företag, förening, institution).

# Granska denna auto-skapade arrangör:
Namn: ${org.name}
Venue: ${org.venue_name || '-'}
E-post (från scrape): ${org.email || '-'}
Telefon (från scrape): ${org.phone || '-'}
Webbplats: ${websiteUrl || '-'}

${site ? `# Innehåll från webbplatsen (${websiteUrl}):
Titel: ${site.title}
Beskrivning: ${site.metaDescription || '-'}
Kontakt hittad på sajten: ${JSON.stringify({ email: site.email, phone: site.phone, address: site.address })}
Utdrag:
${site.textContent.substring(0, 2500)}
` : '# Ingen webbplats kunde hämtas.'}

# Befintliga arrangörer i databasen (för dublettkontroll):
${otherOrganizers}

Bedöm och svara med ENDAST giltig JSON:
{
  "kind": "organizer" | "venue_or_place" | "duplicate",
  "duplicate_of_id": <ID från listan ovan om dublett, annars null>,
  "website_belongs_to_organizer": <true om webbplatsen verkligen tillhör just denna arrangör - kolla att namn/verksamhet stämmer med sajtens innehåll, inte bara att en sajt hittades>,
  "email": <bästa e-postadress för arrangören från sajtinnehållet, annars null>,
  "phone": <bästa telefonnummer, annars null>,
  "confidence": <0.0-1.0, hur säker du är på "kind"-bedömningen>,
  "note": "<1-2 meningar på svenska som motiverar bedömningen>"
}

Riktlinjer:
- "duplicate" = samma verksamhet finns redan i listan under annat namn/stavning (t.ex. "Varbergs Fästning" vs "Fästningen Varberg"). Ange då duplicate_of_id.
- "venue_or_place" = en adress, gata, park, torg eller lokal som inte själv arrangerar (t.ex. "Kungsgatan 24", "Societetsparken").
- Ett hotell, en restaurang, en teater eller en förening som själv håller evenemang är "organizer", inte "venue_or_place".
- Var konservativ med confidence om webbplatsdata saknas eller inte matchar namnet.`;

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Du är en noggrann datagranskare för en svensk evenemangsplattform. Svara alltid med endast giltig JSON, ingen markdown.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 400,
      posthogProperties: { feature: 'organizer-enrichment-verdict', organizer: org.name },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error('Tomt svar från OpenAI vid AI-bedömning');

    const parsed = JSON.parse(cleanJsonResponse(raw)) as Partial<AIVerdict>;
    if (!parsed.kind || !['organizer', 'venue_or_place', 'duplicate'].includes(parsed.kind)) {
      throw new Error(`Ogiltig kind i AI-svar: ${JSON.stringify(parsed).substring(0, 200)}`);
    }

    return {
      kind: parsed.kind,
      duplicate_of_id: typeof parsed.duplicate_of_id === 'number' ? parsed.duplicate_of_id : null,
      website_belongs_to_organizer: parsed.website_belongs_to_organizer === true,
      email: typeof parsed.email === 'string' && parsed.email.includes('@') ? parsed.email.trim().toLowerCase() : null,
      phone: typeof parsed.phone === 'string' && parsed.phone.length >= 7 ? parsed.phone.trim() : null,
      confidence: typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0,
      note: typeof parsed.note === 'string' ? parsed.note : '',
    };
  }

  /**
   * Slå ihop en pending-dublett med en befintlig arrangör:
   * flytta events, lägg till namnet som alternativt namn, arkivera dubletten.
   */
  private async mergeInto(org: OrganizerRow, targetId: number, note: string, now: string): Promise<void> {
    // 1. Flytta alla events till målarrangören
    const { error: eventsError } = await this.supabase
      .from('events')
      .update({ organizer_id: targetId })
      .eq('organizer_id', org.id);
    if (eventsError) {
      throw new Error(`Kunde inte flytta events till ID ${targetId}: ${eventsError.message}`);
    }

    // 2. Lägg till namnet som alternativt namn på målet så matchern träffar direkt nästa gång
    const { data: target } = await this.supabase
      .from('organizers')
      .select('alternative_names, name')
      .eq('id', targetId)
      .single();

    if (target && target.name.trim().toLowerCase() !== org.name.trim().toLowerCase()) {
      const existing: string[] = target.alternative_names || [];
      if (!existing.some(n => n.trim().toLowerCase() === org.name.trim().toLowerCase())) {
        await this.supabase
          .from('organizers')
          .update({ alternative_names: [...existing, org.name] })
          .eq('id', targetId);
      }
    }

    // 3. Arkivera dubletten
    await this.supabase
      .from('organizers')
      .update({
        status: 'archived',
        needs_review: false,
        enriched_at: now,
        enrichment_note: `Sammanslagen med arrangör ID ${targetId}: ${note}`,
      })
      .eq('id', org.id);

    console.log(`   🔀 Events flyttade till ID ${targetId}, "${org.name}" arkiverad`);
  }

  private logSummary(outcomes: EnrichmentOutcome[], dryRun: boolean): void {
    const count = (action: EnrichmentOutcome['action']) => outcomes.filter(o => o.action === action).length;
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 Berikning klar${dryRun ? ' [DRY-RUN - inget sparades]' : ''}:`);
    console.log(`   ✅ Auto-godkända:        ${count('approved')}`);
    console.log(`   🔀 Sammanslagna:         ${count('merged')}`);
    console.log(`   📝 Uppdaterade (pending): ${count('updated_pending')}`);
    console.log(`   🚩 Flaggade för granskning: ${count('flagged')}`);
    console.log(`   ❌ Misslyckade:          ${count('failed')}`);
    console.log(`${'='.repeat(50)}\n`);
  }
}

/**
 * Normalisera en webbplats-URL till rotdomänen (origin).
 * "https://sonjasveranda.se/jul" → "https://sonjasveranda.se"
 * Returnerar null för ogiltiga URL:er och kända förmedlar-/katalogdomäner.
 */
export function normalizeWebsiteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (BLOCKED_WEBSITE_DOMAINS.some(d => parsed.hostname.includes(d))) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/** Ta bort ev. markdown-kodblock runt ett JSON-svar från AI */
function cleanJsonResponse(raw: string): string {
  let clean = raw.trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return clean;
}

export const organizerEnricher = new OrganizerEnricher();
