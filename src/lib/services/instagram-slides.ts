/**
 * Ritar Instagram-slidesen ("vykortet") som JPEG i 1080x1350 (4:5).
 *
 *   - Vykort: eventets foto som ett vykort på dagens pastellfärg, med
 *     frimärke, poststämpel, rubrik och tid/plats. Fotot läggs in HELT
 *     (ingen cover-crop) - bara extrema format kläms till MIN/MAX_ASPECT.
 *   - Lista: "Mer i dag" med topp tre (frimärksbilder) och upp till fyra
 *     kompakta rader. Event utan bild får tiden i frimärket i stället.
 *
 * Satori bygger en SVG av ett element-träd (samma format som React-element,
 * men utan JSX så att modulen fungerar både i Next och i tsx-skript) och
 * sharp gör om den till JPEG. Typsnitten ligger i assets/fonts.
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import satori from 'satori'
import { DayColors, InstagramTheme, VARBERG_THEME, dayColors, postDateParts } from './instagram-theme'

export const SLIDE_WIDTH = 1080
export const SLIDE_HEIGHT = 1350

const W = SLIDE_WIDTH
const H = SLIDE_HEIGHT
const PAD = 80
// Bildytan för vykortet: vykortets underkant är alltid ZONE_BOTTOM så att
// rubriken hamnar på samma plats oavsett fotots form.
const ZONE_TOP = 250
const ZONE_BOTTOM = 965
const ZONE_WIDTH = W - 2 * PAD
const PAPER = 18 // vykortets vita kant
export const MAX_PHOTO_ASPECT = 2.2 // bredare bannrar beskärs till detta
export const MIN_PHOTO_ASPECT = 0.8 // högre bilder beskärs till 4:5

export const LIST_TOP_COUNT = 3
export const LIST_MORE_COUNT = 4
export const LIST_MAX_COUNT = LIST_TOP_COUNT + LIST_MORE_COUNT

const PAPER_COLOR = '#FFFDF8'
const DISPLAY = 'Bricolage Grotesque'
const BODY = 'Inter'

export interface VykortSlide {
  kind: 'vykort'
  postDate: string // YYYY-MM-DD
  category: string | null
  headline: string
  timeLabel: string // "19:00" eller "Heldag"
  place: string | null
  imageUrl: string
}

export interface ListRow {
  name: string
  timeLabel: string
  place: string | null
  imageUrl: string | null
}

export interface ListSlide {
  kind: 'list'
  postDate: string
  title: string // "Mer i dag"
  rows: ListRow[] // de tre första blir topp tre, resten kompakta rader
}

export type SlideSpec = VykortSlide | ListSlide

// ---------------------------------------------------------------------------
// Element-hjälpare (satori tar React-liknande objekt)
// ---------------------------------------------------------------------------

type Style = Record<string, string | number>
type Child = SatoriNode | string | null | false | undefined
interface SatoriNode {
  type: string
  props: Record<string, unknown> & { style?: Style; children?: unknown }
}

function h(type: string, style: Style, ...children: Child[]): SatoriNode {
  const kids = children.filter((c): c is SatoriNode | string => c !== null && c !== false && c !== undefined)
  return { type, props: { style, children: kids.length === 1 ? kids[0] : kids } }
}

function svg(attrs: Record<string, string | number>, inner: SatoriNode[]): SatoriNode {
  return { type: 'svg', props: { ...attrs, children: inner } }
}

function svgEl(type: string, attrs: Record<string, string | number>): SatoriNode {
  return { type, props: attrs }
}

/** Satori kan inte rita emoji utan extra laddare - de stryks ur texterna */
export function stripEmoji(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function timeText(timeLabel: string): string {
  return timeLabel === 'Heldag' ? 'Hela dagen' : timeLabel.replace(':', '.')
}

function metaText(timeLabel: string, place: string | null): string {
  return [timeText(timeLabel), place ? stripEmoji(place) : null].filter(Boolean).join(' · ')
}

// ---------------------------------------------------------------------------
// Typsnitt och bilder
// ---------------------------------------------------------------------------

type FontSpec = { name: string; data: Buffer; weight: 400 | 500 | 700 | 800; style: 'normal' }
let fontCache: FontSpec[] | null = null

function loadFonts(): FontSpec[] {
  if (fontCache) return fontCache
  const dir = path.join(process.cwd(), 'assets', 'fonts')
  const read = (file: string) => fs.readFileSync(path.join(dir, file))
  fontCache = [
    { name: BODY, data: read('Inter-Regular.woff'), weight: 400, style: 'normal' },
    { name: BODY, data: read('Inter-Medium.woff'), weight: 500, style: 'normal' },
    { name: DISPLAY, data: read('BricolageGrotesque-Bold.woff'), weight: 700, style: 'normal' },
    { name: DISPLAY, data: read('BricolageGrotesque-ExtraBold.woff'), weight: 800, style: 'normal' },
  ]
  return fontCache
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`Kunde inte hämta bilden (${response.status}): ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

/** Bildens bredd/höjd efter EXIF-rotation */
async function orientedSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata()
  let width = meta.width ?? 0
  let height = meta.height ?? 0
  if ((meta.orientation ?? 1) >= 5) [width, height] = [height, width]
  if (!width || !height) throw new Error('Bilden saknar mått')
  return { width, height }
}

/** Beskär (attention) och skalar till exakt w x h, som data-URI */
async function toDataUri(buffer: Buffer, w: number, h: number): Promise<string> {
  const jpeg = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({ width: Math.round(w), height: Math.round(h), fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

/** Vykortets fotomått för en bild med givet bildförhållande */
export function photoBox(aspect: number): { width: number; height: number } {
  const a = Math.min(MAX_PHOTO_ASPECT, Math.max(MIN_PHOTO_ASPECT, aspect))
  const maxW = ZONE_WIDTH - 2 * PAPER
  const maxH = ZONE_BOTTOM - ZONE_TOP - 2 * PAPER
  let width = maxW
  let height = width / a
  if (height > maxH) {
    height = maxH
    width = height * a
  }
  return { width: Math.round(width), height: Math.round(height) }
}

// ---------------------------------------------------------------------------
// Gemensamma delar
// ---------------------------------------------------------------------------

function waves(c: DayColors): SatoriNode {
  const rows: SatoriNode[] = []
  for (let y = 24; y < H; y += 46) {
    let d = `M-40 ${y}`
    for (let x = -40; x < W + 80; x += 80) d += ' q20 -12 40 0 t40 0'
    rows.push(svgEl('path', { d, fill: 'none', stroke: c.wave, 'stroke-width': 3.2 }))
  }
  return h(
    'div',
    { position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex' },
    svg({ width: W, height: H, viewBox: `0 0 ${W} ${H}` }, rows)
  )
}

function header(c: DayColors, postDate: string, chip: string | null, theme: InstagramTheme): SatoriNode[] {
  const p = postDateParts(postDate)
  const waveLines: SatoriNode[] = [0, 1, 2, 3, 4].map((i) => {
    const y = 28 + i * 22
    let d = `M100 ${y}`
    for (let x = 100; x < 300; x += 50) d += ' q12.5 -9 25 0 t25 0'
    return svgEl('path', { d, fill: 'none', stroke: c.ink, 'stroke-width': 4, 'stroke-linecap': 'round' })
  })

  return [
    // Datum + kategori
    h(
      'div',
      { position: 'absolute', left: PAD, top: PAD + 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 18 },
      h('div', { fontSize: 34, fontWeight: 500, color: c.ink }, `${p.weekdayName} ${p.day} ${p.monthName}`),
      chip
        ? h(
            'div',
            { display: 'flex', backgroundColor: c.ink, color: c.bg, fontSize: 27, fontWeight: 500, padding: '9px 22px', borderRadius: 999 },
            chip
          )
        : null
    ),
    // Frimärke med dagens datum
    h(
      'div',
      {
        position: 'absolute',
        right: PAD,
        top: PAD - 14,
        width: 132,
        height: 156,
        display: 'flex',
        padding: 10,
        backgroundColor: PAPER_COLOR,
        transform: 'rotate(3deg)',
        boxShadow: `0 2px 0 ${c.wave}`,
      },
      h(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          border: `3px dashed ${c.ink}55`,
          color: c.ink,
        },
        h('div', { fontSize: 26, fontWeight: 500, lineHeight: 1 }, p.weekdayShort),
        h('div', { fontFamily: DISPLAY, fontWeight: 800, fontSize: 66, lineHeight: 1, marginTop: 4 }, String(p.day))
      )
    ),
    // Poststämpel som stämplar frimärket: vågor + ring med stad och datum
    h(
      'div',
      {
        position: 'absolute',
        right: PAD + 104,
        top: 58,
        width: 470,
        height: 150,
        display: 'flex',
        opacity: 0.55,
        transform: 'rotate(-6deg)',
      },
      h(
        'div',
        { position: 'absolute', left: 0, top: 0, display: 'flex' },
        svg({ width: 470, height: 150, viewBox: '0 0 470 150' }, [
          ...waveLines,
          svgEl('circle', { cx: 390, cy: 72, r: 66, fill: 'none', stroke: c.ink, 'stroke-width': 4.5 }),
          svgEl('circle', { cx: 390, cy: 72, r: 54, fill: 'none', stroke: c.ink, 'stroke-width': 2 }),
        ])
      ),
      h(
        'div',
        {
          position: 'absolute',
          left: 330,
          top: 44,
          width: 120,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          color: c.ink,
          lineHeight: 1.25,
        },
        h('div', { fontSize: 17, fontWeight: 500, letterSpacing: 2 }, theme.postmarkCity),
        h('div', { fontSize: 17 }, p.stamp)
      )
    ),
  ]
}

function footer(c: DayColors, left: string, theme: InstagramTheme): SatoriNode {
  return h(
    'div',
    {
      position: 'absolute',
      left: PAD,
      right: PAD,
      bottom: PAD - 6,
      paddingTop: 22,
      borderTop: `3px solid ${c.ink}33`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 24,
      fontSize: 30,
      color: c.ink,
    },
    h('div', { display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flexShrink: 1 }, left),
    h('div', { display: 'flex', flexShrink: 0, opacity: 0.7 }, theme.domain)
  )
}

function root(c: DayColors, ...children: Child[]): SatoriNode {
  return h(
    'div',
    { width: W, height: H, display: 'flex', position: 'relative', backgroundColor: c.bg, fontFamily: BODY, color: c.ink },
    ...children
  )
}

function headlineSize(text: string): number {
  if (text.length <= 22) return 76
  if (text.length <= 34) return 68
  return 60
}

// ---------------------------------------------------------------------------
// Vykort
// ---------------------------------------------------------------------------

async function vykortTree(spec: VykortSlide, theme: InstagramTheme): Promise<SatoriNode> {
  const c = dayColors(theme, spec.postDate)
  const buffer = await fetchImageBuffer(spec.imageUrl)
  const size = await orientedSize(buffer)
  const box = photoBox(size.width / size.height)
  const src = await toDataUri(buffer, box.width, box.height)
  const cardW = box.width + 2 * PAPER
  const cardH = box.height + 2 * PAPER
  const headline = stripEmoji(spec.headline)

  return root(
    c,
    waves(c),
    ...header(c, spec.postDate, spec.category ? stripEmoji(spec.category) : null, theme),
    h(
      'div',
      {
        position: 'absolute',
        left: Math.round((W - cardW) / 2),
        top: ZONE_BOTTOM - cardH,
        width: cardW,
        height: cardH,
        display: 'flex',
        padding: PAPER,
        backgroundColor: PAPER_COLOR,
        boxShadow: `0 10px 0 ${c.wave}`,
      },
      { type: 'img', props: { src, width: box.width, height: box.height, style: { width: box.width, height: box.height } } }
    ),
    h(
      'div',
      {
        position: 'absolute',
        left: PAD,
        right: PAD,
        top: 1005,
        display: 'block',
        fontFamily: DISPLAY,
        fontWeight: 700,
        fontSize: headlineSize(headline),
        lineHeight: 1.02,
        letterSpacing: -1,
        lineClamp: 2,
      },
      headline
    ),
    footer(c, metaText(spec.timeLabel, spec.place), theme)
  )
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

async function thumbFor(row: ListRow, size: number): Promise<string | null> {
  if (!row.imageUrl) return null
  try {
    const buffer = await fetchImageBuffer(row.imageUrl)
    return await toDataUri(buffer, size * 2, size * 2)
  } catch (error) {
    console.warn(`  ⚠️ Frimärksbild för "${row.name}" kunde inte hämtas:`, error instanceof Error ? error.message : error)
    return null
  }
}

function stampThumb(c: DayColors, src: string | null, row: ListRow, size: number, rotation: number): SatoriNode {
  const pad = Math.round(size * 0.07)
  const inner = size - 2 * pad
  const content = src
    ? ({ type: 'img', props: { src, width: inner, height: inner, style: { width: inner, height: inner } } } as SatoriNode)
    : h(
        'div',
        {
          width: inner,
          height: inner,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `3px dashed ${c.ink}55`,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: row.timeLabel === 'Heldag' ? Math.round(size * 0.17) : Math.round(size * 0.24),
          textAlign: 'center',
          lineHeight: 1,
          color: c.ink,
        },
        row.timeLabel === 'Heldag' ? 'Hela dagen' : timeText(row.timeLabel)
      )
  return h(
    'div',
    {
      width: size,
      height: size,
      flexShrink: 0,
      display: 'flex',
      padding: pad,
      backgroundColor: PAPER_COLOR,
      transform: `rotate(${rotation}deg)`,
      boxShadow: `0 5px 0 ${c.wave}`,
    },
    content
  )
}

async function listTree(spec: ListSlide, theme: InstagramTheme): Promise<SatoriNode> {
  const c = dayColors(theme, spec.postDate)
  const top = spec.rows.slice(0, LIST_TOP_COUNT)
  const more = spec.rows.slice(LIST_TOP_COUNT, LIST_MAX_COUNT)
  const full = more.length > 0
  const size = full ? 128 : 196
  const rotations = [-2, 1.5, -1]
  const thumbs = await Promise.all(top.map((r) => thumbFor(r, size)))

  const topRows = top.map((row, i) =>
    h(
      'div',
      { display: 'flex', alignItems: 'center', gap: full ? 36 : 44 },
      stampThumb(c, thumbs[i], row, size, rotations[i]),
      h(
        'div',
        { display: 'flex', flexDirection: 'column', gap: full ? 8 : 12, flexShrink: 1, minWidth: 0 },
        h(
          'div',
          { display: 'block', fontFamily: DISPLAY, fontWeight: 700, fontSize: full ? 42 : 54, lineHeight: 1.04, lineClamp: 2 },
          stripEmoji(row.name)
        ),
        h(
          'div',
          { display: 'block', fontSize: full ? 28 : 32, opacity: 0.8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
          metaText(row.timeLabel, row.place)
        )
      )
    )
  )

  const moreBlock = full
    ? h(
        'div',
        { position: 'absolute', left: PAD, right: PAD, top: 868, display: 'flex', flexDirection: 'column' },
        h('div', { fontSize: 24, fontWeight: 500, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.7, marginBottom: 14 }, 'Också i dag'),
        ...more.map((row) =>
          h(
            'div',
            { display: 'flex', alignItems: 'center', gap: 28, padding: '8px 0', borderTop: `2px solid ${c.ink}1f`, fontSize: 28 },
            h('div', { display: 'flex', width: 84, flexShrink: 0, fontWeight: 500 }, row.timeLabel === 'Heldag' ? 'Heldag' : timeText(row.timeLabel)),
            h(
              'div',
              { display: 'block', fontWeight: 500, flexGrow: 1, flexShrink: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
              stripEmoji(row.name)
            ),
            row.place
              ? h(
                  'div',
                  { display: 'block', flexShrink: 0, maxWidth: 330, opacity: 0.7, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
                  stripEmoji(row.place)
                )
              : null
          )
        )
      )
    : null

  return root(
    c,
    waves(c),
    ...header(c, spec.postDate, `${spec.rows.length} tips`, theme),
    h(
      'div',
      { position: 'absolute', left: PAD, right: PAD, top: full ? 262 : 290, display: 'flex', flexDirection: 'column', gap: full ? 22 : 40 },
      h('div', { fontFamily: DISPLAY, fontWeight: 800, fontSize: full ? 60 : 76, lineHeight: 1, letterSpacing: -1.5, marginBottom: full ? 0 : 6 }, spec.title),
      ...topRows
    ),
    moreBlock,
    footer(c, full ? 'Allt i kalendern' : 'Fler tips i kalendern', theme)
  )
}

// ---------------------------------------------------------------------------
// Publikt API
// ---------------------------------------------------------------------------

export interface RenderOptions {
  theme?: InstagramTheme
  /** Bredd på utdata (förhandsvisning kan rendera mindre). Default 1080. */
  width?: number
  quality?: number
}

/** Rita en slide som JPEG */
export async function renderSlide(spec: SlideSpec, options: RenderOptions = {}): Promise<Buffer> {
  const theme = options.theme ?? VARBERG_THEME
  const tree = spec.kind === 'vykort' ? await vykortTree(spec, theme) : await listTree(spec, theme)
  const svgMarkup = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: W,
    height: H,
    fonts: loadFonts(),
  })
  const width = options.width ?? W
  let image = sharp(Buffer.from(svgMarkup), { density: 72 * (width / W) })
  if (width !== W) image = image.resize({ width })
  return image.jpeg({ quality: options.quality ?? 90, mozjpeg: true }).toBuffer()
}
