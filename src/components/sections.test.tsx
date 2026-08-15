import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { About, DiscordCta, Nav, Games, Stats } from './sections'
import { games, members, statHighlights } from '../data/clan'
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
  signedIn: false,
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
      signedIn: false,
      serverName: null,
      password: null,
    })
    render(<Games />)

    const card = valheimCard()
    expect(await within(card).findByText('Offline')).toBeInTheDocument()
  })

  // Inloggad men utan uppgifter betyder att serverns .env saknar dem. Att då
  // säga "logga in" är fel besked till någon som redan är inloggad.
  it('says the credentials are missing rather than telling a member to log in', async () => {
    vi.spyOn(api, 'fetchValheimStatus').mockResolvedValue({ ...ONLINE_ANON, signedIn: true })
    render(<Games />)

    const card = valheimCard()
    expect(await within(card).findByText(/inte ifyllda än/)).toBeInTheDocument()
    expect(within(card).queryByText(/Logga in för att se/)).not.toBeInTheDocument()
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

// Widgeten hämtas av BFF:en, inte av webbläsaren — server-ID:t stannar i
// backend och sajten talar aldrig med Discord från klienten.
describe('DiscordCta', () => {
  const ONLINE: api.DiscordStatus = {
    available: true,
    online: 2,
    members: [
      { name: 'Mag', status: 'online', game: 'Counter-Strike 2' },
      { name: 'Kungalv', status: 'idle', game: null },
    ],
  }

  beforeEach(() => {
    installLiveEvents()
    vi.spyOn(api, 'fetchSiteConfig').mockResolvedValue({
      discordInviteUrl: 'https://discord.gg/test',
    })
  })

  afterEach(() => {
    teardownLiveEvents()
    vi.restoreAllMocks()
  })

  it('lists who is hanging out, and what they are playing', async () => {
    vi.spyOn(api, 'fetchDiscordStatus').mockResolvedValue(ONLINE)
    render(<DiscordCta />)

    expect(await screen.findByText(/2 gubbar inne just nu/)).toBeInTheDocument()
    expect(screen.getByText('Mag')).toBeInTheDocument()
    expect(screen.getByText('Counter-Strike 2')).toBeInTheDocument()
  })

  it('counts one gubbe in the singular', async () => {
    vi.spyOn(api, 'fetchDiscordStatus').mockResolvedValue({
      ...ONLINE,
      online: 1,
      members: [ONLINE.members[0]],
    })
    render(<DiscordCta />)

    expect(await screen.findByText(/1 gubbe inne just nu/)).toBeInTheDocument()
  })

  // Discord räknar alla online, även de som inte ryms i namnlistan.
  it('says how many did not fit in the list', async () => {
    vi.spyOn(api, 'fetchDiscordStatus').mockResolvedValue({ ...ONLINE, online: 9 })
    render(<DiscordCta />)

    expect(await screen.findByText('+7 till')).toBeInTheDocument()
  })

  it('invites someone to start the evening when nobody is in', async () => {
    vi.spyOn(api, 'fetchDiscordStatus').mockResolvedValue({
      available: true,
      online: 0,
      members: [],
    })
    render(<DiscordCta />)

    expect(await screen.findByText(/Tomt i Discorden just nu/)).toBeInTheDocument()
  })

  // Widgeten är avstängd i Discord, eller servern svarar inte — då ska
  // sektionen se ut som den alltid gjort i stället för att visa en tom lista.
  it('falls back to the plain invite when the widget is unavailable', async () => {
    vi.spyOn(api, 'fetchDiscordStatus').mockResolvedValue({
      available: false,
      online: 0,
      members: [],
    })
    render(<DiscordCta />)

    expect(await screen.findByRole('link', { name: /Joina BVS/ })).toBeInTheDocument()
    expect(screen.queryByText(/inne just nu/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Tomt i Discorden/)).not.toBeInTheDocument()
  })

  it('updates live when someone joins', async () => {
    vi.spyOn(api, 'fetchDiscordStatus').mockResolvedValue(ONLINE)
    render(<DiscordCta />)

    expect(await screen.findByText(/2 gubbar inne just nu/)).toBeInTheDocument()

    act(() => {
      emitLiveEvent('discord', {
        available: true,
        online: 3,
        members: [...ONLINE.members, { name: 'BrunKalle', status: 'online', game: null }],
      })
    })

    expect(screen.getByText(/3 gubbar inne just nu/)).toBeInTheDocument()
    expect(screen.getByText('BrunKalle')).toBeInTheDocument()
  })
})

// Räknaren tog längden på den hårdkodade platshållarlistan, så sajten kunde
// visa tio riktiga gubbar i rostern och samtidigt påstå sex.
describe('About', () => {
  it('counts the real crew once the roster has loaded', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({
      steamid64: `7656119800000000${i}`,
      personaName: `Gubbe ${i}`,
      avatarUrl: null,
      discordName: null,
    }))
    vi.spyOn(api, 'fetchMembers').mockResolvedValue(eight)

    render(<About />)

    expect(await screen.findByText('8')).toBeInTheDocument()
  })

  it('falls back to the placeholder count while nobody has logged in', async () => {
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([])

    render(<About />)

    expect(await screen.findByText(String(members.length))).toBeInTheDocument()
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
