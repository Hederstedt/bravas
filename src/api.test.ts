import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCards,
  fetchHighlightsResult,
  fetchManagerView,
  fetchMatchReport,
  fetchMembers,
  fetchMembersResult,
  fetchPresence,
  fetchSession,
  fetchSiteConfig,
  makeTransfer,
  playMatchday,
  saveSquad,
  STEAM_LOGIN_URL,
} from './api'

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

// The roster needs to tell "nobody has logged in yet" (a valid empty answer)
// apart from "the API didn't answer" (a failure) — fetchMembers alone
// collapses both into the same empty array, which is exactly what let a
// production outage look like an ordinary quiet day.
describe('fetchMembersResult', () => {
  it('reports ok with the roster on success, even when it is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ members: [] }))
    await expect(fetchMembersResult()).resolves.toEqual({ ok: true, data: [] })
  })

  it('reports not ok when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(fetchMembersResult()).resolves.toEqual({ ok: false })
  })

  it('reports not ok on a server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'boom' }, 500))
    await expect(fetchMembersResult()).resolves.toEqual({ ok: false })
  })
})

describe('fetchSession', () => {
  it('returns the session when logged in', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        authenticated: true,
        steamid64: '76561198060166361',
        isMember: true,
        isAdmin: false,
      }),
    )
    await expect(fetchSession()).resolves.toEqual({
      steamid64: '76561198060166361',
      isMember: true,
      isAdmin: false,
    })
  })

  // En sökande har en giltig kaka men ingen rad i rostern. Missar frontenden
  // skillnaden visar den kontosidan för någon som inte är med.
  it('marks an applicant as signed in but not a member', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ authenticated: true, steamid64: '76561190000000000', isMember: false }),
    )
    await expect(fetchSession()).resolves.toEqual({
      steamid64: '76561190000000000',
      isMember: false,
      isAdmin: false,
    })
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
  it('returns the Discord invite', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ discordInviteUrl: 'https://discord.gg/abc' }),
    )
    await expect(fetchSiteConfig()).resolves.toEqual({
      discordInviteUrl: 'https://discord.gg/abc',
    })
  })

  it('falls back to empty config when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(fetchSiteConfig()).resolves.toEqual({ discordInviteUrl: '', wowLinkEnabled: false })
  })
})

describe('fetchCards', () => {
  const card = {
    steamid64: '76561198053832683',
    personaName: '[BVS] #Mag',
    hasStats: true,
    overall: 74,
    tier: 'silver',
    position: 'AWP',
    attributes: [{ key: 'SIK', label: 'Sikte', rating: 80 }],
    comments: ['Smyger runt mest.'],
  }

  it('returns the lineup from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ cards: [card] }))
    await expect(fetchCards()).resolves.toEqual([card])
  })

  it('returns an empty lineup when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(fetchCards()).resolves.toEqual([])
  })

  it('returns an empty lineup when the response has no cards', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ memberCount: 0 }))
    await expect(fetchCards()).resolves.toEqual([])
  })
})

describe('fetchHighlightsResult', () => {
  it('reports ok with the highlights on success, even when there are none yet', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ highlights: [], memberCount: 0, withStats: 0 }),
    )
    await expect(fetchHighlightsResult()).resolves.toEqual({
      ok: true,
      data: { highlights: [], memberCount: 0, withStats: 0 },
    })
  })

  it('reports not ok when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(fetchHighlightsResult()).resolves.toEqual({ ok: false })
  })
})

// Mutationerna hämtar först en CSRF-token och skickar sedan själva anropet.
// mockImplementation i stället för mockResolvedValue — en Response-kropp går
// bara att läsa en gång, så varje anrop behöver en egen instans.
function mockApiFetch(respond: (url: string) => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    if (url.includes('/api/auth/csrf-token')) {
      return Promise.resolve(jsonResponse({ csrfToken: 'token' }))
    }
    return Promise.resolve(respond(url))
  })
}

describe('fetchManagerView', () => {
  const emptyView = {
    season: null,
    budget: 20000,
    squadSize: 5,
    pool: [],
    myTeam: null,
    teams: [],
    table: [],
    fixtures: [],
  }

  it('returns the view from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(emptyView))
    await expect(fetchManagerView()).resolves.toEqual(emptyView)
  })

  // null betyder att API:et är nere — en giltig vy utan säsong har season: null
  // men är inte null i sig.
  it('returns null when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(fetchManagerView()).resolves.toBeNull()
  })
})

describe('fetchMatchReport', () => {
  it('returns null when the report does not exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'not_found' }, 404))
    await expect(fetchMatchReport(999)).resolves.toBeNull()
  })
})

describe('saveSquad', () => {
  it('returns the fresh view on success', async () => {
    const view = { season: { id: 1 }, pool: [] }
    mockApiFetch(() => jsonResponse(view))

    const result = await saveSquad(['m:1', 'g:2'])
    expect(result).toEqual({ ok: true, data: view })
  })

  // Serverns svenska felmeddelande är skrivet för managern och ska hela vägen
  // fram till gränssnittet — inte sväljas till null.
  it('surfaces the error body on a validation failure', async () => {
    mockApiFetch(() =>
      jsonResponse({ error: 'invalid_squad', message: 'Budgeten räcker inte.' }, 400),
    )

    const result = await saveSquad(['m:1'])
    expect(result).toEqual({ ok: false, error: 'invalid_squad', message: 'Budgeten räcker inte.' })
  })

  it('fails without a CSRF token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'nope' }, 401))
    const result = await saveSquad(['m:1'])
    expect(result).toEqual({ ok: false, error: 'no_csrf', message: null })
  })

  it('fails softly when the network is down', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('/api/auth/csrf-token')) {
        return Promise.resolve(jsonResponse({ csrfToken: 'token' }))
      }
      return Promise.reject(new Error('offline'))
    })

    const result = await saveSquad(['m:1'])
    expect(result).toEqual({ ok: false, error: 'network', message: null })
  })
})

describe('makeTransfer', () => {
  it('returns the fresh view on a done deal', async () => {
    const fresh = { season: { id: 1 }, locked: true }
    mockApiFetch(() => jsonResponse(fresh))
    await expect(makeTransfer('p:a', 'p:b')).resolves.toEqual({ ok: true, data: fresh })
  })

  it('surfaces the server verdict on a refused deal', async () => {
    mockApiFetch(() =>
      jsonResponse({ error: 'no_transfers_left', message: 'Omgångens transfer är redan gjord.' }, 409),
    )
    await expect(makeTransfer('p:a', 'p:b')).resolves.toEqual({
      ok: false,
      error: 'no_transfers_left',
      message: 'Omgångens transfer är redan gjord.',
    })
  })
})

describe('playMatchday', () => {
  it('returns the played matchday', async () => {
    mockApiFetch(() => jsonResponse({ matchday: 3, played: 2 }, 201))
    await expect(playMatchday()).resolves.toEqual({ ok: true, data: { matchday: 3, played: 2 } })
  })

  it('surfaces season_finished as an error code', async () => {
    mockApiFetch(() => jsonResponse({ error: 'season_finished' }, 409))
    await expect(playMatchday()).resolves.toEqual({
      ok: false,
      error: 'season_finished',
      message: null,
    })
  })
})
