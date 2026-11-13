/**
 * Torsdagsbrevet – mejlmallen.
 *
 * Formspråket är startsidans nya eventkort (designen "ivarberg.nu – nya
 * eventkort"): vit botten, ljusgrå kort med bild överst, färgad
 * kategorietikett, fet titel, tid och plats under, och det blå kortet
 * "Se alla". Brevet ska se ut som samma sajt.
 *
 * Upplägg: ett kort hej, Veckans tre som stora kort med en rad om varför,
 * resten av helgen som små kort med bild dag för dag, och en avslutning.
 *
 * Tekniskt: tabeller och inline-stilar, en spalt på 600 px. Det är vad som
 * håller i Gmail, Apple Mail och Outlook. Bilderna ska vara färdiga JPEG
 * (se NewsletterPick.imageUrl och NewsletterListItem.imageUrl).
 */

import {
  NewsletterContent,
  NewsletterListItem,
  NewsletterRenderOptions,
  RenderedNewsletter,
  RESEND_UNSUBSCRIBE_PLACEHOLDER,
} from './types'

const C = {
  white: '#FFFFFF',
  card: '#F4F5F7',
  imageBg: '#E9ECF0',
  ink: '#10214B',
  inkSoft: '#4A566B',
  sea: '#0F5AA6',
  line: '#E3E6EB',
}
/** Etikettfärg per kategori, samma familjer som på startsidans kort */
const FAMILY = { hav: '#0F4C81', tang: '#0B5F50', tegel: '#A63A1B', ljung: '#8A2455', solgul: '#7A5A00', flint: '#4C3A78' }
const CATEGORY_COLOR: Record<string, string> = {
  scen: FAMILY.tegel,
  nattliv: FAMILY.ljung,
  sport: FAMILY.tang,
  'barn & familj': FAMILY.solgul,
  'utställningar': FAMILY.flint,
  konst: FAMILY.flint,
  'föreläsningar': FAMILY.flint,
  'film & bio': FAMILY.flint,
  'guidade visningar': FAMILY.hav,
  'djur & natur': FAMILY.tang,
  'mat & dryck': FAMILY.tegel,
  marknader: FAMILY.solgul,
  jul: FAMILY.tegel,
}
const FONT = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif"
const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
const WEEKDAYS_SHORT = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör']
const MONTHS_SHORT = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec']
const MAX_PER_DAY = 5

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function categoryLabel(category: string | null | undefined): string {
  return (category ?? '').replace('& Familj', '& familj').replace('& Dryck', '& dryck').replace('& Natur', '& natur')
}
function categoryColor(category: string | null | undefined): string {
  return CATEGORY_COLOR[(category ?? '').toLowerCase()] ?? C.inkSoft
}

interface Parts { y: number; m: number; d: number; hh: number; mm: number; hasTime: boolean; iso: string }

