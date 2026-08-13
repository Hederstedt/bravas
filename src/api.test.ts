import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMembers, fetchPresence, fetchSession, fetchSiteConfig, STEAM_LOGIN_URL } from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('STEAM_LOGIN_URL', () => {
  it('points at the API login route', () => {
    expect(STEAM_LOGIN_URL).toBe('/api/auth/steam/login')
  })
})

describe('fetchMembers', () => {
  it('returns the roster from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        members: [
          {
            steamid64: '76561198053832683',
            personaName: '[BVS] #Mag',
            avatarUrl: 'https://avatars.example/mag.jpg',
            discordName: 'mag',
          },
        ],
      }),
    )

    await expect(fetchMembers()).resolves.toEqual([
      {
        steamid64: '76561198053832683',
        personaName: '[BVS] #Mag',
        avatarUrl: 'https://avatars.example/mag.jpg',
        discordName: 'mag',
      },
    ])
  })

  it('returns an empty roster when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(fetchMembers()).resolves.toEqual([])
  })

  it('returns an empty roster on a server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'boom' }, 500))
    await expect(fetchMembers()).resolves.toEqual([])
  })
})

describe('fetchSession', () => {
  it('returns the session when logged in', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ authenticated: true, steamid64: '76561198060166361' }),
    )
    await expect(fetchSession()).resolves.toEqual({ steamid64: '76561198060166361' })
  })

  // Being logged out is a 200 with authenticated:false — the endpoint is a
  // probe, so an anonymous visitor never sees a failed request in the console.
  it('returns null when not logged in', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ authenticated: false }))
    await expect(fetchSession()).resolves.toBeNull()
  })

  it('returns null when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(fetchSession()).resolves.toBeNull()
  })

  it('returns null on a server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'boom' }, 500))
    await expect(fetchSession()).resolves.toBeNull()
  })
})

describe('fetchPresence', () => {
  it('returns the presence map from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        presence: {
          '76561198053832683': { status: 'in-game', game: 'Counter-Strike 2' },
        },
      }),
    )

    await expect(fetchPresence()).resolves.toEqual({
      '76561198053832683': { status: 'in-game', game: 'Counter-Strike 2' },
    })
  })

  it('returns an empty map when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(fetchPresence()).resolves.toEqual({})
  })
})

describe('fetchSiteConfig', () => {
  it('returns the Discord config', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ discordServerId: '323523542312419348', discordInviteUrl: 'https://discord.gg/abc' }),
    )
    await expect(fetchSiteConfig()).resolves.toEqual({
      discordServerId: '323523542312419348',
      discordInviteUrl: 'https://discord.gg/abc',
    })
  })

  it('falls back to empty config when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(fetchSiteConfig()).resolves.toEqual({ discordServerId: '', discordInviteUrl: '' })
  })
})
