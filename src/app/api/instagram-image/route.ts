import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import sharp from 'sharp'

/**
 * Instagram Image Proxy
 *
 * Hämtar en extern eventbild och konverterar den till ett format som
 * Instagram accepterar: JPEG, max 1080px bred, aspect ratio inom 4:5–1.91:1.
 * URL:en skickas till Make.com som postar bilden till Instagram.
 *
 * Skyddad med HMAC-signatur (INSTAGRAM_IMAGE_SECRET) så att routen inte
 * kan användas som öppen bildproxy. Signaturen skapas av
 * buildProxiedImageUrl() i src/lib/services/instagram-post-service.ts.
 *
 * Användning: /api/instagram-image?url=<encodad bild-URL>&sig=<hmac>
 */

export const maxDuration = 60

// Instagrams tillåtna aspect ratios för foto-poster
const MIN_RATIO = 4 / 5 // 0.8 (porträtt)
const MAX_RATIO = 1.91 // (landskap)
const TARGET_WIDTH = 1080

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const imageUrl = searchParams.get('url')
    const sig = searchParams.get('sig')

    if (!imageUrl || !sig) {
      return NextResponse.json({ error: 'url and sig parameters are required' }, { status: 400 })
    }

    const secret = process.env.INSTAGRAM_IMAGE_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    // Verifiera HMAC-signatur (timing-safe)
    const expected = createHmac('sha256', secret).update(imageUrl).digest('hex')
    const sigBuf = Buffer.from(sig, 'utf8')
    const expectedBuf = Buffer.from(expected, 'utf8')
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }

    try {
      new URL(imageUrl)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    // Hämta originalbilden (browser-UA för att kringgå hotlink-skydd)
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!response.ok) {
      console.error(`Failed to fetch image: ${imageUrl} - Status: ${response.status}`)
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.statusText}` },
        { status: 502 }
      )
    }

    const sourceBuffer = Buffer.from(await response.arrayBuffer())

    const metadata = await sharp(sourceBuffer).metadata()
    let width = metadata.width ?? 0
    let height = metadata.height ?? 0

    // EXIF-orientering 5-8 = bilden är roterad 90°, bredd/höjd byter plats
    if ((metadata.orientation ?? 1) >= 5) {
      ;[width, height] = [height, width]
    }

    if (!width || !height) {
      return NextResponse.json({ error: 'Could not read image dimensions' }, { status: 422 })
    }

    const ratio = width / height

    // .rotate() utan argument applicerar EXIF-orienteringen före resize
    let pipeline = sharp(sourceBuffer, { failOn: 'error' }).rotate()

    // Clampa aspect ratio till Instagrams tillåtna intervall genom crop
    if (ratio < MIN_RATIO) {
      // För hög (t.ex. lång affisch) → croppa till 4:5
      pipeline = pipeline.resize({
        width: TARGET_WIDTH,
        height: Math.round(TARGET_WIDTH / MIN_RATIO), // 1350
        fit: 'cover',
        position: sharp.strategy.attention,
      })
    } else if (ratio > MAX_RATIO) {
      // För bred (panorama) → croppa till 1.91:1
      pipeline = pipeline.resize({
        width: TARGET_WIDTH,
        height: Math.round(TARGET_WIDTH / MAX_RATIO), // 565
        fit: 'cover',
        position: sharp.strategy.attention,
      })
    } else {
      // Ratio OK → skala bara ner till max 1080px bred
      pipeline = pipeline.resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    }

    const jpegBuffer = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer()

    return new NextResponse(new Uint8Array(jpegBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpegBuffer.length),
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error) {
    console.error('Instagram image proxy error:', error)
    return NextResponse.json(
      {
        error: 'Failed to process image',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