/** Läser 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss' och 'YYYY-MM-DDTHH:mm:ss' som lokal tid, utan tidszonsomräkning */
function parts(value: string): Parts {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value) ?? []
  const hh = m[4] ? Number(m[4]) : 0
  const mm = m[5] ? Number(m[5]) : 0
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), hh, mm, hasTime: Boolean(m[4]) && !(hh === 0 && mm === 0), iso: `${m[1]}-${m[2]}-${m[3]}` }
}
function dayIndex(p: Parts): number {
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
}
function shortDate(p: Parts): string {
  return `${p.d} ${MONTHS_SHORT[p.m - 1]}`
}
function timeLabel(p: Parts): string {
  return p.hasTime ? `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}` : ''
}
/** "Fre 13 nov kl 18:00", som på startsidans kort */
function whenLabel(p: Parts): string {
  const day = `${cap(WEEKDAYS_SHORT[dayIndex(p)])} ${shortDate(p)}`
  return p.hasTime ? `${day} kl ${timeLabel(p)}` : day
}
function rangeLabel(start: string, end: string): string {
  const a = parts(start)
  const b = parts(end)
  return a.m === b.m ? `${a.d}–${b.d} ${MONTHS_SHORT[b.m - 1]}` : `${shortDate(a)}–${shortDate(b)}`
}
/** ISO-veckans nummer */
function weekNumber(value: string): number {
  const p = parts(value)
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function withUtm(url: string, campaign: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}utm_source=torsdagsbrevet&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}`
}

/** Stöd för en länk i formen [text](https://…) i P.S.-raden */
function inlineLinks(text: string, campaign: string): string {
  const out: string[] = []
  let last = 0
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    out.push(esc(text.slice(last, m.index)))
    out.push(`<a href="${esc(withUtm(m[2], campaign))}" style="color:${C.sea};font-weight:600;text-decoration:underline;">${esc(m[1])}</a>`)
    last = m.index + m[0].length
  }
  out.push(esc(text.slice(last)))
  return out.join('')
}

interface DayGroup { label: string; date: string; weekday: string; items: NewsletterListItem[]; hidden: number }

/**
 * Grupperar listan per dag. `items` kommer i prioritetsordning (viktigast först):
 * de första MAX_PER_DAY per dag visas, sorterade på tid. Resten räknas som "och N till".
 */
function groupByDay(items: NewsletterListItem[]): DayGroup[] {
  const groups = new Map<string, DayGroup>()
  for (const item of items) {
    const p = parts(item.dateTime)
    if (!groups.has(p.iso)) groups.set(p.iso, { label: cap(WEEKDAYS[dayIndex(p)]), date: shortDate(p), weekday: WEEKDAYS[dayIndex(p)], items: [], hidden: 0 })
    const g = groups.get(p.iso)!
    if (g.items.length < MAX_PER_DAY) g.items.push(item)
    else g.hidden++
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, g]) => ({ ...g, items: [...g.items].sort((a, b) => a.dateTime.localeCompare(b.dateTime)) }))
}

export function renderNewsletterEmail(content: NewsletterContent, opts: NewsletterRenderOptions = {}): RenderedNewsletter {
  const site = (opts.siteUrl ?? 'https://ivarberg.nu').replace(/\/$/, '')
  const unsubscribe = opts.unsubscribeUrl ?? RESEND_UNSUBSCRIBE_PLACEHOLDER
  const city = opts.cityName ?? 'Varberg'
  const address = opts.address ?? 'Fästningsgatan 5, 432 44 Varberg'
  const campaign = content.issueDate
  const siteName = site.replace(/^https?:\/\//, '')
  const range = rangeLabel(content.weekendStart, content.weekendEnd)
  const eventUrl = (slug: string) => withUtm(`${site}/event/${encodeURIComponent(slug)}`, campaign)
  const weekendUrl = withUtm(`${site}/i-helgen`, campaign)
  const homeUrl = withUtm(site, campaign)
  const shown = new Set(content.picks.map((p) => p.slug))
  const rest = content.more.filter((m) => !shown.has(m.slug))
  const groups = groupByDay(rest)
  const h2 = `margin:0;font-size:24px;line-height:1.2;font-weight:700;color:${C.ink};`

  // ---------- Veckans tre: stora kort ----------
  const picksHtml = content.picks
    .map((pick) => {
      const p = parts(pick.dateTime)
      const url = eventUrl(pick.slug)
      const place = [pick.venue, pick.price].filter(Boolean).join(' · ')
      const image = pick.imageUrl
        ? `<tr><td style="padding:0;line-height:0;font-size:0;"><a href="${esc(url)}" style="display:block;"><img src="${esc(pick.imageUrl)}" width="600" alt="${esc(pick.name)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:16px 16px 0 0;background:${C.imageBg};"></a></td></tr>`
        : ''
      return `<tr><td style="padding:0 0 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="background:${C.card};border-radius:16px;border-collapse:separate;">
${image}
<tr><td class="pad" style="padding:16px 20px 20px;font-family:${FONT};color:${C.ink};">
${pick.category ? `<p style="margin:0 0 4px;font-size:13px;line-height:16px;font-weight:600;color:${categoryColor(pick.category)};">${esc(categoryLabel(pick.category))}</p>` : ''}
<h3 style="margin:0;font-size:21px;line-height:27px;font-weight:700;"><a href="${esc(url)}" style="color:${C.ink};text-decoration:none;">${esc(pick.name)}</a></h3>
<p style="margin:10px 0 0;font-size:14px;line-height:20px;color:${C.inkSoft};"><b style="font-weight:600;color:${C.ink};">${esc(whenLabel(p))}</b>${place ? `<br>${esc(place)}` : ''}</p>
${pick.comment.trim() ? `<p style="margin:14px 0 0;font-size:16px;line-height:25px;color:${C.ink};">${esc(pick.comment.trim())}</p>` : ''}
<p style="margin:14px 0 0;font-size:15px;line-height:20px;"><a href="${esc(url)}" style="color:${C.sea};font-weight:600;text-decoration:none;">Läs mer &rarr;</a></p>
</td></tr>
</table>
</td></tr>`
    })
    .join('\n')

  // ---------- Mer i helgen: små kort med bild, dag för dag ----------
  const listCard = (item: NewsletterListItem): string => {
    const p = parts(item.dateTime)
    const url = eventUrl(item.slug)
    const image = item.imageUrl
      ? `<td width="76" valign="top" style="padding:10px 0 10px 10px;line-height:0;font-size:0;"><a href="${esc(url)}"><img src="${esc(item.imageUrl)}" width="76" height="76" alt="" style="display:block;width:76px;height:76px;border:0;border-radius:10px;background:${C.imageBg};"></a></td>`
      : ''
    return `<tr><td style="padding:0 0 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="background:${C.card};border-radius:14px;border-collapse:separate;"><tr>
