import { describe, expect, it } from 'vitest'
import {
  matchShareCard,
  playerShareCard,
  shareFilename,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  type MatchShareInput,
  type PlayerShareInput,
} from './shareCard'

const MAG: PlayerShareInput = {
  name: '[BVS] Mag',
  overall: 79,
  tier: 'guld',
  position: 'ÖVERSTE',
  memberOfMonth: false,
  pending: false,
  attributes: [
    { key: 'aim', label: 'Sikte', rating: 72 },
    { key: 'hs', label: 'Skallar', rating: 74 },
    { key: 'frag', label: 'Frag', rating: 85 },
  ],
}

const MATCH: MatchShareInput = {
  matchday: 3,
  home: 'Gubbarna FC',
  away: 'Rush B United',
  homeScore: 16,
  awayScore: 13,
  mvp: 'Lugna Lasse',
}

// Ett kort som inte går att tolka som XML blir en tom bild i stället för ett
// fel — canvas säger ingenting när <image> inte kan läsa sin källa. Därför
// vaktas formen här i stället för att upptäckas i Discorden.
function parsed(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  expect(doc.querySelector('parsererror')).toBeNull()
  return doc
}

// Etiketterna sätts i versaler på kortet, precis som sajtens egna
// etikettrader. Att de gör det är en stilfråga och inte något ett
// innehållstest ska låsa fast — det som ska stämma är att texten finns där.
function label(svg: string): string {
  return (parsed(svg).documentElement.textContent ?? '').toLowerCase()
}

describe('playerShareCard', () => {
  it('är ett giltigt SVG i delningsformat', () => {
    const doc = parsed(playerShareCard(MAG))
    const svg = doc.documentElement

    expect(svg.tagName).toBe('svg')
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}`)
  })

  it('bär namnet, betyget och titeln', () => {
    const text = parsed(playerShareCard(MAG)).documentElement.textContent ?? ''

    expect(text).toContain('[BVS] Mag')
    expect(text).toContain('79')
    expect(text).toContain('ÖVERSTE')
  })

  it('skriver ut varje attribut med sitt betyg', () => {
    const text = label(playerShareCard(MAG))

    for (const a of MAG.attributes) {
      expect(text).toContain(a.label.toLowerCase())
      expect(text).toContain(String(a.rating))
    }
  })

  // Samma regel som kortet på sajten: den som saknar statistik visar streck,
  // inte en nolla som ser ut som ett omdöme.
  it('visar streck i stället för noll för den utan statistik', () => {
    const text =
      parsed(playerShareCard({ ...MAG, pending: true, overall: 0 })).documentElement.textContent ??
      ''

    expect(text).toContain('—')
    expect(text).not.toContain('79')
  })

  it('nämner Månadens BVS:are bara för den som är det', () => {
    expect(label(playerShareCard(MAG))).not.toContain('månadens')
    expect(label(playerShareCard({ ...MAG, memberOfMonth: true }))).toContain('månadens bvs:are')
  })

  // Persona-namnet kommer från Steam och kan innehålla vad som helst. Ett
  // ampersand eller en vinkelparentes får inte bli trasig markup.
  it('bryter inte av ett namn med markup i sig', () => {
    const doc = parsed(playerShareCard({ ...MAG, name: '<script>&"Mag"' }))

    expect(doc.documentElement.textContent).toContain('<script>&"Mag"')
  })

  it('tål ett kort helt utan attribut', () => {
    const doc = parsed(playerShareCard({ ...MAG, attributes: [] }))
    expect(doc.documentElement.textContent).toContain('[BVS] Mag')
  })
})

describe('matchShareCard', () => {
  it('är ett giltigt SVG med båda lagen och resultatet', () => {
    const text = parsed(matchShareCard(MATCH)).documentElement.textContent ?? ''

    expect(text).toContain('Gubbarna FC')
    expect(text).toContain('Rush B United')
    expect(text).toContain('16')
    expect(text).toContain('13')
  })

  it('berättar vilken omgång det var och vem som blev bäst', () => {
    const text = label(matchShareCard(MATCH))

    expect(text).toContain('omgång 3')
    expect(text).toContain('lugna lasse')
  })

  it('klarar en match utan utsedd bäste spelare', () => {
    const doc = parsed(matchShareCard({ ...MATCH, mvp: null }))
    expect(doc.documentElement.textContent).toContain('Gubbarna FC')
  })

  it('bryter inte av ett lagnamn med markup i sig', () => {
    const doc = parsed(matchShareCard({ ...MATCH, home: 'A & B <FC>' }))
    expect(doc.documentElement.textContent).toContain('A & B <FC>')
  })
})

// Typsnittet skickas in i stället för att hämtas här — modulen ska gå att
// testa utan nätverk och utan webbläsare.
describe('inbäddat typsnitt', () => {
  it('lägger in det som skickas med, och klarar sig utan', () => {
    const withFont = playerShareCard(MAG, '@font-face{font-family:Rajdhani;src:url(data:x)}')
    expect(withFont).toContain('@font-face')
    expect(parsed(withFont).documentElement.tagName).toBe('svg')

    expect(playerShareCard(MAG)).not.toContain('@font-face')
  })
})

describe('shareFilename', () => {
  it('gör persona-namnet till ett filnamn utan klantagg', () => {
    expect(shareFilename('[BVS] Mag')).toBe('bvs-mag.png')
    expect(shareFilename('Lugna Lasse')).toBe('bvs-lugna-lasse.png')
  })

  it('faller tillbaka på något användbart när namnet inte ger något', () => {
    expect(shareFilename('🎮🎮')).toBe('bvs-kort.png')
  })

  it('lämnar inga snedstreck eller punkter kvar att tolka som en sökväg', () => {
    expect(shareFilename('../../etc/passwd')).toBe('bvs-etc-passwd.png')
  })
})

// Månadens BVS:are får ett diamantkort på sajten. Delar man kortet vidare ska
// bilden säga samma sak — annars motsäger den sajten den kommer ifrån.
describe('diamantkortet', () => {
  const DIAMOND = '#bfe6ff'

  it('ger vinnarens kort diamantkanten', () => {
    const svg = playerShareCard({ ...MAG, memberOfMonth: true })

    expect(svg).toContain(DIAMOND)
  })

  it('lämnar alla andra kort orörda', () => {
    expect(playerShareCard(MAG)).not.toContain(DIAMOND)
  })

  // Betyget är fortfarande ett betyg. Vinnaren får en ram, inte bättre
  // attribut — staplarna behåller sin tier-färg så kortet inte ljuger om
  // hur bra han är.
  it('rör inte attributstaplarnas tier-färg', () => {
    const guld = '#e0b352'
    expect(playerShareCard({ ...MAG, memberOfMonth: true })).toContain(guld)
  })
})
