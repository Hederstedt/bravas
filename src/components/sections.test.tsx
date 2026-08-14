import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Nav, Games, Stats } from './sections'
import { games, statHighlights } from '../data/clan'
import * as api from '../api'
import type { ValheimStatus } from '../api'
import { emitLiveEvent, installLiveEvents, teardownLiveEvents } from '../test/liveEvents'

// Nav använder Link och behöver en router omkring sig.
function renderNav() {
  render(
    <MemoryRouter>
      <Nav />
    </MemoryRouter>,
  )
}

describe('Games', () => {
  it('renders one card per game with title and status', () => {
    render(<Games />)
    for (const g of games) {
      const card = screen.getByRole('heading', { name: g.title }).closest('article')!
      if (g.id === 'valheim') {
        // Valheim-kortet bär livestatusen i stället för en statisk pill.
        expect(within(card).queryByText(g.status)).not.toBeInTheDocument()
      } else {
        expect(within(card).getByText(g.status)).toBeInTheDocument()
      }
    }
  })
})

function valheimCard() {
  return screen.getByRole('heading', { name: 'Valheim' }).closest('article')!
}

const ONLINE_ANON: ValheimStatus = {
  online: true,
  players: 2,
  maxPlayers: 10,
  address: 'valheim.bravas.se:2456',
  serverName: null,
  password: null,
}

describe('Valheim server status', () => {
  beforeEach(() => {
    installLiveEvents()
  })

  afterEach(() => {
    teardownLiveEvents()
    vi.restoreAllMocks()
  })

  it('shows the player count when online', async () => {
    vi.spyOn(api, 'fetchValheimStatus').mockResolvedValue(ONLINE_ANON)
    render(<Games />)

    const card = valheimCard()
    expect(await within(card).findByText(/2\s*\/\s*10/)).toBeInTheDocument()
  })

  it('shows offline instead of a player count when the server is down', async () => {
    vi.spyOn(api, 'fetchValheimStatus').mockResolvedValue({
      online: false,
      players: null,
      maxPlayers: null,
      address: 'valheim.bravas.se:2456',
      serverName: null,
      password: null,
    })
    render(<Games />)

    const card = valheimCard()
    expect(await within(card).findByText('Offline')).toBeInTheDocument()
  })

  it('invites an anonymous visitor to log in instead of showing name and password', async () => {
    vi.spyOn(api, 'fetchValheimStatus').mockResolvedValue(ONLINE_ANON)
    render(<Games />)

    const card = valheimCard()
    expect(await within(card).findByText(/Logga in/)).toBeInTheDocument()
    expect(within(card).queryByText('hemligt123')).not.toBeInTheDocument()
  })

  it('reveals the server name and password to a signed-in member', async () => {
    vi.spyOn(api, 'fetchValheimStatus').mockResolvedValue({
      ...ONLINE_ANON,
      serverName: 'Bravas Valheim Server',
      password: 'hemligt123',
    })
    render(<Games />)

    const card = valheimCard()
    expect(await within(card).findByText('Bravas Valheim Server')).toBeInTheDocument()
    expect(within(card).getByText('hemligt123')).toBeInTheDocument()
  })

  // Uppgifterna bor på kortets baksida — klicket vänder kortet, och ett klick
  // till vänder tillbaka det.
  it('flips the card to the connection details and back again', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchValheimStatus').mockResolvedValue({
      ...ONLINE_ANON,
      serverName: 'Bravas Valheim Server',
      password: 'hemligt123',
    })
    render(<Games />)

    const card = valheimCard()
    expect(card.className).not.toContain('flipped')

    await user.click(await within(card).findByRole('button', { name: /Visa namn/ }))
    expect(card.className).toContain('flipped')

    await user.click(within(card).getByRole('button', { name: /Vänd tillbaka/ }))
    expect(card.className).not.toContain('flipped')
  })

  it('copies the password to the clipboard without flipping the card back', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchValheimStatus').mockResolvedValue({
      ...ONLINE_ANON,
      serverName: 'Bravas Valheim Server',
      password: 'hemligt123',
    })
    render(<Games />)

    const card = valheimCard()
    await user.click(await within(card).findByRole('button', { name: /Visa namn/ }))
    await user.click(within(card).getByRole('button', { name: 'Kopiera lösenordet' }))

    expect(await window.navigator.clipboard.readText()).toBe('hemligt123')
    expect(card.className).toContain('flipped')
  })

  it('updates live when the server status changes', async () => {
    vi.spyOn(api, 'fetchValheimStatus').mockResolvedValue(ONLINE_ANON)
    render(<Games />)

    const card = valheimCard()
    expect(await within(card).findByText(/2\s*\/\s*10/)).toBeInTheDocument()

    act(() => {
      emitLiveEvent('valheim', { online: true, players: 5, maxPlayers: 10 })
    })

    expect(within(card).getByText(/5\s*\/\s*10/)).toBeInTheDocument()
  })
})

describe('Stats', () => {
  it('renders all highlights and the demo badge', () => {
    render(<Stats />)
    expect(screen.getByText('Demo-data')).toBeInTheDocument()
    for (const s of statHighlights) {
      expect(screen.getByText(s.label)).toBeInTheDocument()
    }
  })
})

describe('Nav mobile menu', () => {
  it('opens and closes via the burger button', async () => {
    const user = userEvent.setup()
    renderNav()

    const burger = screen.getByRole('button', { name: 'Öppna menyn' })
    expect(screen.queryByRole('dialog', { name: 'Meny' })).not.toBeInTheDocument()

    await user.click(burger)
    expect(screen.getByRole('dialog', { name: 'Meny' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stäng menyn' }))
    expect(screen.queryByRole('dialog', { name: 'Meny' })).not.toBeInTheDocument()
  })

  it('closes when a menu link is clicked', async () => {
    const user = userEvent.setup()
    renderNav()

    await user.click(screen.getByRole('button', { name: 'Öppna menyn' }))
    const overlay = screen.getByRole('dialog', { name: 'Meny' })
    await user.click(within(overlay).getByRole('link', { name: 'Spel' }))
    expect(screen.queryByRole('dialog', { name: 'Meny' })).not.toBeInTheDocument()
  })
})
