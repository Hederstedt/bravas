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

export type CardTier = 'ikon' | 'guld' | 'silver' | 'brons' | 'okänd'

export interface CardAttribute {
  key: string
  label: string
  description: string
  rating: number
}

// Speglar server/src/cs2Cards.ts. Betygen är redan uträknade där — frontenden
// räknar inte om något, den ritar bara kortet.
export interface PlayerCard {
  steamid64: string
  personaName: string
  hasStats: boolean
  overall: number
  tier: CardTier
  position: string
  attributes: CardAttribute[]
  comments: string[]
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

export interface Standing {
  name: string
  value: string
}

export interface StatHighlight {
  gameId: string
  gameTitle: string
  label: string
  value: string
  holder: string
  detail: string
  standings: Standing[]
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

export async function fetchCards(): Promise<PlayerCard[]> {
  const data = await getJson<{ cards: PlayerCard[] }>('/api/stats/cards')
  return data?.cards ?? []
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

// ---------- CS Manager ----------

// Speglar server/src/cs2Cards.ts och matchSim.ts.
export type ManagerAttrKey = 'SIK' | 'SKA' | 'FRA' | 'TÅL' | 'NYT' | 'TID'
export type ManagerRatings = Record<ManagerAttrKey, number>

// Speglar server/src/seasonService.ts (PublicPlayer).
export interface PoolPlayer {
  key: string
  source: string
  name: string
  ratings: ManagerRatings
  value: number
  takenBy: string | null
}

// Speglar server/src/db.ts (SeasonRow).
export interface Season {
  id: number
  name: string
  starts_at: number
  ends_at: number
  status: string
}

export interface ManagerTeam {
  id: number
  name: string
  squad: PoolPlayer[]
  spent: number
  // Lagkassan: det som blev över av budgeten i byggfasen, sedan rör den sig
  // bara genom transfermarknaden.
  funds: number
  transfersLeft: number
}

// Speglar server/src/league.ts.
export interface TableRow {
  teamId: number
  name: string
  played: number
  won: number
  drawn: number
  lost: number
  roundsFor: number
  roundsAgainst: number
  diff: number
  points: number
}

// Speglar server/src/leagueService.ts.
export interface PublicFixture {
  id: number
  matchday: number
  home: { id: number; name: string }
  away: { id: number; name: string }
  played: boolean
  homeScore: number | null
  awayScore: number | null
}

// Speglar server/src/seasonService.ts (SeasonView). season: null är ett giltigt
// svar — ingen säsong igång — och skiljer sig från att API:et är nere (null
// från fetchManagerView).
export interface ManagerView {
  season: Season | null
  budget: number
  squadSize: number
  // Seriefas: trupperna är låsta och all förändring går via transfer.
  locked: boolean
  sellRate: number
  pool: PoolPlayer[]
  myTeam: ManagerTeam | null
  teams: { id: number; name: string; manager: string }[]
  table: TableRow[]
  fixtures: PublicFixture[]
}

// Speglar server/src/matchSim.ts.
export interface PlayerLine {
  id: string
  name: string
  kills: number
  deaths: number
}

export interface RoundResult {
  round: number
  winner: 'home' | 'away'
  kills: { killerId: string; victimId: string }[]
}

// Speglar svaret från GET /api/manager/match/:id — rapporten sparades när
// matchen spelades och simuleras aldrig om.
export interface MatchReport {
  id: number
  matchday: number
  homeScore: number | null
  awayScore: number | null
  report: {
    homeScore: number
    awayScore: number
    winner: 'home' | 'away' | 'draw'
    rounds: RoundResult[]
    scoreboard: { home: PlayerLine[]; away: PlayerLine[] }
    mvp: PlayerLine | null
    walkover?: string
  }
}

export interface MatchdayResult {
  matchday: number
  played: number
}

// Speglar serverns gräns för lag- och säsongsnamn.
export const MAX_TEAM_NAME = 40

export async function fetchManagerView(): Promise<ManagerView | null> {
  return await getJson<ManagerView>('/api/manager')
}

export async function fetchMatchReport(id: number): Promise<MatchReport | null> {
  return await getJson<MatchReport>(`/api/manager/match/${id}`)
}

// Managerspelets skrivningar skiljer sig från resten av sajten: servern svarar
// med läsbara svenska felmeddelanden som ska rakt ut i gränssnittet, så här
// räcker det inte att svälja felkroppen till null som send() gör.
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; message: string | null }

async function sendJson<T>(path: string, method: 'POST' | 'PUT', body?: object): Promise<ApiResult<T>> {
  const token = await csrfToken()
  if (!token) return { ok: false, error: 'no_csrf', message: null }
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      let error = `http_${res.status}`
      let message: string | null = null
      try {
        const data = (await res.json()) as { error?: string; message?: string }
        error = data.error ?? error
        message = data.message ?? null
      } catch {
        // En felkropp utan JSON är fortfarande ett fel — statuskoden får tala.
      }
      return { ok: false, error, message }
    }
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false, error: 'network', message: null }
  }
}

export async function startSeason(name: string): Promise<ApiResult<{ season: Season }>> {
  return await sendJson<{ season: Season }>('/api/manager/season', 'POST', { name })
}

export async function createTeam(name: string): Promise<ApiResult<{ team: { id: number; name: string } }>> {
  return await sendJson<{ team: { id: number; name: string } }>('/api/manager/team', 'POST', { name })
}

// Lyckat svar är hela den färska managervyn — den sätts rakt in i state, ingen
// extra omhämtning behövs.
export async function saveSquad(players: string[]): Promise<ApiResult<ManagerView>> {
  return await sendJson<ManagerView>('/api/manager/squad', 'PUT', { players })
}

export async function playMatchday(): Promise<ApiResult<MatchdayResult>> {
  return await sendJson<MatchdayResult>('/api/manager/matchday', 'POST')
}

// En affär: sälj en truppgubbe till poolen och köp en ledig, atomiskt. Lyckat
// svar är hela den färska managervyn, som saveSquad.
export async function makeTransfer(sell: string, buy: string): Promise<ApiResult<ManagerView>> {
  return await sendJson<ManagerView>('/api/manager/transfer', 'POST', { sell, buy })
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const data = await getJson<SiteConfig>('/api/config')
  return data ?? { discordServerId: '', discordInviteUrl: '' }
}
