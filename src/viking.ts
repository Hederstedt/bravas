import { createRng } from './rng'
import type { CardAttribute, CardTier } from './api'

// Varje gubbe får en viking som växer fram ur hans egen CS2-statistik. Inget
// är slumpat på måfå: hjälmen kommer ur tiern, utrustningen ur positionen,
// skägget ur speltiden. Det som ändå måste variera — ansiktsbredd, hur skägget
// flätas — seedas på SteamID, så figuren ser likadan ut vid varje besök i
// stället för att byta utseende mellan sidladdningar.
//
// Ritas som SVG av komponenten i components/viking.tsx. Den här filen räknar
// bara ut *vad* som ska ritas, vilket gör reglerna testbara utan att någon
// behöver läsa path-data.

export type HelmetKind = 'lader' | 'jarn' | 'nasskydd' | 'vingar'
export type GearKind = 'yxa' | 'sköld' | 'båge' | 'horn' | 'kniv' | 'stav'

export interface VikingLook {
  helmet: HelmetKind
  gear: GearKind
  // 0–3. Kort stubb till lång flätad haka.
  beard: number
  beardColor: string
  // Grånar med speltiden — en veteran ser ut som en veteran.
  grey: number
  // 0–3 ärr. Den som dör mycket bär spåren.
  scars: number
  // Krigsmålning tänds först när fraggandet motiverar den.
  warPaint: boolean
  // Små avvikelser så att två gubbar med samma betyg ändå inte blir tvillingar.
  faceWidth: number
  eyeTilt: number
  palette: Palette
}

export interface Palette {
  metal: string
  metalDark: string
  skin: string
  skinShade: string
  cloak: string
}

// Tiern styr vad han har råd med. Brons är läder och trä, ikon är guld.
const PALETTES: Record<CardTier, Palette> = {
  ikon: { metal: '#ffc76b', metalDark: '#c98a24', skin: '#e8b98f', skinShade: '#c2905f', cloak: '#7a2f1d' },
  guld: { metal: '#e3b25c', metalDark: '#a87a26', skin: '#e5b78d', skinShade: '#bd8b5c', cloak: '#5f3a1c' },
  silver: { metal: '#c3ccd6', metalDark: '#7d8894', skin: '#e2b389', skinShade: '#b8865a', cloak: '#3c4654' },
  brons: { metal: '#c08551', metalDark: '#8a5a30', skin: '#dfaf85', skinShade: '#b48257', cloak: '#3a3630' },
  okänd: { metal: '#8f9aa6', metalDark: '#5d6773', skin: '#cfae8d', skinShade: '#a5825f', cloak: '#2f343c' },
}

const HELMETS: Record<CardTier, HelmetKind> = {
  ikon: 'vingar',
  guld: 'nasskydd',
  silver: 'jarn',
  brons: 'lader',
  okänd: 'lader',
}

// Positionen kommer från spelarkortet och säger vad han gör i laget. Vapnet
// får säga samma sak: AWP:aren siktar på håll, entryn går in med yxan.
const GEAR: Record<string, GearKind> = {
  AWP: 'båge',
  ENTRY: 'yxa',
  SMYGARE: 'kniv',
  IGL: 'horn',
  SKALLE: 'sköld',
  VETERAN: 'stav',
}

// Bred nog spridning att två gubbar med samma tier och position ändå går att
// skilja åt på håll — mörkbrunt till ljust rödblont.
const BEARD_COLORS = ['#8a5a2b', '#b4703a', '#4a3320', '#d09a55', '#6b4a2f', '#a34f24']

function rating(attributes: readonly CardAttribute[], key: string): number {
  return attributes.find((a) => a.key === key)?.rating ?? 0
}

// Trappsteg i stället för linjär skala: fyra tydligt olika skägg läses bättre
// på 116 pixlar än en glidande skala ingen ser skillnad på.
function step(value: number, thresholds: readonly number[]): number {
  let level = 0
  for (const t of thresholds) if (value >= t) level++
  return level
}

export function vikingLook(input: {
  id: string
  tier: CardTier
  position: string
  attributes: readonly CardAttribute[]
}): VikingLook {
  const rng = createRng(`viking:${input.id}`)
  const { attributes } = input

  const tid = rating(attributes, 'TID')
  const fra = rating(attributes, 'FRA')
  const tal = rating(attributes, 'TÅL')

  return {
    helmet: HELMETS[input.tier],
    // Okänd position — gubben har inga betyg än — får yxan, den mest
    // vikingaaktiga av dem alla.
    gear: GEAR[input.position] ?? 'yxa',
    // Speltid ger skägg. Den som precis loggat in är slätrakad.
    beard: step(tid, [30, 55, 78]),
    beardColor: BEARD_COLORS[Math.floor(rng() * BEARD_COLORS.length)]!,
    grey: step(tid, [70, 88]),
    // Låg tålighet betyder att han dör ofta, och det syns.
    scars: step(100 - tal, [45, 65, 80]),
    warPaint: fra >= 70,
    // ±9 % bredd och en lätt lutning på ögonen: nog för att skilja två gubbar
    // åt, för lite för att någon ska se ut som en karikatyr.
    faceWidth: 0.91 + rng() * 0.18,
    eyeTilt: (rng() - 0.5) * 6,
    palette: PALETTES[input.tier],
  }
}
