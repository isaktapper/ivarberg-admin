/**
 * Delad OpenAI-klient med PostHog AI-observability.
 *
 * Alla AI-anrop går genom denna klient så att modell, tokens, kostnad,
 * latens och fel loggas som $ai_generation-events i PostHog.
 *
 * Fallback: om POSTHOG_API_KEY saknas skapas PostHog-klienten i avstängt
 * läge (capture blir no-op) och OpenAI-anropen fungerar exakt som vanligt.
 *
 * Env:
 * - POSTHOG_API_KEY   (valfri) PostHog project API key (phc_...)
 * - POSTHOG_HOST      (valfri) default https://eu.i.posthog.com
 * - POSTHOG_PRIVACY_MODE (valfri) sätt till "true" för att inte skicka
 *   prompt/svar-innehåll till PostHog (endast metadata/kostnad)
 */
import { PostHog } from 'posthog-node';
import { OpenAI as PostHogOpenAI } from '@posthog/ai/openai';

let posthog: PostHog | null = null;
let openaiClient: PostHogOpenAI | null = null;

export function getPostHogClient(): PostHog {
  if (!posthog) {
    const apiKey = process.env.POSTHOG_API_KEY;

    posthog = new PostHog(apiKey || 'phc_disabled', {
      host: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
      // Skicka events direkt istället för att batcha - viktigt i serverless
      // (Vercel) där processen kan frysas innan en batch hunnit skickas
      flushAt: 1,
      privacyMode: process.env.POSTHOG_PRIVACY_MODE === 'true',
    });

    if (!apiKey) {
      // Ingen nyckel = avstängd telemetri, alla capture-anrop blir no-ops
      void posthog.disable();
    }
  }
  return posthog;
}

/**
 * OpenAI-klient wrappad med PostHog. Drop-in-ersättare för `new OpenAI()`.
 * Skicka `posthogProperties: { feature: '...' }` i varje create-anrop
 * för att kunna bryta ner kostnad per funktion i PostHog.
 */
export function getOpenAIClient(): PostHogOpenAI {
  if (!openaiClient) {
    openaiClient = new PostHogOpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? '',
      posthog: getPostHogClient(),
    });
  }
  return openaiClient;
}

/**
 * Måste anropas innan en kortlivad process (skript/scraper) avslutas,
 * annars kan de sista eventen tappas. Säker att anropa även om PostHog
 * aldrig initierats eller är avstängd.
 */
export async function shutdownAITelemetry(): Promise<void> {
  if (posthog) {
    try {
      await posthog.shutdown();
    } catch (error) {
      console.warn('⚠️ PostHog shutdown misslyckades (ignoreras):', error);
    }
    posthog = null;
    openaiClient = null;
  }
}
