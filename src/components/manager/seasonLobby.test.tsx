import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SeasonLobby } from './seasonLobby'
import * as api from '../../api'

afterEach(() => {
  vi.restoreAllMocks()
})

const FINISHED: api.FinishedSeason = {
  name: 'Höstserien',
  botTeamIds: [2],
  table: [
    {
      teamId: 1,
      name: 'FC Gubbarna',
      played: 6,
      won: 4,
      drawn: 1,
      lost: 1,
      roundsFor: 70,
      roundsAgainst: 50,
      diff: 20,
      points: 13,
    },
    {
      teamId: 2,
      name: 'Träklubborna',
      played: 6,
      won: 1,
      drawn: 1,
      lost: 4,
      roundsFor: 50,
      roundsAgainst: 70,
      diff: -20,
      points: 4,
    },
  ],
}

describe('SeasonLobby', () => {
  // När serien tar slut stängs säsongen och lobbyn tar över. Utan förra
  // tabellen kvar ser det ut som att allt man spelat fram raderades.
  describe('after a season has been played out', () => {
    it('names the season and its winner', () => {
      render(<SeasonLobby signedIn onStarted={() => {}} lastFinished={FINISHED} />)

      // Namnet står både i sammanfattningen och som rubrik över tabellen.
      expect(screen.getAllByText(/Höstserien/).length).toBeGreaterThan(0)
      expect(screen.getByText(/är färdigspelad/)).toBeInTheDocument()
      expect(screen.getByText(/13 poäng/)).toBeInTheDocument()
    })

    it('keeps the final table on screen, bots marked as in the live table', () => {
      render(<SeasonLobby signedIn onStarted={() => {}} lastFinished={FINISHED} />)

      const table = screen.getByRole('table', { name: 'Ligatabellen' })
      expect(within(table).getByText('Träklubborna')).toBeInTheDocument()
      expect(within(table).getByText('BOT')).toBeInTheDocument()
    })

    it('still lets a new season be started', () => {
      render(<SeasonLobby signedIn onStarted={() => {}} lastFinished={FINISHED} />)
      expect(screen.getByRole('button', { name: /Starta säsongen/ })).toBeInTheDocument()
    })
  })

  it('explains the game from scratch when nothing has been played yet', () => {
    render(<SeasonLobby signedIn onStarted={() => {}} />)

    expect(screen.getByText(/Ingen säsong igång ännu/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  // Texten skrev tidigare av "20 000" för hand — glider isär från servern om
  // budgeten någonsin ändras. budget/squadSize kommer nu från vyn.
  it('quotes the real budget instead of a hardcoded number', () => {
    render(<SeasonLobby signedIn onStarted={() => {}} budget={25_000} squadSize={6} />)
    // toLocaleString('sv-SE') avgränsar tusental med hårt mellanslag (vilket
    // exakt tecken beror på ICU-versionen) — normalisera innan jämförelsen.
    expect(
      screen.getByText((t) => t.replace(/\s/g, ' ').includes('25 000')),
    ).toBeInTheDocument()
  })

  it('offers Steam login instead of a form to anonymous visitors', () => {
    render(<SeasonLobby signedIn={false} onStarted={() => {}} />)

    expect(screen.getByText(/Logga in med Steam för att dra igång/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Starta säsongen/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Logga in med Steam' })).toHaveAttribute(
      'href',
      api.STEAM_LOGIN_URL,
    )
  })

  it('starts the season with the given name', async () => {
    const user = userEvent.setup()
    const started = vi.fn()
    const spy = vi.spyOn(api, 'startSeason').mockResolvedValue({
      ok: true,
      data: { season: { id: 1, name: 'Garageligan', starts_at: 1, ends_at: 2, status: 'active' } },
    })

    render(<SeasonLobby signedIn onStarted={started} />)

    await user.type(screen.getByLabelText(/Vad ska säsongen heta/), 'Garageligan')
    await user.click(screen.getByRole('button', { name: 'Starta säsongen' }))

    expect(spy).toHaveBeenCalledWith('Garageligan')
    expect(started).toHaveBeenCalled()
  })

  it('does not submit an empty name', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(api, 'startSeason')

    render(<SeasonLobby signedIn onStarted={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Starta säsongen' }))

    expect(spy).not.toHaveBeenCalled()
  })

  // Namnfältet speglar serverns gräns så för långa namn stoppas i fältet.
  it('caps the name at the server limit', () => {
    render(<SeasonLobby signedIn onStarted={() => {}} />)
    expect(screen.getByLabelText(/Vad ska säsongen heta/)).toHaveAttribute(
      'maxlength',
      String(api.MAX_TEAM_NAME),
    )
  })

  it('shows an error when the start fails', async () => {
    const user = userEvent.setup()
    const started = vi.fn()
    vi.spyOn(api, 'startSeason').mockResolvedValue({ ok: false, error: 'network', message: null })

    render(<SeasonLobby signedIn onStarted={started} />)

    await user.type(screen.getByLabelText(/Vad ska säsongen heta/), 'Garageligan')
    await user.click(screen.getByRole('button', { name: 'Starta säsongen' }))

    expect(await screen.findByText(/Säsongen kunde inte startas/)).toBeInTheDocument()
    expect(started).not.toHaveBeenCalled()
  })
})
