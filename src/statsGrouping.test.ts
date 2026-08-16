import { describe, expect, it } from 'vitest'
import type { StatHighlight } from './api'
import { groupHighlights } from './statsGrouping'

function highlight(gameId: string, gameTitle: string): StatHighlight {
  return { gameId, gameTitle, label: 'x', value: '1', holder: 'a', detail: '', standings: [] }
}

describe('groupHighlights', () => {
  it('orders known games first and leaves unknown ids for later', () => {
    const groups = groupHighlights([
      highlight('mystery-game', 'Mystery Game'),
      highlight('valheim', 'Valheim'),
      highlight('cs2', 'Counter-Strike 2'),
    ])

    expect(groups.map((g) => g.gameId)).toEqual(['cs2', 'valheim', 'mystery-game'])
  })

  it('keeps every highlight for a game together under one group', () => {
    const groups = groupHighlights([
      highlight('cs2', 'Counter-Strike 2'),
      highlight('valheim', 'Valheim'),
      highlight('cs2', 'Counter-Strike 2'),
    ])

    expect(groups.find((g) => g.gameId === 'cs2')?.cards).toHaveLength(2)
  })

  it('returns nothing for an empty list', () => {
    expect(groupHighlights([])).toEqual([])
  })
})
