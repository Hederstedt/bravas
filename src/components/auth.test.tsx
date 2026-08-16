import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { SteamLogin } from './auth'
import * as api from '../api'
import { resetSiteConfigCache } from '../useSiteConfig'

beforeEach(() => {
  resetSiteConfigCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SteamLogin', () => {
  it('offers a Steam login link when nobody is signed in', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    render(<SteamLogin />)

    const link = await screen.findByRole('link', { name: /logga in med steam/i })
    expect(link).toHaveAttribute('href', '/api/auth/steam/login')
  })

  it('greets the signed-in member by persona name', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue({ steamid64: '76561198053832683' })
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([
      {
        steamid64: '76561198053832683',
        personaName: '[BVS] #Mag',
        avatarUrl: 'https://avatars.example/mag.jpg',
        discordName: null, wotNickname: null,
      },
    ])

    render(<SteamLogin />)

    expect(await screen.findByText('[BVS] #Mag')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /logga in med steam/i })).not.toBeInTheDocument()
  })

  it('falls back to the login link if the session lookup fails', async () => {
    vi.spyOn(api, 'fetchSession').mockRejectedValue(new Error('offline'))
    render(<SteamLogin />)

    expect(await screen.findByRole('link', { name: /logga in med steam/i })).toBeInTheDocument()
  })

  it('renders nothing while the session is still loading', () => {
    vi.spyOn(api, 'fetchSession').mockReturnValue(new Promise(() => {}))
    const { container } = render(<SteamLogin />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Stats section', () => {
  const realHighlight = {
    gameId: 'cs2',
    gameTitle: 'Counter-Strike 2',
    label: 'Flest kills',
    value: '87 021',
    holder: '[BVS] ⛟',
    detail: '52 000 dödsfall på vägen',
    standings: [
      { name: '[BVS] ⛟', value: '87 021' },
      { name: '[BVS] #Mag', value: '47 821' },
    ],
  }

  it('shows real numbers and drops the demo badge once the API delivers', async () => {
    vi.spyOn(api, 'fetchHighlights').mockResolvedValue({
      highlights: [realHighlight],
      memberCount: 10,
      withStats: 4,
    })

    const { Stats } = await import('./sections')
    render(<Stats />)

    expect(await screen.findByText('Flest kills')).toBeInTheDocument()
    expect(screen.getByText('[BVS] ⛟')).toBeInTheDocument()
    expect(screen.queryByText('Demo-data')).not.toBeInTheDocument()
  })

  it('says how many profiles are still closed', async () => {
    vi.spyOn(api, 'fetchHighlights').mockResolvedValue({
      highlights: [realHighlight],
      memberCount: 10,
      withStats: 4,
    })

    const { Stats } = await import('./sections')
    render(<Stats />)

    expect(await screen.findByText(/4 av 10/)).toBeInTheDocument()
  })

  // Innan någon öppnat sin profil finns inga riktiga siffror — då är demo-datan
  // ärligare än en tom sektion, så länge den är märkt.
  it('falls back to clearly marked demo data when no real stats exist', async () => {
    vi.spyOn(api, 'fetchHighlights').mockResolvedValue({
      highlights: [],
      memberCount: 10,
      withStats: 0,
    })

    const { Stats } = await import('./sections')
    render(<Stats />)

    await waitFor(() => {
      expect(screen.getByText('Demo-data')).toBeInTheDocument()
    })
  })
})

describe('Discord links', () => {
  it('uses the invite the API hands out', async () => {
    vi.spyOn(api, 'fetchSiteConfig').mockResolvedValue({
      discordInviteUrl: 'https://discord.gg/R7BTunRvjb',
    })

    const { DiscordCta } = await import('./sections')
    render(<DiscordCta />)

    const link = await screen.findByRole('link', { name: /Joina BVS/ })
    expect(link).toHaveAttribute('href', 'https://discord.gg/R7BTunRvjb')
  })

  // Utan invite är en död "#"-länk sämre än ingen knapp alls.
  it('hides the button when no invite is configured', async () => {
    vi.spyOn(api, 'fetchSiteConfig').mockResolvedValue({ discordInviteUrl: '' })

    const { DiscordCta } = await import('./sections')
    render(<DiscordCta />)

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Joina BVS/ })).not.toBeInTheDocument()
    })
  })
})

describe('Roster with live data', () => {
  it('shows real members once the API returns them', async () => {
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([
      {
        steamid64: '76561198053832683',
        personaName: '[BVS] #Mag',
        avatarUrl: 'https://avatars.example/mag.jpg',
        discordName: 'mag', wotNickname: null,
      },
      {
        steamid64: '76561197963771177',
        personaName: '[BVS] g0nza',
        avatarUrl: null,
        discordName: null, wotNickname: null,
      },
    ])

    const { Roster } = await import('./sections')
    render(<Roster />)

    expect(await screen.findByRole('heading', { name: '[BVS] #Mag' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '[BVS] g0nza' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Gubbe #1' })).not.toBeInTheDocument()
  })

  it('keeps the placeholder roster when nobody has logged in yet', async () => {
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([])

    const { Roster } = await import('./sections')
    render(<Roster />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Gubbe #1' })).toBeInTheDocument()
    })
  })

  it('marks who is online and what they are playing', async () => {
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([
      { steamid64: '1', personaName: 'Spelaren', avatarUrl: null, discordName: null , wotNickname: null},
      { steamid64: '2', personaName: 'Vaken', avatarUrl: null, discordName: null , wotNickname: null},
      { steamid64: '3', personaName: 'Borta', avatarUrl: null, discordName: null , wotNickname: null},
    ])
    vi.spyOn(api, 'fetchPresence').mockResolvedValue({
      '1': { status: 'in-game', game: 'Counter-Strike 2' },
      '2': { status: 'online', game: null },
      '3': { status: 'offline', game: null },
    })

    const { Roster } = await import('./sections')
    render(<Roster />)

    const playing = (await screen.findByRole('heading', { name: 'Spelaren' })).closest('article')!
    expect(within(playing).getByText('Counter-Strike 2')).toBeInTheDocument()
    expect(within(playing).getByLabelText('Spelar Counter-Strike 2')).toBeInTheDocument()

    const awake = screen.getByRole('heading', { name: 'Vaken' }).closest('article')!
    expect(within(awake).getByLabelText('Online')).toBeInTheDocument()

    const away = screen.getByRole('heading', { name: 'Borta' }).closest('article')!
    expect(within(away).getByLabelText('Offline')).toBeInTheDocument()
  })

  it('renders the roster even when presence is unavailable', async () => {
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([
      { steamid64: '1', personaName: 'Spelaren', avatarUrl: null, discordName: null , wotNickname: null},
    ])
    vi.spyOn(api, 'fetchPresence').mockResolvedValue({})

    const { Roster } = await import('./sections')
    render(<Roster />)

    expect(await screen.findByRole('heading', { name: 'Spelaren' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Online')).not.toBeInTheDocument()
  })

  it('shows an avatar image when Steam provides one', async () => {
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([
      {
        steamid64: '76561198053832683',
        personaName: '[BVS] #Mag',
        avatarUrl: 'https://avatars.example/mag.jpg',
        discordName: null, wotNickname: null,
      },
    ])

    const { Roster } = await import('./sections')
    render(<Roster />)

    const img = await screen.findByRole('img', { name: '[BVS] #Mag' })
    expect(img).toHaveAttribute('src', 'https://avatars.example/mag.jpg')
  })
})
