/**
 * Torsdagsbrevet – konfiguration via miljövariabler (se docs/TORSDAGSBREVET.md).
 *
 *   NEWSLETTER_ENABLED            "true" slår på cron-flödet och riktiga utskick.
 *                                 Allt annat = avstängt: cronen gör ingenting och
 *                                 godkännande vägras. Förslag, förhandsvisning och
 *                                 testmejl fungerar ändå, så att flödet kan provas.
 *   RESEND_API_KEY                Resend-nyckel (finns redan för rapportmejlen)
 *   RESEND_NEWSLETTER_SEGMENT_ID  Segmentet i Resend som brevet skickas till
 *   NEWSLETTER_FROM               Avsändare, standard "ivarberg.nu <hej@news.ivarberg.nu>"
 *   NEWSLETTER_REPLY_TO           Valfri svarsadress
 *   NEWSLETTER_SITE_URL           Publika sajten, standard https://ivarberg.nu
 *   NEWSLETTER_ADDRESS            Valfri postadress i sidfoten (annars mallens standard)
 *   NEWSLETTER_SIGNOFF            Valfri standardavslutning (radbrytning skrivs som \n)
 *   NEWSLETTER_TEST_EMAIL         Valfri förifylld adress för testmejl
 */
import { NewsletterRenderOptions } from './types'

export const DEFAULT_FROM = 'ivarberg.nu <hej@news.ivarberg.nu>'
export const DEFAULT_SITE_URL = 'https://ivarberg.nu'
export const DEFAULT_SIGNOFF = 'Trevlig helg!\nHälsningar från ivarberg.nu'

/** Huvudbrytaren: utan NEWSLETTER_ENABLED=true händer inget automatiskt och inget skickas till prenumeranter */
export function newsletterEnabled(): boolean {
  return process.env.NEWSLETTER_ENABLED === 'true'
}

export function newsletterSiteUrl(): string {
  return (process.env.NEWSLETTER_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '')
}

export function newsletterFrom(): string {
  return process.env.NEWSLETTER_FROM || DEFAULT_FROM
}

export function newsletterReplyTo(): string | undefined {
  return process.env.NEWSLETTER_REPLY_TO || undefined
}

export function newsletterSegmentId(): string | undefined {
  return process.env.RESEND_NEWSLETTER_SEGMENT_ID || undefined
}

export function newsletterTestEmail(): string | null {
  return process.env.NEWSLETTER_TEST_EMAIL || null
}

/** Standardavslutningen från miljön (\n i värdet blir radbrytning) */
export function envSignoff(): string {
  const value = process.env.NEWSLETTER_SIGNOFF
  return value ? value.replace(/\\n/g, '\n') : DEFAULT_SIGNOFF
}

/** Alternativ till mallen för det riktiga utskicket (avregistreringslänken är Resends platshållare) */
export function renderOptions(): NewsletterRenderOptions {
  const options: NewsletterRenderOptions = { siteUrl: newsletterSiteUrl() }
  if (process.env.NEWSLETTER_ADDRESS) options.address = process.env.NEWSLETTER_ADDRESS
  return options
}

/**
 * Alternativ för förhandsvisning och testmejl: där finns ingen personlig
 * avregistreringslänk, så länken pekar på sajten i stället för platshållaren.
 */
export function previewRenderOptions(): NewsletterRenderOptions {
  return { ...renderOptions(), unsubscribeUrl: newsletterSiteUrl() }
}

/** Det som saknas för att kunna skicka testmejl */
export function missingTestConfig(): string[] {
  return process.env.RESEND_API_KEY ? [] : ['RESEND_API_KEY']
}

/** Det som saknas för ett riktigt utskick (tom lista = klart att skicka) */
export function missingSendConfig(): string[] {
  const missing: string[] = []
  if (!newsletterEnabled()) missing.push('NEWSLETTER_ENABLED=true')
  if (!process.env.RESEND_API_KEY) missing.push('RESEND_API_KEY')
  if (!newsletterSegmentId()) missing.push('RESEND_NEWSLETTER_SEGMENT_ID')
  return missing
}

export function adminBaseUrl(): string {
  return (process.env.ADMIN_BASE_URL || 'https://admin.ivarberg.nu').replace(/\/$/, '')
}

export function approvalUrlFor(token: string): string {
  return `${adminBaseUrl()}/newsletter/approve/${token}`
}

export function approvalApiUrlFor(token: string): string {
  return `${adminBaseUrl()}/api/newsletter/approve/${token}`
}
