export const STEAM_LOGIN_URL = '/api/auth/steam/login'

export interface RosterMember {
  steamid64: string
  personaName: string
  avatarUrl: string | null
  discordName: string | null
}

export interface Session {
  steamid64: string
}

export type PresenceStatus = 'offline' | 'online' | 'in-game'

export interface Presence {
  status: PresenceStatus
  game: string | null
}

export type PresenceMap = Record<string, Presence>

export interface SiteConfig {
  discordServerId: string
  discordInviteUrl: string
}

// The site is a static page that stays up even if the API is down, so every
// call degrades to a sensible empty value rather than throwing at the caller.
async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { credentials: 'same-origin' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchMembers(): Promise<RosterMember[]> {
  const data = await getJson<{ members: RosterMember[] }>('/api/members')
  return data?.members ?? []
}

// The endpoint answers 200 either way — an anonymous visitor is a normal
// result, not a failed request — so the logged-out case is a flag in the body.
export async function fetchSession(): Promise<Session | null> {
  const data = await getJson<{ authenticated: boolean; steamid64?: string }>('/api/auth/me')
  if (!data?.authenticated || !data.steamid64) return null
  return { steamid64: data.steamid64 }
}

export interface StatHighlight {
  gameId: string
  gameTitle: string
  label: string
  value: string
  holder: string
  detail: string
}

export interface Highlights {
  highlights: StatHighlight[]
  memberCount: number
  withStats: number
}

export async function fetchHighlights(): Promise<Highlights> {
  const data = await getJson<Highlights>('/api/stats/highlights')
  return data ?? { highlights: [], memberCount: 0, withStats: 0 }
}

// Speglar serverns gränser så formuläret stoppar för lång text direkt i stället
// för att låta backend avvisa den.
export const MAX_QUOTE_LENGTH = 280
export const MAX_SAID_BY_LENGTH = 64

export interface Quote {
  id: number
  text: string
  saidBy: string
  createdAt: number
  votes: number
}

export async function fetchQuotes(): Promise<Quote[]> {
  const data = await getJson<{ quotes: Quote[] }>('/api/quotes')
  return data?.quotes ?? []
}

// Skrivningar kräver en CSRF-token som bara inloggade medlemmar kan hämta ut.
async function csrfToken(): Promise<string | null> {
  const data = await getJson<{ csrfToken: string }>('/api/auth/csrf-token')
  return data?.csrfToken ?? null
}

async function send<T>(path: string, method: 'POST' | 'DELETE'): Promise<T | null> {
  const token = await csrfToken()
  if (!token) return null
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'x-csrf-token': token },
    })
    if (!res.ok) return null
    return res.status === 204 ? ({} as T) : ((await res.json()) as T)
  } catch {
    return null
  }
}

export async function addQuote(text: string, saidBy: string): Promise<Quote | null> {
  const token = await csrfToken()
  if (!token) return null
  try {
    const res = await fetch('/api/quotes', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ text, saidBy }),
    })
    if (!res.ok) return null
    return (await res.json()) as Quote
  } catch {
    return null
  }
}

export async function toggleQuoteVote(id: number): Promise<{ votes: number; voted: boolean } | null> {
  return await send<{ votes: number; voted: boolean }>(`/api/quotes/${id}/vote`, 'POST')
}

export async function fetchPresence(): Promise<PresenceMap> {
  const data = await getJson<{ presence: PresenceMap }>('/api/presence')
  return data?.presence ?? {}
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const data = await getJson<SiteConfig>('/api/config')
  return data ?? { discordServerId: '', discordInviteUrl: '' }
}
