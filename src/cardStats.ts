import type { PlayerCard } from './api'

export interface AttributeComparison {
  rating: number
  best: number
  average: number
  rank: number
  of: number
}

// Var en gubbe står i förhållande till resten av klanen i ett enskilt attribut.
// Räknas i webbläsaren ur kort vi redan hämtat — ingen extra fråga till API:et.
//
// Gubbar utan statistik räknas inte med. De har inga attribut att jämföra, och
// att låta dem dra ner snittet vore missvisande.
export function compareAttribute(
  cards: PlayerCard[],
  id: string,
  key: string,
): AttributeComparison | null {
  const values = cards
    .map((c) => ({ id: c.id, rating: c.attributes.find((a) => a.key === key)?.rating }))
    .filter((v): v is { id: string; rating: number } => typeof v.rating === 'number')

  const mine = values.find((v) => v.id === id)
  if (!mine) return null

  const total = values.reduce((sum, v) => sum + v.rating, 0)

  return {
    rating: mine.rating,
    best: Math.max(...values.map((v) => v.rating)),
    average: Math.round(total / values.length),
    // Delad placering vid lika betyg: två på 80 är båda tvåa, inte tvåa och
    // trea. Annars hade ordningen i listan avgjort vem som "vann".
    rank: values.filter((v) => v.rating > mine.rating).length + 1,
    of: values.length,
  }
}
