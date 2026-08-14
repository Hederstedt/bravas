import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ManagerPage } from './managerPage'
import * as api from '../../api'
import { emitLiveEvent, installLiveEvents, teardownLiveEvents } from '../../test/liveEvents'

beforeEach(() => {
  installLiveEvents()
})

afterEach(() => {
  teardownLiveEvents()
  vi.restoreAllMocks()
})

const RATINGS: api.ManagerRatings = { SIK: 70, SKA: 65, FRA: 60, TÅL: 55, NYT: 50, TID: 45 }

const VIEW: api.ManagerView = {
  season: { id: 1, name: 'Höstserien', starts_at: 1, ends_at: 2, status: 'active' },
  budget: 20_000,
  squadSize: 5,
  pool: [
    {
      key: 'm:a',
      source: 'member',
      name: 'Kungalv',
      ratings: RATINGS,
      value: 6200,
      takenBy: 'FC Gubbarna',
    },
    {
      key: 'g:b',
      source: 'generated',
      name: 'Fria Agenten',
      ratings: RATINGS,
      value: 3100,
      takenBy: null,
    },
  ],
  myTeam: null,
  teams: [
    { id: 1, name: 'FC Gubbarna', manager: '76561198000000001' },
    { id: 2, name: 'Träklubborna', manager: '76561198000000002' },
  ],
  table: [
    {
      teamId: 1,
      name: 'FC Gubbarna',
      played: 2,
      won: 2,
      drawn: 0,
      lost: 0,
      roundsFor: 26,
      roundsAgainst: 10,
      diff: 16,
      points: 6,
    },
    {
      teamId: 2,
      name: 'Träklubborna',
      played: 2,
      won: 0,
      drawn: 0,
      lost: 2,
      roundsFor: 10,
      roundsAgainst: 26,
      diff: -16,
      points: 0,
    },
  ],
  fixtures: [
    {
      id: 11,
      matchday: 1,
      home: { id: 1, name: 'FC Gubbarna' },
      away: { id: 2, name: 'Träklubborna' },
      played: true,
      homeScore: 13,
      awayScore: 5,
    },
  ],
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/manager']}>
      <ManagerPage />
    </MemoryRouter>,
  )
}

describe('ManagerPage', () => {
  it('pitches the game when no season is running', async () => {
    vi.spyOn(api, 'fetchManagerView').mockResolvedValue({
      ...VIEW,
      season: null,
      pool: [],
      teams: [],
      table: [],
      fixtures: [],
    })

    renderPage()

    expect(await screen.findByText(/Ingen säsong igång ännu/)).toBeInTheDocument()
  })

  it('says so when the API cannot be reached', async () => {
    vi.spyOn(api, 'fetchManagerView').mockResolvedValue(null)

    renderPage()

    expect(await screen.findByText(/kunde inte nås just nu/)).toBeInTheDocument()
  })

  // Läsvyn är öppen: tabell, schema och pool ska synas utan inloggning.
  it('shows the season to anonymous visitors', async () => {
    vi.spyOn(api, 'fetchManagerView').mockResolvedValue(VIEW)

    renderPage()

    expect(await screen.findByText('Höstserien')).toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Ligatabellen' })
    expect(within(table).getByText('FC Gubbarna')).toBeInTheDocument()
    expect(within(table).getByText('6')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: '13–5' })).toHaveAttribute(
      'href',
      '/manager/match/11',
    )

    const pool = screen.getByRole('table', { name: 'Spelarpoolen' })
    expect(within(pool).getByText('Fria Agenten')).toBeInTheDocument()
    expect(within(pool).getByText('Ledig')).toBeInTheDocument()
  })

  it('shows the visitor their own squad and spend', async () => {
    vi.spyOn(api, 'fetchManagerView').mockResolvedValue({
      ...VIEW,
      myTeam: {
        id: 1,
        name: 'FC Gubbarna',
        squad: [VIEW.pool[0]],
        spent: 6200,
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'FC Gubbarna' })).toBeInTheDocument()
    // toLocaleString('sv-SE') avgränsar tusental med hårt mellanslag (vilket
    // exakt tecken beror på ICU-versionen) — normalisera innan jämförelsen.
    expect(
      screen.getByText((t) => t.replace(/\s/g, ' ') === '6 200 av 20 000 spenderat'),
    ).toBeInTheDocument()
  })

  // Någon annan spelar en omgång → vyn hämtas om utan omladdning.
  it('refetches the view on a league event', async () => {
    const spy = vi.spyOn(api, 'fetchManagerView').mockResolvedValue(VIEW)

    renderPage()
    await screen.findByText('Höstserien')
    expect(spy).toHaveBeenCalledTimes(1)

    emitLiveEvent('league', { seasonId: 1, matchday: 2, played: 1 })

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(2)
    })
  })
})
