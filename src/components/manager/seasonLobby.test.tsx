import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SeasonLobby } from './seasonLobby'
import * as api from '../../api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SeasonLobby', () => {
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
