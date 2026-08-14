import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Fixtures } from './fixtures'
import * as api from '../../api'
import type { PublicFixture } from '../../api'

afterEach(() => {
  vi.restoreAllMocks()
})

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

function renderFixtures(
  fixtures: PublicFixture[],
  props: { canPlay?: boolean; onPlayed?: () => void } = {},
) {
  render(
    <MemoryRouter>
      <Fixtures fixtures={fixtures} {...props} />
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

  it('hides the play button from anonymous visitors', () => {
    renderFixtures(FIXTURES)
    expect(screen.queryByRole('button', { name: /Spela nästa omgång/ })).not.toBeInTheDocument()
  })

  it('plays the next matchday and hands control back', async () => {
    const user = userEvent.setup()
    const played = vi.fn()
    vi.spyOn(api, 'playMatchday').mockResolvedValue({ ok: true, data: { matchday: 2, played: 1 } })

    renderFixtures(FIXTURES, { canPlay: true, onPlayed: played })

    await user.click(screen.getByRole('button', { name: 'Spela nästa omgång' }))
    expect(played).toHaveBeenCalled()
  })

  // Kapplöpning: någon annan spelade sista omgången precis före klicket.
  it('says the season is finished on a 409', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'playMatchday').mockResolvedValue({
      ok: false,
      error: 'season_finished',
      message: null,
    })

    renderFixtures(FIXTURES, { canPlay: true })

    await user.click(screen.getByRole('button', { name: 'Spela nästa omgång' }))
    expect(await screen.findByText('Serien är färdigspelad.')).toBeInTheDocument()
  })

  // Serien är slutspelad — då finns inget att trycka på.
  it('hides the play button when every fixture is played', () => {
    renderFixtures(
      FIXTURES.map((f) => ({ ...f, played: true, homeScore: 13, awayScore: 5 })),
      { canPlay: true },
    )
    expect(screen.queryByRole('button', { name: /Spela nästa omgång/ })).not.toBeInTheDocument()
  })
})