${image}
<td valign="middle" style="padding:${item.imageUrl ? '10px 14px 10px 12px' : '12px 16px'};font-family:${FONT};">
${item.category ? `<span style="font-size:12.5px;line-height:16px;font-weight:600;color:${categoryColor(item.category)};">${esc(categoryLabel(item.category))}</span><br>` : ''}
<a href="${esc(url)}" style="font-size:15px;line-height:20px;font-weight:700;color:${C.ink};text-decoration:none;">${esc(item.name)}</a><br>
<span style="font-size:12.5px;line-height:19px;color:${C.inkSoft};">${timeLabel(p) ? `<b style="font-weight:600;color:${C.ink};">${esc(timeLabel(p))}</b>` : ''}${timeLabel(p) && item.venue ? ' &nbsp;·&nbsp; ' : ''}${esc(item.venue)}</span>
</td></tr></table>
</td></tr>`
  }
  const moreHtml = groups.length
    ? `<tr><td style="padding:28px 0 0;font-family:${FONT};">
<h2 style="${h2}">Mer i helgen <span style="font-weight:500;color:${C.inkSoft};">${esc(range)}</span></h2>
</td></tr>
${groups
  .map(
    (g) => `<tr><td style="padding:18px 0 8px;font-family:${FONT};">
<h3 style="margin:0;font-size:15px;line-height:20px;font-weight:700;color:${C.ink};">${esc(g.label)} <span style="font-weight:500;color:${C.inkSoft};">${esc(g.date)}</span></h3>
</td></tr>
${g.items.map(listCard).join('\n')}
${g.hidden > 0 ? `<tr><td style="padding:2px 0 0;font-family:${FONT};font-size:14px;line-height:20px;"><a href="${esc(weekendUrl)}" style="color:${C.sea};font-weight:600;text-decoration:none;">och ${g.hidden} till på ${esc(g.weekday)} &rarr;</a></td></tr>` : ''}`
  )
  .join('\n')}
<tr><td style="padding:22px 0 0;">
<a href="${esc(weekendUrl)}" style="display:block;text-decoration:none;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.sea}" style="background:${C.sea};border-radius:16px;border-collapse:separate;"><tr>
<td valign="middle" style="padding:18px 20px;font-family:${FONT};color:${C.white};">
<span style="font-size:15px;line-height:20px;font-weight:600;color:${C.white};">Se alla evenemang i helgen</span><br>
<span style="font-size:28px;line-height:36px;font-weight:700;color:${C.white};">${content.totalWeekendCount}</span>
</td>
<td width="60" valign="middle" align="right" style="padding:18px 20px 18px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="40" height="40" align="center" valign="middle" bgcolor="${C.white}" style="width:40px;height:40px;background:${C.white};border-radius:20px;font-family:${FONT};font-size:20px;line-height:40px;font-weight:700;color:${C.sea};">&rarr;</td></tr></table>
</td>
</tr></table>
</a>
</td></tr>`
    : ''

  // ---------- Partner ----------
  const sponsor = content.sponsor
  const sponsorHtml = sponsor
    ? `<tr><td style="padding:22px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:16px;border-collapse:separate;">
