import { describe, expect, it } from 'vitest'
import { monthLabel, relativeTime } from './feedText'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 7, 22, 12, 0, 0)

describe('relativeTime', () => {
  it('säger "nyss" i stället för att räkna sekunder', () => {
    expect(relativeTime(NOW - 20_000, NOW)).toBe('nyss')
    expect(relativeTime(NOW, NOW)).toBe('nyss')
  })

  it('växlar enhet med avståndet', () => {
    expect(relativeTime(NOW - 5 * MIN, NOW)).toBe('för 5 minuter sedan')
    expect(relativeTime(NOW - 3 * HOUR, NOW)).toBe('för 3 timmar sedan')
    expect(relativeTime(NOW - 4 * DAY, NOW)).toBe('för 4 dagar sedan')
  })

  // numeric: 'auto' ger svenskans egna ord där de finns — "i går" läser bättre
  // än "för 1 dag sedan".
  it('använder svenskans egna ord där de finns', () => {
    expect(relativeTime(NOW - DAY, NOW)).toBe('i går')
  })

  it('går över till veckor, månader och år i stället för att räkna dagar i evighet', () => {
    // Intl väljer svenskans idiom här också: "förra veckan", inte "för 1 vecka sedan".
    expect(relativeTime(NOW - 10 * DAY, NOW)).toBe('förra veckan')
    expect(relativeTime(NOW - 70 * DAY, NOW)).toBe('för 2 månader sedan')
    expect(relativeTime(NOW - 800 * DAY, NOW)).toBe('för 2 år sedan')
  })

  // Klockan på servern och klockan i webbläsaren är inte samma klocka. Ett
  // par sekunders framtid ska inte bli "om 3 sekunder".
  it('behandlar en tidsstämpel strax i framtiden som nyss', () => {
    expect(relativeTime(NOW + 30_000, NOW)).toBe('nyss')
  })
})

describe('monthLabel', () => {
  it('gör månadsnyckeln läsbar', () => {
    expect(monthLabel('2026-07')).toBe('juli')
    expect(monthLabel('2026-01')).toBe('januari')
    expect(monthLabel('2026-12')).toBe('december')
  })

  // Kommer det något oväntat från servern ska raden visa nyckeln som den är
  // hellre än "Invalid Date".
  it('lämnar en oläslig nyckel orörd', () => {
    expect(monthLabel('kanske-juli')).toBe('kanske-juli')
  })
})
