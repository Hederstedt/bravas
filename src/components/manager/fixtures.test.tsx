import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Fixtures } from './fixtures'
import type { PublicFixture } from '../../api'

const FIXTURES: PublicFixture[] = [
  {
    id: 11,
    matchday: 1,
    home: { id: 1, name: 'FC Gubbarna' },
    away: { id: 2, name: 'Träklubborna' },
    played: true,
    homeScore: 13,
    awayScore: 5,
  },
  {
    id: 12,
    matchday: 2,
    home: { id: 2, name: 'Träklubborna' },
    away: { id: 1, name: 'FC Gubbarna' },
    played: false,
    homeScore: null,
    awayScore: null,
  },
]

function renderFixtures(fixtures: PublicFixture[]) {
  render(
    <MemoryRouter>
      <Fixtures fixtures={fixtures} />
    </MemoryRouter>,
  )
}

describe('Fixtures', () => {
  it('groups the fixtures by matchday', () => {
    renderFixtures(FIXTURES)

    const day1 = screen.getByRole('region', { name: 'Omgång 1' })
    expect(within(day1).getByText('FC Gubbarna')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Omgång 2' })).toBeInTheDocument()
  })

  it('links a played fixture to its report', () => {
    renderFixtures(FIXTURES)
    expect(screen.getByRole('link', { name: '13–5' })).toHaveAttribute('href', '/manager/match/11')
  })

  it('shows a dash for an unplayed fixture without a link', () => {
    renderFixtures(FIXTURES)
    const day2 = screen.getByRole('region', { name: 'Omgång 2' })
    expect(within(day2).queryByRole('link')).not.toBeInTheDocument()
    expect(within(day2).getByText('–')).toBeInTheDocument()
  })

  it('explains an empty schedule', () => {
    renderFixtures([])
    expect(screen.getByText(/Spelschemat läggs/)).toBeInTheDocument()
  })
})
