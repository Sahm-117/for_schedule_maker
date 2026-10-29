// The birthday graphic as a PNG, for the API. Same template as the admin dashboard's
// (frontend/src/utils/birthdayGraphic.ts): orange "HAPPY BIRTHDAY" wall, a tilted card with a pill-shaped photo and
// a date badge, the name on a banner, a quote bottom left and the church bottom right. 1080 x 1350.
// Drawn with og_edge (Satori + resvg), which runs in Supabase Edge Functions. Fonts ship beside this file (OFL).
import * as React from 'https://esm.sh/react@18.2.0'
import { ImageResponse } from 'https://deno.land/x/og_edge@0.0.6/mod.ts'

export const BIRTHDAY_QUOTES: Array<{ text: string; ref: string }> = [
  { text: 'The Lord bless you and keep you.', ref: 'Numbers 6:24' },
  { text: 'This is the day the Lord has made; let us rejoice and be glad in it.', ref: 'Psalm 118:24' },
  { text: 'The Lord your God is with you; He will rejoice over you with gladness.', ref: 'Zephaniah 3:17' },
  { text: 'His mercies are new every morning; great is Your faithfulness.', ref: 'Lamentations 3:23' },
  { text: 'May He give you the desire of your heart and make all your plans succeed.', ref: 'Psalm 20:4' },
  { text: 'I will bless you, and you will be a blessing.', ref: 'Genesis 12:2' },
]

const W = 1080
const H = 1350
const ORANGE = '#FF914D'
const ORANGE_DEEP = '#E5822D'
const BURNT = '#C2410C'
const GOLD = '#FFD27A'
const INK = '#1D1D1F'
const CREAM = '#FFF4E8'
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const CREST_URL = 'https://fof.tcnikorodu.org/logo-mark.png'

let fonts: Promise<Array<{ name: string; data: ArrayBuffer; weight: 700 | 800 | 600; style: 'normal' | 'italic' }>> | null = null
const loadFonts = () => {
  if (!fonts) {
    const read = (file: string) => Deno.readFile(new URL(`./fonts/${file}`, import.meta.url)).then((b) => b.buffer as ArrayBuffer)
    fonts = Promise.all([
      read('Montserrat-Bold.ttf').then((data) => ({ name: 'Montserrat', data, weight: 700 as const, style: 'normal' as const })),
      read('Montserrat-ExtraBold.ttf').then((data) => ({ name: 'Montserrat', data, weight: 800 as const, style: 'normal' as const })),
      read('Montserrat-SemiBoldItalic.ttf').then((data) => ({ name: 'Montserrat', data, weight: 600 as const, style: 'italic' as const })),
    ])
  }
  return fonts
}

const h = React.createElement
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

// Photos are only fetched from this project's own storage, never from any other address an avatar field might hold.
const STORAGE_PREFIX = `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')}/storage/v1/object/public/`

/** A photo Satori can draw: fetched here, so a missing or broken photo falls back to initials instead of failing. */
const photoData = async (url: string | null): Promise<string | null> => {
  if (!url || !STORAGE_PREFIX.startsWith('https://') || !url.startsWith(STORAGE_PREFIX)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !/^image\/(png|jpe?g)/.test(type)) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length > 6_000_000) return null
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return `data:${type.split(';')[0]};base64,${btoa(bin)}`
  } catch {
    return null
  }
}

export type BirthdayInput = { name: string; photoUrl: string | null; month: number; day: number; roleLabel: string; quoteIndex: number }

