import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SteamLogin } from './auth'
import * as api from '../api'

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
        discordName: null,
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

describe('Roster with live data', () => {
  it('shows real members once the API returns them', async () => {
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([
      {
        steamid64: '76561198053832683',
        personaName: '[BVS] #Mag',
        avatarUrl: 'https://avatars.example/mag.jpg',
        discordName: 'mag',
      },
      {
        steamid64: '76561197963771177',
        personaName: '[BVS] g0nza',
        avatarUrl: null,
        discordName: null,
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

  it('shows an avatar image when Steam provides one', async () => {
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([
      {
        steamid64: '76561198053832683',
        personaName: '[BVS] #Mag',
        avatarUrl: 'https://avatars.example/mag.jpg',
        discordName: null,
      },
    ])

    const { Roster } = await import('./sections')
    render(<Roster />)

    const img = await screen.findByRole('img', { name: '[BVS] #Mag' })
    expect(img).toHaveAttribute('src', 'https://avatars.example/mag.jpg')
  })
})
