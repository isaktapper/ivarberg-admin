/**
 * Push-notiser via ntfy (https://ntfy.sh) - används för att be om
 * godkännande av dagens Instagram-post.
 *
 * Konfiguration:
 *   NTFY_TOPIC   - topic-namnet (fungerar som lösenord på publika ntfy.sh,
 *                  välj något långt och slumpat). Saknas det skickas inget.
 *   NTFY_SERVER  - valfri, default https://ntfy.sh (självhostad/Pro)
 *   NTFY_TOKEN   - valfri access-token för reserverade topics
 *
 * Ett anrop = ett HTTP POST med JSON. Inga konton eller SDK:er behövs.
 */

export type NtfyPriority = 1 | 2 | 3 | 4 | 5 // 1 = min, 3 = default, 5 = urgent

export type NtfyAction =
  | { action: 'view'; label: string; url: string; clear?: boolean }
  | {
      action: 'http'
      label: string
      url: string
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
      headers?: Record<string, string>
      body?: string
      clear?: boolean
    }

export interface NtfyMessage {
  title: string
  message: string
  /** URL som öppnas när man trycker på notisen */
  click?: string
  /** Publik bild-URL som visas i notisen */
  attach?: string
  /** Max 3 knappar */
  actions?: NtfyAction[]
  priority?: NtfyPriority
  /** Emoji-taggar, t.ex. ['camera'] */
  tags?: string[]
}

export function ntfyConfigured(): boolean {
  return !!process.env.NTFY_TOPIC
}

/**
 * Skickar en notis. Returnerar false (och loggar) om NTFY_TOPIC saknas eller
 * anropet misslyckas - en missad notis får aldrig fälla Instagram-flödet.
 */
export async function sendNtfy(msg: NtfyMessage): Promise<boolean> {
  const topic = process.env.NTFY_TOPIC
  if (!topic) {
    console.warn('⚠️ NTFY_TOPIC saknas - ingen notis skickad')
    return false
  }
  const server = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '')

  const payload: Record<string, unknown> = {
    topic,
    title: msg.title,
    message: msg.message,
    priority: msg.priority ?? 3,
  }
  if (msg.click) payload.click = msg.click
  if (msg.attach) payload.attach = msg.attach
  if (msg.tags?.length) payload.tags = msg.tags
  if (msg.actions?.length) payload.actions = msg.actions.slice(0, 3)

  try {
    const response = await fetch(server, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.warn(`⚠️ ntfy svarade ${response.status}: ${text.slice(0, 200)}`)
      return false
    }
    return true
  } catch (error) {
    console.warn('⚠️ ntfy-anropet misslyckades:', error instanceof Error ? error.message : error)
    return false
  }
}
