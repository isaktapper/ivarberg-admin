/**
 * Torsdagsbrevet – innehållet i ett utskick.
 *
 * Det här är kontraktet mellan flödet (utkast → godkännande → utskick) och
 * mejlmallen i email-template.ts. Allt som syns i mejlet finns här, så att
 * förhandsvisningen, testmejlet och det riktiga utskicket blir identiska.
 */

/** Ett av de utvalda evenemangen ("Veckans tre") */
export interface NewsletterPick {
  eventId: number
  /** events.event_id – används i länken https://<sajt>/event/<slug> */
  slug: string
  name: string
  /** Lokal tid som i events.date_time: 'YYYY-MM-DD HH:mm:ss' eller med T */
  dateTime: string
  venue: string | null
  price: string | null
  /** Kategorin som visas som färgad etikett på kortet, t.ex. "Scen". Valfri. */
  category?: string | null
  /**
   * Färdig bild för mejl: JPEG, 1200×675 (16:9, beskuren), publikt nåbar.
   * WebP och jättestora originalbilder fungerar inte i alla mejlklienter.
   * null = kortet visas utan bild.
   */
  imageUrl: string | null
  /** Redaktionens rad om varför. Ska vara läst och godkänd av en människa. */
  comment: string
}

/** Ett evenemang i listan "Mer i helgen" */
export interface NewsletterListItem {
  slug: string
  name: string
  dateTime: string
  venue: string | null
  price: string | null
  /** Kategorin som visas som färgad etikett på kortet. Valfri. */
  category?: string | null
  /**
   * Liten bild till kortet: JPEG, 300×300 (kvadratisk, beskuren), publikt
   * nåbar. Visas i 76×76. null eller utelämnad = kortet visas utan bild.
   */
  imageUrl?: string | null
}

export interface NewsletterSponsor {
  /** T.ex. "Veckans brev kommer med hjälp av" */
  label: string
  name: string
  text: string
  url: string
}

export interface NewsletterContent {
  /** Torsdagen brevet går ut, YYYY-MM-DD */
  issueDate: string
  /** Fredag och söndag i helgen brevet handlar om, YYYY-MM-DD */
  weekendStart: string
  weekendEnd: string
  subject: string
  /** Texten som syns efter ämnesraden i inkorgen */
  preheader: string
  /** En eller två meningar överst. Radbrytning ger nytt stycke. */
  intro: string
  /** Normalt tre */
  picks: NewsletterPick[]
  /**
   * Övriga helgevenemang i prioritetsordning, viktigast först (pågående
   * utställningar sist). Mallen visar de fem första per dag, sorterade på tid.
   */
  more: NewsletterListItem[]
  /** Alla evenemang i helgen, även de som inte får plats i listan */
  totalWeekendCount: number
  /** Avslutningen, t.ex. "Trevlig helg!\nHälsningar från ivarberg.nu". Ett namn under gör brevet personligare. */
  signoff: string
  /** Valfritt P.S., t.ex. en länk till julsidan. Får innehålla en länk i formen [text](url). */
  ps?: string | null
  sponsor?: NewsletterSponsor | null
}

export interface NewsletterRenderOptions {
  /** Standard https://ivarberg.nu */
  siteUrl?: string
  /** Standard Resends platshållare, som byts mot en personlig länk vid utskick */
  unsubscribeUrl?: string
  /** Stadens namn i texterna. Standard Varberg. */
  cityName?: string
  /** Postadress i sidfoten */
  address?: string
}

export interface RenderedNewsletter {
  html: string
  text: string
}

/** Resends platshållare för avregistreringslänken i ett Broadcast */
export const RESEND_UNSUBSCRIBE_PLACEHOLDER = '{{{RESEND_UNSUBSCRIBE_URL}}}'
