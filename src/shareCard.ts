import type { CardTier } from './api'

// Korten som går att klistra in i Discorden. SVG i stället för canvas-ritning:
// layouten blir deklarativ och går att läsa, och den här modulen kan testas
// utan webbläsare — rasteriseringen till PNG är ett eget steg (shareImage.ts).
//
// 1200x630 är Open Graphs och Discords format för ett stort kort. Samma mått
// som scripts/og-image.html, av samma skäl.
export const SHARE_CARD_WIDTH = 1200
export const SHARE_CARD_HEIGHT = 630

// Sajtens egna färger. Duplicerade som literaler och inte lästa ur CSS:
// bilden renderas utanför sidan, där inga CSS-variabler finns att fråga.
const BG = '#0a0c0f'
const PANEL_EDGE = '#1c222c'
const TEXT = '#e8eaed'
const MUTED = '#98a2ad'
const ACCENT = '#ff7a1a'

// Månadens BVS:are får ett diamantkort. Isblått och inte guld, så det inte går
// att blanda ihop med guld-tiern — utmärkelsen och betyget är två olika saker,
// och kortet ska inte påstå att vinnaren råkar vara en guldspelare.
const DIAMOND = '#bfe6ff'

// Samma nyanser som .player-card[data-tier] i App.css.
const TIER: Record<CardTier, string> = {
  ikon: '#ff7a1a',
  guld: '#e0b352',
  silver: '#aab4bf',
  brons: '#8a5a2b',
  okänd: '#4a5563',
}

export interface PlayerShareInput {
  name: string
  overall: number
  tier: CardTier
  position: string
  memberOfMonth: boolean
  pending: boolean
  attributes: { key: string; label: string; rating: number }[]
}

export interface MatchShareInput {
  matchday: number
  home: string
  away: string
  homeScore: number
  awayScore: number
  mvp: string | null
}

// Persona-namn kommer från Steam och lagnamn skrivs av gubbarna själva. Utan
// det här blir ett & eller ett < trasig markup, och en trasig SVG ritas som en
// tom ruta utan att canvas säger ett ord om varför.
function xml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Ett långt lagnamn eller en lång persona ska inte rinna ut över kanten.
function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function shell(fontFace: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_CARD_WIDTH}" height="${SHARE_CARD_HEIGHT}" viewBox="0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}">
  <defs>
    <style>${fontFace}
      text { font-family: 'Rajdhani', 'Segoe UI', system-ui, sans-serif; }
    </style>
    <radialGradient id="glow" cx="0.8" cy="0" r="0.9">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.16" />
      <stop offset="0.6" stop-color="${ACCENT}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${SHARE_CARD_WIDTH}" height="${SHARE_CARD_HEIGHT}" fill="${BG}" />
  <rect width="${SHARE_CARD_WIDTH}" height="${SHARE_CARD_HEIGHT}" fill="url(#glow)" />
${body}
  <text x="72" y="${SHARE_CARD_HEIGHT - 48}" font-size="26" font-weight="600" fill="${MUTED}" letter-spacing="4">BRAVAS.SE</text>
</svg>`
}

export function playerShareCard(entry: PlayerShareInput, fontFace = ''): string {
  const tier = TIER[entry.tier] ?? TIER['okänd']
  const overall = entry.pending ? '—' : String(entry.overall)

  // Attributen radas i två kolumner — sex stycken på en rad hade blivit
  // frimärken, och en enda kolumn hade lämnat halva kortet tomt.
  const attrs = entry.attributes
    .slice(0, 6)
    .map((a, i) => {
      const x = 640 + (i % 2) * 260
      const y = 210 + Math.floor(i / 2) * 92
      const width = Math.max(0, Math.min(100, a.rating)) * 2
      return `  <g>
    <text x="${x}" y="${y}" font-size="26" font-weight="600" fill="${MUTED}" letter-spacing="2">${xml(clip(a.label, 12).toUpperCase())}</text>
    <text x="${x + 200}" y="${y}" font-size="30" font-weight="700" fill="${TEXT}" text-anchor="end">${xml(a.rating)}</text>
    <rect x="${x}" y="${y + 14}" width="200" height="6" fill="${PANEL_EDGE}" />
    <rect x="${x}" y="${y + 14}" width="${width}" height="6" fill="${tier}" />
  </g>`
    })
    .join('\n')

  const crown = entry.memberOfMonth
    ? `  <text x="72" y="470" font-size="28" font-weight="600" fill="${DIAMOND}" letter-spacing="2">◆ MÅNADENS BVS:ARE</text>`
    : ''

  // Kantlisten bär utmärkelsen när det finns en; attributstaplarna behåller
  // alltid sin tier-färg, så kortet inte börjar ljuga om hur bra gubben är
  // bara för att han vann en månad.
  const edge = entry.memberOfMonth ? DIAMOND : tier

  return shell(
    fontFace,
    `  <rect x="0" y="0" width="12" height="${SHARE_CARD_HEIGHT}" fill="${edge}" />
  <text x="72" y="120" font-size="28" font-weight="600" fill="${MUTED}" letter-spacing="6">BVS-BETYG</text>
  <text x="72" y="290" font-size="180" font-weight="700" fill="${TEXT}">${xml(overall)}</text>
  <text x="72" y="360" font-size="40" font-weight="700" fill="${tier}" letter-spacing="4">${xml(clip(entry.position, 18).toUpperCase())}</text>
  <text x="72" y="430" font-size="52" font-weight="700" fill="${TEXT}">${xml(clip(entry.name, 22))}</text>
${crown}
${attrs}`,
  )
}

export function matchShareCard(match: MatchShareInput, fontFace = ''): string {
  // Vinnarens namn får sajtens accentfärg, förloraren står kvar i vanlig text.
  // Oavgjort ger ingen av dem färgen.
  const homeWon = match.homeScore > match.awayScore
  const awayWon = match.awayScore > match.homeScore
  const mvp = match.mvp
    ? `  <text x="600" y="540" font-size="30" font-weight="600" fill="${MUTED}" text-anchor="middle" letter-spacing="2">BÄST I MATCHEN: ${xml(clip(match.mvp, 24).toUpperCase())}</text>`
    : ''

  return shell(
    fontFace,
    `  <text x="600" y="130" font-size="30" font-weight="600" fill="${MUTED}" text-anchor="middle" letter-spacing="6">OMGÅNG ${xml(match.matchday)}</text>
  <text x="560" y="300" font-size="52" font-weight="700" fill="${homeWon ? ACCENT : TEXT}" text-anchor="end">${xml(clip(match.home, 20))}</text>
  <text x="640" y="300" font-size="52" font-weight="700" fill="${awayWon ? ACCENT : TEXT}">${xml(clip(match.away, 20))}</text>
  <text x="600" y="440" font-size="120" font-weight="700" fill="${TEXT}" text-anchor="middle">${xml(match.homeScore)}–${xml(match.awayScore)}</text>
${mvp}`,
  )
}

// Filnamnet den som saknar bildurklipp får i nedladdningsmappen. Persona-namn
// innehåller allt från klantaggar till emoji, och ett filnamn ska inte bära
// något av det.
export function shareFilename(name: string): string {
  const slug = name
    .replace(/^\[BVS\]\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9åäö]+/gi, '-')
    .replace(/^-+|-+$/g, '')

  return `bvs-${slug || 'kort'}.png`
}
