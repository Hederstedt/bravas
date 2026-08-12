import { describe, expect, it } from 'vitest'
import { games, members, statHighlights } from './clan'

describe('clan data', () => {
  it('has unique game ids', () => {
    const ids = games.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique member nicks', () => {
    const nicks = members.map((m) => m.nick)
    expect(new Set(nicks).size).toBe(nicks.length)
  })

  it('only uses valid statuses', () => {
    for (const g of games) {
      expect(['Aktivt', 'Säsong', 'På is']).toContain(g.status)
    }
  })

  it('includes World of Tanks and not Minecraft', () => {
    expect(games.some((g) => g.id === 'wot')).toBe(true)
    expect(games.some((g) => g.id === 'minecraft')).toBe(false)
  })

  it('stat highlights reference known games or steam', () => {
    const known = new Set([...games.map((g) => g.id), 'steam'])
    for (const s of statHighlights) {
      expect(known).toContain(s.gameId)
    }
  })
})
