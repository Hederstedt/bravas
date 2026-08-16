import type { StatHighlight } from './api'
import { games } from './data/clan'

// Ordningen highlights grupperas i på Siffrorna. Ett gameId som saknas här
// hamnar sist, i den ordning det råkar dyka upp i svaret.
const GAME_ORDER = [...games.map((g) => g.id), 'steam']

export interface StatGroup {
  gameId: string
  gameTitle: string
  cards: StatHighlight[]
}

// Grupperar highlights per spel i GAME_ORDER. Ren funktion, egen fil: en
// komponentfil får bara exportera komponenter, annars slutar fast refresh
// fungera för den.
export function groupHighlights(cards: StatHighlight[]): StatGroup[] {
  const byGame = new Map<string, StatHighlight[]>()
  for (const s of cards) {
    const group = byGame.get(s.gameId)
    if (group) group.push(s)
    else byGame.set(s.gameId, [s])
  }

  return [...byGame.entries()]
    .map(([gameId, groupCards]) => ({ gameId, gameTitle: groupCards[0]!.gameTitle, cards: groupCards }))
    .sort((a, b) => {
      const ai = GAME_ORDER.indexOf(a.gameId)
      const bi = GAME_ORDER.indexOf(b.gameId)
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
}
