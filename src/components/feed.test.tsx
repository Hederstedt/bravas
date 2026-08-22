import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Feed } from './feed'
import * as api from '../api'
import { installLiveEvents, teardownLiveEvents } from '../test/liveEvents'
import { resetApiOutage } from '../useApiOutage'

const DAY = 86_400_000
const NOW = Date.now()

beforeEach(() => {
  installLiveEvents()
  resetApiOutage()
})

afterEach(() => {
  teardownLiveEvents()
  vi.restoreAllMocks()
})

function renderFeed(items: api.FeedItem[]) {
  vi.spyOn(api, 'fetchFeedResult').mockResolvedValue({ ok: true, data: items })
  render(
    <MemoryRouter>
      <Feed />
    </MemoryRouter>,
  )
}

describe('Loggboken', () => {
  it('skriver ut en rad per händelse, med tiden bredvid', async () => {
    renderFeed([
      { kind: 'quote', at: NOW - DAY, text: 'Jag hade ju träklubban', saidBy: 'Mag' },
      {
        kind: 'member',
        at: NOW - 3 * DAY,
        id: 'pid-1',
        name: 'Kungalv',
        avatarUrl: 'https://avatar',
      },
    ])

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText(/Jag hade ju träklubban/)).toBeInTheDocument()
    expect(within(rows[0]!).getByText(/Mag/)).toBeInTheDocument()
    expect(within(rows[0]!).getByText('i går')).toBeInTheDocument()
    expect(within(rows[1]!).getByText(/Kungalv/)).toBeInTheDocument()
  })

  it('länkar matchen till sitt referat', async () => {
    renderFeed([
      {
        kind: 'match',
        at: NOW,
        fixtureId: 12,
        home: 'Gubbarna FC',
        away: 'Rush B United',
        homeScore: 16,
        awayScore: 13,
      },
    ])

    const link = await screen.findByRole('link', { name: /Gubbarna FC/ })
    expect(link).toHaveAttribute('href', '/manager/match/12')
    expect(link).toHaveTextContent('16–13')
  })

  it('namnger månaden i klartext i stället för att visa nyckeln', async () => {
    renderFeed([{ kind: 'month', at: NOW, id: 'pid-1', name: 'Mag', month: '2026-07' }])

    expect(await screen.findByText(/juli/)).toBeInTheDocument()
    expect(screen.queryByText(/2026-07/)).not.toBeInTheDocument()
  })

  it('säger att det är lugnt i stället för att visa en tom lista', async () => {
    renderFeed([])

    expect(await screen.findByText(/Inget har hänt än/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('erbjuder en omhämtning när loggboken inte gick att hämta', async () => {
    vi.spyOn(api, 'fetchFeedResult').mockResolvedValue({ ok: false })
    render(
      <MemoryRouter>
        <Feed />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Kunde inte hämta loggboken/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Försök igen/ })).toBeInTheDocument()
  })
})
