import { describe, expect, it } from 'vitest'
import { vikingLook } from './viking'
import type { CardAttribute, CardTier } from './api'

function attrs(over: Record<string, number> = {}): CardAttribute[] {
  const base: Record<string, number> = { SIK: 60, SKA: 60, FRA: 55, TÅL: 60, NYT: 55, TID: 60 }
  return Object.entries({ ...base, ...over }).map(([key, rating]) => ({
    key,
    label: key,
    description: '',
    rating,
  }))
}

function look(over: Record<string, number> = {}, rest: Partial<Parameters<typeof vikingLook>[0]> = {}) {
  return vikingLook({
    id: '76561198000000001',
    tier: 'silver',
    position: 'ENTRY',
    attributes: attrs(over),
    ...rest,
  })
}

describe('vikingLook', () => {
  // Hela poängen med att seeda på SteamID: figuren ska inte byta utseende
  // mellan sidladdningar.
  it('gives the same gubbe the same viking every time', () => {
    expect(look()).toEqual(look())
  })

  it('gives two gubbar different vikings even with identical ratings', () => {
    const a = look({}, { id: 'gubbe-a' })
    const b = look({}, { id: 'gubbe-b' })
    expect([a.beardColor, a.faceWidth]).not.toEqual([b.beardColor, b.faceWidth])
  })

  describe('the helmet comes from the tier', () => {
    const expected: Record<CardTier, string> = {
      ikon: 'vingar',
      guld: 'nasskydd',
      silver: 'jarn',
      brons: 'lader',
      okänd: 'lader',
    }

    for (const [tier, helmet] of Object.entries(expected)) {
      it(`${tier} wears ${helmet}`, () => {
        expect(look({}, { tier: tier as CardTier }).helmet).toBe(helmet)
      })
    }

    it('takes the palette from the tier too', () => {
      expect(look({}, { tier: 'ikon' }).palette).not.toEqual(look({}, { tier: 'brons' }).palette)
    })
  })

  describe('the gear comes from the position', () => {
    it('hands the AWP a bow and the entry an axe', () => {
      expect(look({}, { position: 'AWP' }).gear).toBe('båge')
      expect(look({}, { position: 'ENTRY' }).gear).toBe('yxa')
    })

    // En gubbe utan betyg har ingen position — han ska ändå se ut som en viking.
    it('falls back to the axe for a position it does not know', () => {
      expect(look({}, { position: '' }).gear).toBe('yxa')
      expect(look({}, { position: 'OKÄND' }).gear).toBe('yxa')
    })
  })

  describe('playtime grows the beard', () => {
    it('leaves a newcomer clean-shaven', () => {
      expect(look({ TID: 10 }).beard).toBe(0)
    })

    it('grows it in steps', () => {
      expect(look({ TID: 40 }).beard).toBe(1)
      expect(look({ TID: 60 }).beard).toBe(2)
      expect(look({ TID: 85 }).beard).toBe(3)
    })

    it('greys a veteran', () => {
      expect(look({ TID: 50 }).grey).toBe(0)
      expect(look({ TID: 75 }).grey).toBe(1)
      expect(look({ TID: 92 }).grey).toBe(2)
    })
  })

  describe('the marks of getting shot', () => {
    // Låg tålighet betyder att han dör ofta, och det ska synas.
    it('scars the fragile and spares the tough', () => {
      expect(look({ TÅL: 90 }).scars).toBe(0)
      expect(look({ TÅL: 40 }).scars).toBe(1)
      expect(look({ TÅL: 30 }).scars).toBe(2)
      expect(look({ TÅL: 15 }).scars).toBe(3)
    })
  })

  describe('war paint', () => {
    it('lights up only once the fragging earns it', () => {
      expect(look({ FRA: 69 }).warPaint).toBe(false)
      expect(look({ FRA: 70 }).warPaint).toBe(true)
    })
  })

  // Ett kort utan betyg alls ska inte kasta — den som precis loggat in väntar
  // fortfarande på att Steam ska svara.
  it('survives a card with no attributes at all', () => {
    const bare = vikingLook({ id: 'ny', tier: 'okänd', position: '', attributes: [] })
    expect(bare.beard).toBe(0)
    expect(bare.warPaint).toBe(false)
    // Utan tålighetsbetyg räknas 100 − 0, alltså full ärruppsättning; det är
    // rätt: en gubbe utan betyg är en gubbe utan meriter.
    expect(bare.helmet).toBe('lader')
    expect(bare.gear).toBe('yxa')
  })
})