export const birthdayPng = async (input: BirthdayInput): Promise<Response> => {
  const [fontList, photo] = await Promise.all([loadFonts(), photoData(input.photoUrl)])
  const quote = BIRTHDAY_QUOTES[((input.quoteIndex % BIRTHDAY_QUOTES.length) + BIRTHDAY_QUOTES.length) % BIRTHDAY_QUOTES.length]
  const name = input.name.toUpperCase()
  // Montserrat ExtraBold capitals run about 0.8 of the size wide; shrink long names to fit the 760px banner.
  const nameSize = Math.max(26, Math.min(52, Math.floor(760 / (Math.max(name.length, 1) * 0.8))))

  const wall = Array.from({ length: 8 }, (_, row) => h('div', {
    key: row,
    style: { position: 'absolute', left: -((row * 173) % 900) - 200, top: 30 + row * 175, display: 'flex', fontSize: 190, fontWeight: 800, color: 'rgba(255,255,255,0.09)', whiteSpace: 'nowrap' },
  }, row % 2 === 0 ? 'HAPPY  HAPPY  HAPPY  HAPPY' : 'BIRTHDAY  BIRTHDAY  BIRTHDAY'))

  const photoBox = photo
    ? h('img', { src: photo, width: 450, height: 620, style: { width: 450, height: 620, objectFit: 'cover', objectPosition: '50% 30%', borderRadius: 225 } })
    : h('div', { style: { width: 450, height: 620, borderRadius: 225, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundImage: `linear-gradient(135deg, #FFB27D, ${ORANGE_DEEP})`, color: '#FFFFFF', fontSize: 190, fontWeight: 800 } }, initialsOf(input.name))

  const tree = h('div', {
    style: { width: W, height: H, display: 'flex', position: 'relative', fontFamily: 'Montserrat', backgroundImage: 'linear-gradient(135deg, #FF9A55 0%, #E5782A 55%, #B93C0A 100%)', overflow: 'hidden' },
  },
    h('div', { style: { position: 'absolute', left: -700, top: -800, width: 1800, height: 1800, borderRadius: 900, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.25), rgba(255,255,255,0) 60%)', display: 'flex' } }),
    ...wall,
    // Gold card behind, tilted; cream card in front. Shadows are offset translucent shapes: blurred ones cost too
    // much drawing time for an edge function.
    h('div', { style: { position: 'absolute', left: 150, top: 142, width: 780, height: 880, borderRadius: 60, backgroundColor: 'rgba(90,25,0,0.18)', display: 'flex' } }),
    h('div', { style: { position: 'absolute', left: 150, top: 120, width: 780, height: 880, borderRadius: 60, backgroundColor: GOLD, transform: 'rotate(4deg)', display: 'flex' } }),
    h('div', { style: { position: 'absolute', left: 150, top: 120, width: 780, height: 880, borderRadius: 60, backgroundColor: CREAM, display: 'flex' } }),
    // Side lettering.
    h('div', { style: { position: 'absolute', left: 200 - 200, top: 560 - 20, width: 400, display: 'flex', justifyContent: 'center', transform: 'rotate(90deg)', color: BURNT, fontSize: 21, fontWeight: 700, letterSpacing: 9 } }, 'HAPPY BIRTHDAY!!!'),
    h('div', { style: { position: 'absolute', left: 880 - 200, top: 560 - 20, width: 400, display: 'flex', justifyContent: 'center', transform: 'rotate(90deg)', color: BURNT, fontSize: 21, fontWeight: 700, letterSpacing: 9 } }, 'HAPPY BIRTHDAY!!!'),
    // Photo with an orange ring.
    h('div', { style: { position: 'absolute', left: 301, top: 176, width: 478, height: 648, borderRadius: 239, backgroundColor: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, photoBox),
    // Date badge.
    h('div', { style: { position: 'absolute', left: 735 - 76, top: 740 - 76, width: 152, height: 152, borderRadius: 76, backgroundColor: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      h('div', { style: { width: 136, height: 136, borderRadius: 68, border: `6px solid ${ORANGE}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
        h('div', { style: { color: BURNT, fontSize: 24, fontWeight: 700, letterSpacing: 4 } }, MONTHS[(input.month - 1 + 12) % 12]),
        h('div', { style: { color: INK, fontSize: 54, fontWeight: 800, lineHeight: 1 } }, String(input.day).padStart(2, '0')))),
    // Role pill and name banner.
    h('div', { style: { position: 'absolute', left: 130, top: 1054, width: 820, height: 104, borderRadius: 20, backgroundColor: CREAM, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: 30, paddingRight: 30 } },
      h('div', { style: { color: INK, fontSize: nameSize, fontWeight: 800, letterSpacing: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 760 } }, name)),
    h('div', { style: { position: 'absolute', left: 140, top: 1004, height: 52, borderRadius: 26, backgroundColor: ORANGE_DEEP, display: 'flex', alignItems: 'center', paddingLeft: 26, paddingRight: 26, color: '#FFFFFF', fontSize: 26, fontWeight: 600, fontStyle: 'italic' } }, input.roleLabel),
    // Quote bottom left.
    h('div', { style: { position: 'absolute', left: 70, top: 1196, width: 560, display: 'flex', flexDirection: 'column' } },
      h('div', { style: { color: '#FFF1E6', fontSize: 23, fontWeight: 600, fontStyle: 'italic', lineHeight: 1.45 } }, `“${quote.text}”`),
      h('div', { style: { color: GOLD, fontSize: 17, fontWeight: 700, letterSpacing: 3, marginTop: 6 } }, quote.ref.toUpperCase())),
    // Church bottom right.
    h('img', { src: CREST_URL, width: 62, height: 62, style: { position: 'absolute', left: 948, top: 1214 } }),
    h('div', { style: { position: 'absolute', left: 690, top: 1282, width: 320, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', color: '#FFF1E6' } },
      h('div', { style: { fontSize: 15, fontWeight: 700, letterSpacing: 3 } }, 'THE COVENANT NATION'),
      h('div', { style: { fontSize: 13, fontWeight: 700, letterSpacing: 3, marginTop: 4 } }, 'IKORODU')),
  )

  return new ImageResponse(tree, { width: W, height: H, fonts: fontList })
}