<tr><td class="pad" style="padding:16px 20px;font-family:${FONT};font-size:15px;line-height:23px;color:${C.ink};">
<span style="font-size:13px;color:${C.inkSoft};">${esc(sponsor.label)}</span><br>
<a href="${esc(sponsor.url)}" style="color:${C.ink};font-weight:700;text-decoration:none;">${esc(sponsor.name)}</a><br>${esc(sponsor.text)}
</td></tr></table>
</td></tr>`
    : ''

  const introHtml = content.intro
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<p style="margin:0 0 10px;font-size:17px;line-height:27px;color:${C.ink};">${esc(s)}</p>`)
    .join('\n')
  const signoffHtml = content.signoff
    .split(/\n/)
    .map((s) => esc(s.trim()))
    .filter(Boolean)
    .join('<br>')

  const html = `<!doctype html>
<html lang="sv" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<meta name="format-detection" content="telephone=no,date=no,address=no">
<title>${esc(content.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{color-scheme:light only}
body{margin:0;padding:0;background:${C.white};-webkit-text-size-adjust:100%}
img{border:0}
a:hover{opacity:.85}
@media (max-width:620px){
  .outer{padding:20px 16px 32px !important}
  .pad{padding:14px 16px 18px !important}
  .h1{font-size:28px !important;line-height:34px !important}
}
</style>
</head>
<body style="margin:0;padding:0;background:${C.white};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:${C.white};font-size:1px;line-height:1px;">${esc(content.preheader)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.white}" style="background:${C.white};">
<tr><td align="center" class="outer" style="padding:28px 20px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><a href="${esc(homeUrl)}" style="text-decoration:none;"><img src="${site}/logo.png" width="140" alt="${esc(siteName)}" style="display:block;width:140px;height:auto;border:0;font-family:${FONT};font-size:18px;font-weight:700;color:${C.ink};"></a></td>
<td valign="middle" align="right" style="font-family:${FONT};font-size:13px;line-height:18px;font-weight:500;color:${C.inkSoft};">Torsdagsbrevet · vecka ${weekNumber(content.issueDate)}</td>
</tr></table>
</td></tr>

<tr><td style="padding:30px 0 0;font-family:${FONT};color:${C.ink};">
<h1 class="h1" style="margin:0 0 14px;font-size:32px;line-height:38px;font-weight:700;color:${C.ink};">Helgen i ${esc(city)} <span style="font-weight:500;color:${C.inkSoft};">${esc(range)}</span></h1>
${introHtml}
</td></tr>

<tr><td style="padding:20px 0 12px;font-family:${FONT};">
<h2 style="${h2}">Veckans tre</h2>
</td></tr>
${picksHtml}
${moreHtml}

<tr><td style="padding:30px 0 0;font-family:${FONT};color:${C.ink};">
<p style="margin:0;font-size:17px;line-height:27px;">${signoffHtml}</p>
${content.ps?.trim() ? `<p style="margin:16px 0 0;font-size:15px;line-height:24px;color:${C.inkSoft};"><b style="font-weight:600;color:${C.ink};">P.S.</b> ${inlineLinks(content.ps.trim(), campaign)}</p>` : ''}
</td></tr>
${sponsorHtml}

<tr><td style="padding:32px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.line};padding:18px 0 0;font-family:${FONT};font-size:13px;line-height:21px;color:${C.inkSoft};">
Du får det här för att du har anmält dig till nyhetsbrevet på <a href="${esc(homeUrl)}" style="color:${C.inkSoft};text-decoration:underline;">${esc(siteName)}</a>.<br>
Ordnar du något själv? <a href="${esc(withUtm(`${site}/tips`, campaign))}" style="color:${C.inkSoft};text-decoration:underline;">Tipsa oss</a>, det kostar inget.<br>
<a href="${unsubscribe}" style="color:${C.inkSoft};text-decoration:underline;">Avsluta prenumerationen</a><br><br>
${esc(siteName)} · ${esc(address)}
</td></tr></table>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`

  // ---------- Textversion ----------
  const lines: string[] = []
  lines.push(`Helgen i ${city}, ${range}`, '')
  lines.push(...content.intro.split(/\n+/).map((s) => s.trim()).filter(Boolean), '')
  lines.push('VECKANS TRE', '')
  for (const pick of content.picks) {
    lines.push(pick.name)
    lines.push([whenLabel(parts(pick.dateTime)), pick.venue, pick.price].filter(Boolean).join(' · '))
    if (pick.comment.trim()) lines.push(pick.comment.trim())
    lines.push(eventUrl(pick.slug), '')
  }
  if (groups.length) {
    lines.push('MER I HELGEN', '')
    for (const g of groups) {
      lines.push(`${g.label} ${g.date}`)
      for (const item of g.items) {
        lines.push(`  ${timeLabel(parts(item.dateTime)) || '     '}  ${item.name}${item.venue ? `, ${item.venue}` : ''}`)
      }
      if (g.hidden > 0) lines.push(`  och ${g.hidden} till`)
      lines.push('')
    }
    lines.push(`Alla ${content.totalWeekendCount} evenemang i helgen: ${weekendUrl}`, '')
  }
  lines.push(...content.signoff.split(/\n/).map((s) => s.trim()).filter(Boolean))
  if (content.ps?.trim()) lines.push('', `P.S. ${content.ps.trim().replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2')}`)
  if (sponsor) lines.push('', `${sponsor.label} ${sponsor.name}. ${sponsor.text} ${sponsor.url}`)
  lines.push('', '--', `Du får det här för att du har anmält dig till nyhetsbrevet på ${siteName}.`, `Avsluta prenumerationen: ${unsubscribe}`, `${siteName} · ${address}`)

  return { html, text: lines.join('\n') }
}
