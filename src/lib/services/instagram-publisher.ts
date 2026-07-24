/**
 * Publicering av Instagram-poster via extern transport.
 *
 * Nuvarande transport: Make.com custom webhook. Make-scenariot tar emot
 * { image_urls, image_url, caption } och postar till Instagram for Business -
 * karusell vid >= 2 bilder, enbildspost annars (Graph API kräver minst 2
 * barn för en karusell, så scenariot behöver en router på antalet).
 * image_url = första bilden, behålls för bakåtkompatibilitet tills
 * Make-scenariot uppdaterats. Interfacet gör det enkelt att byta transport.
 */

export interface InstagramPostPayload {
  imageUrls: string[] // 1-5 publika JPEG-URL:er (Supabase Storage); [0] = primär slide
  caption: string
}

export interface InstagramPublisher {
  publish(post: InstagramPostPayload): Promise<void>
}

export class MakeWebhookPublisher implements InstagramPublisher {
  private webhookUrl: string
  private apiKey?: string

  constructor(webhookUrl?: string, apiKey?: string) {
    const url = webhookUrl ?? process.env.MAKE_WEBHOOK_URL
    if (!url) {
      throw new Error('Missing MAKE_WEBHOOK_URL environment variable')
    }
    this.webhookUrl = url
    // Valfri API-nyckel: om webhooken i Make har "API Key authentication"
    // skickas nyckeln i x-make-apikey-headern
    this.apiKey = apiKey ?? process.env.MAKE_WEBHOOK_API_KEY
  }

  async publish(post: InstagramPostPayload): Promise<void> {
    if (post.imageUrls.length === 0) {
      throw new Error('InstagramPostPayload kräver minst en bild-URL')
    }
    const body = JSON.stringify({
      image_urls: post.imageUrls,
      image_url: post.imageUrls[0], // bakåtkompat tills Make-scenariot hanterar image_urls
      caption: post.caption,
    })

    // Ett omförsök vid nätverksfel/5xx - Make svarar normalt "Accepted" direkt
    const attempts = 2
    let lastError: unknown
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'x-make-apikey': this.apiKey } : {}),
          },
          body,
          signal: AbortSignal.timeout(30000),
        })

        if (response.ok) {
          return
        }

        const text = await response.text().catch(() => '')
        lastError = new Error(`Make webhook svarade ${response.status}: ${text.substring(0, 200)}`)
        // 4xx = konfigurationsfel, meningslöst att försöka igen
        if (response.status < 500) break
      } catch (error) {
        lastError = error
      }

      if (i < attempts - 1) {
        console.log('  ⏳ Webhook-anrop misslyckades, försöker igen om 5s...')
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }
}
