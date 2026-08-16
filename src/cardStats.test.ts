import { describe, expect, it } from 'vitest'
import { compareAttribute } from './cardStats'
import type { PlayerCard } from './api'

function card(steamid64: string, sik: number, hasStats = true): PlayerCard {
  return {
    steamid64,
    personaName: `Gubbe ${steamid64}`,
    hasStats,
    overall: sik,
    tier: 'silver',
    position: 'AWP',
    attributes: hasStats
      ? [
          { key: 'SIK', label: 'Sikte', description: 'Andel träffar', rating: sik },
          { key: 'TÅL', label: 'Tålighet', description: 'Överlevnad', rating: 50 },
        ]
      : [],
    wotAttributes: [],
    comments: ['nåt'],
    memberOfMonth: false,
  }
}

const CREW = [card('1', 60), card('2', 90), card('3', 30)]

describe('compareAttribute', () => {
  it('reports the value, the clan best and the clan average', () => {
    const c = compareAttribute(CREW, '1', 'SIK')!
    expect(c.rating).toBe(60)
    expect(c.best).toBe(90)
    expect(c.average).toBe(60) // (60+90+30)/3
    expect(c.of).toBe(3)
  })

  it('places him against the rest', () => {
    expect(compareAttribute(CREW, '2', 'SIK')!.rank).toBe(1)
    expect(compareAttribute(CREW, '1', 'SIK')!.rank).toBe(2)
    expect(compareAttribute(CREW, '3', 'SIK')!.rank).toBe(3)
  })

  it('gives equal ratings the same placing', () => {
    // Två på 80 är båda tvåa. Annars hade listordningen avgjort vem som "vann".
    const tied = [card('1', 90), card('2', 80), card('3', 80)]
    expect(compareAttribute(tied, '2', 'SIK')!.rank).toBe(2)
    expect(compareAttribute(tied, '3', 'SIK')!.rank).toBe(2)
  })

  it('leaves members without stats out of the average', () => {
    const withLocked = [...CREW, card('4', 0, false)]
    const c = compareAttribute(withLocked, '1', 'SIK')!
    expect(c.of).toBe(3)
    expect(c.average).toBe(60)
  })

  it('returns nothing for a member who has no such attribute', () => {
    expect(compareAttribute(CREW, '4', 'SIK')).toBeNull()
    expect(compareAttribute(CREW, '1', 'FINNS-EJ')).toBeNull()
  })

  it('handles a crew of one without dividing by zero', () => {
    const c = compareAttribute([card('1', 70)], '1', 'SIK')!
    expect(c).toMatchObject({ rating: 70, best: 70, average: 70, rank: 1, of: 1 })
  })
})
