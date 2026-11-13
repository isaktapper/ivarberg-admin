/**
 * Torsdagsbrevet – bilder för mejl.
 *
 * Mejlklienter (framför allt Outlook) visar inte WebP och klarar inte
 * jättestora original. Varje utvalt evenemang får därför en färdig JPEG på
 * 1200×675 (16:9, cover-beskuren mot bildens mest intressanta del) i publik
 * Supabase Storage.
 *
 * Konvertering och uppladdning återanvänder Instagram-flödets
 * uploadInstagramImage() och dess bucket. Filerna läggs under
 * `newsletter/<torsdag>/` så att de aldrig krockar med Instagram-bilderna
 * (som ligger i bucketens rot och rensas per datum).
 */
import { createHash } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import { InstagramFormat, originalImageUrl, uploadInstagramImage } from '../services/instagram-post-service'
import { NewsletterCandidate, NewsletterProposal } from './proposal'

const EMAIL_IMAGE_FORMAT: InstagramFormat = {
  key: 'landscape',
  label: '16:9',
  width: 1200,
  height: 675,
  aspect: 1200 / 675,
}

/**
 * Skapar mejlbilden för en kandidat och returnerar den publika URL:en, eller
 * null om evenemanget saknar bild eller bilden inte går att läsa (kortet
 * visas då utan bild).
 */
export async function createEmailImage(
  supabase: SupabaseClient,
  issueDate: string,
  candidate: NewsletterCandidate
): Promise<string | null> {
  if (!candidate.imageUrl) return null
  // Originalbilden, utan ImageKits banner-transformation
  const source = originalImageUrl(candidate.imageUrl)
  // Källans hash i filnamnet: byts evenemangets bild får mejlbilden en ny URL
  // i stället för att en cachad gammal version visas
  const hash = createHash('sha1').update(source).digest('hex').slice(0, 8)
  try {
    return await uploadInstagramImage(
      supabase,
      source,
      `newsletter/${issueDate}/${candidate.eventId}-${hash}`,
      1,
      EMAIL_IMAGE_FORMAT
    )
  } catch (error) {
    console.warn(
      `  ⚠️ Mejlbilden för "${candidate.name}" kunde inte skapas - kortet visas utan bild:`,
      error instanceof Error ? error.message : error
    )
    return null
  }
}

/**
 * Ser till att de valda kandidaterna har en mejlbild. Ändrar förslaget på
 * plats och returnerar true om något lades till (förslaget ska då sparas).
 */
export async function ensureEmailImages(
  supabase: SupabaseClient,
  proposal: NewsletterProposal,
  eventIds: number[]
): Promise<boolean> {
  const wanted = proposal.candidates.filter((c) => eventIds.includes(c.eventId) && c.imageUrl && !c.emailImageUrl)
  if (wanted.length === 0) return false
  const urls = await Promise.all(wanted.map((c) => createEmailImage(supabase, proposal.issueDate, c)))
  let changed = false
  wanted.forEach((c, i) => {
    if (urls[i]) {
      c.emailImageUrl = urls[i]
      changed = true
    }
  })
  return changed
}
