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

export async function fetchSession(): Promise<Session | null> {
  return await getJson<Session>('/api/auth/me')
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const data = await getJson<SiteConfig>('/api/config')
  return data ?? { discordServerId: '', discordInviteUrl: '' }
}
