import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  lastFinished: null,
  budget: 20_000,
  squadSize: 5,
  locked: false,
  sellRate: 0.7,
  pointsWin: 3,
  pointsDraw: 1,
  transfersPerMatchday: 1,
  trainingPerMatchday: 2,
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
    { id: 1, name: 'FC Gubbarna', manager: '76561198000000001', bot: false },
    { id: 2, name: 'Träklubborna', manager: null, bot: true },
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

const SESSION = { steamid64: '76561198000000001', isMember: true, isAdmin: false }

describe('ManagerPage', () => {
  it('pitches the game when no season is running', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
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
    // Utloggad: ingen startknapp, bara inloggningsvägen.
    expect(screen.queryByRole('button', { name: /Starta säsongen/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Logga in med Steam för att dra igång/)).toBeInTheDocument()
  })

  it('lets a signed-in visitor start the season', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(SESSION)
    vi.spyOn(api, 'fetchManagerView').mockResolvedValue({
      ...VIEW,
      season: null,
      pool: [],
      teams: [],
      table: [],
      fixtures: [],
    })

    renderPage()

    expect(await screen.findByRole('button', { name: 'Starta säsongen' })).toBeInTheDocument()
  })

  it('says so when the API cannot be reached', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    vi.spyOn(api, 'fetchManagerView').mockResolvedValue(null)

    renderPage()

    expect(await screen.findByText(/kunde inte nås just nu/)).toBeInTheDocument()
  })

  // Läsvyn är öppen: tabell, schema och pool ska synas utan inloggning — men
  // inga knappar utom regelblockets egen (stängd som standard).
  it('shows the season to anonymous visitors without any action buttons', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
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

    expect(screen.getAllByRole('button')).toEqual([
      screen.getByRole('button', { name: 'Så funkar Manager' }),
    ])
  })

  // Utan den vet en förstagångsbesökare inte vad hen tittar på.
  it('always offers the compact rules block, built from the live numbers', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    vi.spyOn(api, 'fetchManagerView').mockResolvedValue(VIEW)

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Så funkar Manager' }))

    // toLocaleString('sv-SE') avgränsar tusental med hårt mellanslag (vilket
    // exakt tecken beror på ICU-versionen) — normalisera innan jämförelsen.
    expect(
      screen.getByText((t) => t.replace(/\s/g, ' ').includes('20 000 att handla för')),
    ).toBeInTheDocument()
    expect(screen.getByText(/5 spelare/)).toBeInTheDocument()
    expect(screen.getByText(/3 för vinst/)).toBeInTheDocument()
    expect(screen.getByText(/1 för oavgjort/)).toBeInTheDocument()
  })

  describe('the season status badge', () => {
    it('says Ingen säsong when nothing has ever been played', async () => {
      vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
      vi.spyOn(api, 'fetchManagerView').mockResolvedValue({
        ...VIEW,
        season: null,
        lastFinished: null,
        pool: [],
        teams: [],
        table: [],
        fixtures: [],
      })
      renderPage()
      expect(await screen.findByText('Ingen säsong')).toBeInTheDocument()
    })

    it('says Avslutad once a season has been played out', async () => {
      vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
      vi.spyOn(api, 'fetchManagerView').mockResolvedValue({
        ...VIEW,
        season: null,
        lastFinished: { name: 'Höstserien', table: VIEW.table, botTeamIds: [2] },
        pool: [],
        teams: [],
        table: [],
        fixtures: [],
      })
      renderPage()
      expect(await screen.findByText('Avslutad')).toBeInTheDocument()
    })

    it('says Lagbygge before the first matchday is played', async () => {
      vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
      vi.spyOn(api, 'fetchManagerView').mockResolvedValue({ ...VIEW, locked: false })
      renderPage()
      expect(await screen.findByText('Lagbygge')).toBeInTheDocument()
    })

    it('says Pågående once the series has started', async () => {
      vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
      vi.spyOn(api, 'fetchManagerView').mockResolvedValue({ ...VIEW, locked: true })
      renderPage()
      expect(await screen.findByText('Pågående')).toBeInTheDocument()
    })
  })

  describe('a primary next step for every state, even anonymous', () => {
    it('invites an anonymous visitor to join during Lagbygge', async () => {
      vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
      vi.spyOn(api, 'fetchManagerView').mockResolvedValue({ ...VIEW, locked: false })
      renderPage()

      expect(await screen.findByRole('link', { name: /logga in med steam/i })).toHaveAttribute(
        'href',
        api.STEAM_LOGIN_URL,
      )
    })

    it('tells an anonymous visitor the squad window is closed once the series is running', async () => {
      vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
      vi.spyOn(api, 'fetchManagerView').mockResolvedValue({ ...VIEW, locked: true })
      renderPage()

      expect(await screen.findByText(/nästa säsong/i)).toBeInTheDocument()
    })

    // Truppfönstret stänger med serien (server/src/routes/manager.ts,
    // 409 season_locked) — ett formulär som ändå går att skicka in vore en
    // lögn om vad som faktiskt händer när man trycker.
    it('tells a signed-in visitor without a team the squad window is closed, instead of a dead form', async () => {
      vi.spyOn(api, 'fetchSession').mockResolvedValue(SESSION)
      vi.spyOn(api, 'fetchManagerView').mockResolvedValue({ ...VIEW, locked: true, myTeam: null })
      renderPage()

      expect(await screen.findByText(/truppfönstret är stängt/i)).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Döp ditt lag' })).not.toBeInTheDocument()
    })
  })

  it('asks a signed-in visitor without a team to name one', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(SESSION)
    vi.spyOn(api, 'fetchManagerView').mockResolvedValue({
      ...VIEW,
      // En ospelad omgång kvar — annars finns det inget att trycka på.
      fixtures: [
        ...VIEW.fixtures,
        {
          id: 12,
          matchday: 2,
          home: { id: 2, name: 'Träklubborna' },
          away: { id: 1, name: 'FC Gubbarna' },
          played: false,
          homeScore: null,
          awayScore: null,
        },
      ],
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Döp ditt lag' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spela nästa omgång' })).toBeInTheDocument()
  })

  it('shows the squad builder when the visitor has a team', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(SESSION)
    vi.spyOn(api, 'fetchManagerView').mockResolvedValue({
      ...VIEW,
      myTeam: {
        id: 1,
        name: 'FC Gubbarna',
        squad: [VIEW.pool[0]],
        spent: 6200,
        funds: 13_800,
        transfersLeft: 0,
        trainingLeft: 0,
    activity: { hours: { cs2: 0, other: 0 }, training: 0, transfer: 0 },
      },
    })

    renderPage()

    expect(await screen.findByRole('button', { name: 'Skriv på truppen' })).toBeInTheDocument()
    // toLocaleString('sv-SE') avgränsar tusental med hårt mellanslag (vilket
    // exakt tecken beror på ICU-versionen) — normalisera innan jämförelsen.
    expect(
      screen.getByText((t) => t.replace(/\s/g, ' ') === 'Trupp: 1/5 · 6 200 av 20 000'),
    ).toBeInTheDocument()
  })

  // Seriefas: truppen är låst — marknaden ersätter truppbyggaren.
  it('shows the transfer desk instead of the builder once the series is running', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(SESSION)
    vi.spyOn(api, 'fetchManagerView').mockResolvedValue({
      ...VIEW,
      locked: true,
      myTeam: {
        id: 1,
        name: 'FC Gubbarna',
        squad: [VIEW.pool[0]],
        spent: 6200,
        funds: 13_800,
        transfersLeft: 1,
        trainingLeft: 2,
    activity: { hours: { cs2: 0, other: 0 }, training: 0, transfer: 0 },
      },
    })

    renderPage()

    expect(await screen.findByRole('button', { name: 'Genomför affären' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skriv på truppen' })).not.toBeInTheDocument()
  })

  // Någon annan gör en affär → poolen och priserna ändras för alla.
  it('refetches the view on a transfer event', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    const spy = vi.spyOn(api, 'fetchManagerView').mockResolvedValue(VIEW)

    renderPage()
    await screen.findByText('Höstserien')
    expect(spy).toHaveBeenCalledTimes(1)

    emitLiveEvent('transfer', { seasonId: 1, teamId: 1, sold: 'm:a', bought: 'g:b' })

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(2)
    })
  })

  // Någon annan spelar en omgång → vyn hämtas om utan omladdning.
  it('refetches the view on a league event', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
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
