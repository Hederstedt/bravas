export const STEAM_LOGIN_URL = '/api/auth/steam/login'

export interface RosterMember {
  steamid64: string
  personaName: string
  avatarUrl: string | null
  discordName: string | null
  wotNickname: string | null
}

export const WOT_LOGIN_URL = '/api/members/wot/login'

// Sessionen är en signerad kaka och säger bara vem du är. Att du är *med* är
// en separat fråga — en sökande har en giltig kaka men ingen rad i rostern —
// och admin är en tredje, som servern avgör mot sin egen lista. Frontenden
// använder flaggorna för att veta vad den ska visa; servern gatear ändå
// oberoende av vad som ritas.
export interface Session {
  steamid64: string
  isMember: boolean
  isAdmin: boolean
}

export type PresenceStatus = 'offline' | 'online' | 'in-game'

export interface Presence {
  status: PresenceStatus
  game: string | null
}

export type PresenceMap = Record<string, Presence>

export interface SiteConfig {
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
  // Bara ifyllt för den som länkat World of Tanks — se server/src/playerCards.ts.
  wotAttributes: CardAttribute[]
  comments: string[]
  // Inte betygshärlett — dekoreras på i server/src/statsService.ts mot den
  // regerande Månadens BVS:are. Kalla det inte en titel: "position" äger det
  // ordet på kortet (KAPTEN, GENERAL).
  memberOfMonth: boolean
}

// Most call sites just want a sensible empty value when the API is down and
// don't care why. A few (the roster, the stats section) need to tell "the API
// answered with nothing" apart from "the API didn't answer at all" — an empty
// array means both to getJson, and that's exactly what let an outage look
// like an ordinary quiet day with nobody logged in yet.
export type ApiFetch<T> = { ok: true; data: T } | { ok: false }

async function getJsonResult<T>(path: string): Promise<ApiFetch<T>> {
  try {
    const res = await fetch(path, { credentials: 'same-origin' })
    if (!res.ok) return { ok: false }
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false }
  }
}

// The site is a static page that stays up even if the API is down, so every
// call degrades to a sensible empty value rather than throwing at the caller.
async function getJson<T>(path: string): Promise<T | null> {
  const result = await getJsonResult<T>(path)
  return result.ok ? result.data : null
}

export async function fetchMembers(): Promise<RosterMember[]> {
  const data = await getJson<{ members: RosterMember[] }>('/api/members')
  return data?.members ?? []
}

export async function fetchMembersResult(): Promise<ApiFetch<RosterMember[]>> {
  const result = await getJsonResult<{ members: RosterMember[] }>('/api/members')
  return result.ok ? { ok: true, data: result.data.members } : result
}

// The endpoint answers 200 either way — an anonymous visitor is a normal
// result, not a failed request — so the logged-out case is a flag in the body.
export async function fetchSession(): Promise<Session | null> {
  const data = await getJson<{
    authenticated: boolean
    steamid64?: string
    isMember?: boolean
    isAdmin?: boolean
  }>('/api/auth/me')
  if (!data?.authenticated || !data.steamid64) return null
  return {
    steamid64: data.steamid64,
    isMember: data.isMember === true,
    isAdmin: data.isAdmin === true,
  }
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

export async function fetchHighlightsResult(): Promise<ApiFetch<Highlights>> {
  return await getJsonResult<Highlights>('/api/stats/highlights')
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
  // Vem som skickat in ett citat visas aldrig — väggen ska kunna läsas utan att
  // det syns vem som tyckte vad. Den här flaggan berättar bara för dig vilka
  // som är dina, så raderingsknappen hamnar på rätt kort.
  mine: boolean
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

// Servern kan bara rensa kakorna — sessionen är signerad och stateless, det
// finns ingen rad att återkalla. Misslyckas anropet är false det enda vi vet,
// och anroparen får säga det med ett eget besked.
export async function logout(): Promise<boolean> {
  return (await send<Record<string, never>>('/api/auth/logout', 'POST')) !== null
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

// Servern raderar bara citat som är dina — någon annans är omöjligt att ta bort
// och oskiljbart från ett som inte finns. Svaret är 204 utan kropp.
export async function deleteQuote(id: number): Promise<boolean> {
  return (await send<Record<string, never>>(`/api/quotes/${id}`, 'DELETE')) !== null
}

// Steam vet vad du heter i Steam, inte i Discorden. Kopplingen får därför
// skrivas in för hand och hamnar på ditt eget spelarkort.
export const MAX_DISCORD_NAME = 64

export async function linkDiscord(discordName: string): Promise<boolean> {
  const token = await csrfToken()
  if (!token) return false
  try {
    const res = await fetch('/api/members/link', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ discordName }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ---------- Ansökan och admin ----------

// Speglar MAX_APPLICATION_MESSAGE i server/src/applications.ts, så formuläret
// stoppar för lång text direkt i stället för att låta backend avvisa den.
export const MAX_APPLICATION_MESSAGE = 500

export type ApplicationStatus = 'pending' | 'approved' | 'rejected'

// Namn och avatar kommer från Steam vid ansökan, inte från formuläret — därför
// går det inte att ansöka i någon annans namn.
export interface Application {
  steamid64: string
  personaName: string
  avatarUrl: string | null
  message: string
  status: ApplicationStatus
  createdAt: number
}

// Vem sidan skulle ansöka som, och hur det gick förra gången. En sökande finns
// inte i /api/members — servern hämtar identiteten från Steam eller från den
// egna ansökan.
export interface MyApplication {
  status: ApplicationStatus | 'none'
  personaName: string
  avatarUrl: string | null
}

export async function fetchMyApplication(): Promise<MyApplication | null> {
  return await getJson<MyApplication>('/api/members/apply')
}

export async function applyForMembership(message: string): Promise<boolean> {
  const token = await csrfToken()
  if (!token) return false
  try {
    const res = await fetch('/api/members/apply', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ message }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchApplications(): Promise<Application[]> {
  const data = await getJson<{ applications: Application[] }>('/api/admin/applications')
  return data?.applications ?? []
}

// Admin-sidan visar medlemmarna bredvid ansökningarna. Egen endpoint i stället
// för publika /api/members: sidan är en vy, och BFF:en levererar den samlat.
export interface AdminMember {
  steamid64: string
  personaName: string
  avatarUrl: string | null
}

export async function fetchAdminMembers(): Promise<AdminMember[]> {
  const data = await getJson<{ members: AdminMember[] }>('/api/admin/members')
  return data?.members ?? []
}

// Godkännande skriver bara allowlisten — medlemsraden skapas när den godkände
// loggar in nästa gång, av samma kod som för alla andra.
export async function approveApplication(steamid64: string): Promise<boolean> {
  return (
    (await send<Record<string, never>>(
      `/api/admin/applications/${steamid64}/approve`,
      'POST',
    )) !== null
  )
}

export async function rejectApplication(steamid64: string): Promise<boolean> {
  return (
    (await send<Record<string, never>>(
      `/api/admin/applications/${steamid64}/reject`,
      'POST',
    )) !== null
  )
}

export async function removeMember(steamid64: string): Promise<boolean> {
  return (await send<Record<string, never>>(`/api/admin/members/${steamid64}`, 'DELETE')) !== null
}

// ---------- Månadens BVS:are ----------

export interface MonthStanding {
  steamid64: string
  personaName: string
  score: number
}

export interface MonthlyStatus {
  month: string
  // Fallande på poäng, alla medlemmar med — inte bara de aktiva, så var och
  // en ser var hen ligger.
  standings: MonthStanding[]
  lastMonth: (MonthStanding & { month: string }) | null
}

export async function fetchMonthlyStatus(): Promise<MonthlyStatus> {
  const empty: MonthlyStatus = { month: '', standings: [], lastMonth: null }
  return (await getJson<MonthlyStatus>('/api/stats/month')) ?? empty
}

export async function fetchPresence(): Promise<PresenceMap> {
  const data = await getJson<{ presence: PresenceMap }>('/api/presence')
  return data?.presence ?? {}
}

// serverName/password är null för en utloggad besökare eller någon utanför
// rostern — servern avgör det, inte klienten, se server/src/routes/valheim.ts.
export interface ValheimStatus {
  online: boolean
  players: number | null
  maxPlayers: number | null
  address: string
  // Skiljer utloggad från "serverns .env saknar namn/lösenord" — annars får en
  // inloggad medlem beskedet "logga in" och kan inte göra något åt det.
  signedIn: boolean
  serverName: string | null
  password: string | null
}

const VALHEIM_OFFLINE: ValheimStatus = {
  online: false,
  players: null,
  maxPlayers: null,
  address: '',
  signedIn: false,
  serverName: null,
  password: null,
}

export async function fetchValheimStatus(): Promise<ValheimStatus> {
  const data = await getJson<ValheimStatus>('/api/valheim/status')
  return data ?? VALHEIM_OFFLINE
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
  trainingLeft: number
  // Vad du lirat ihop sedan förra omgången, och vad det gav. Speglar
  // server/src/activity.ts — verklig speltid ger managerresurser, aldrig
  // ändrade spelarbetyg.
  activity: ActivityBonus
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
// Tvärspelspoäng: timmar i klanens spel sedan förra omgången, och de extra
// resurser de gav. Poolen är fryst och rörs aldrig — se docs/manager.md.
export interface ActivityBonus {
  hours: { cs2: number; other: number }
  training: number
  transfer: number
}

// Sluttabellen från förra säsongen, så att den inte försvinner spårlöst när
// serien tar slut och lobbyn tar över.
export interface FinishedSeason {
  name: string
  table: TableRow[]
  botTeamIds: number[]
}

export interface ManagerView {
  season: Season | null
  budget: number
  squadSize: number
  // Seriefas: trupperna är låsta och all förändring går via transfer.
  locked: boolean
  sellRate: number
  pool: PoolPlayer[]
  myTeam: ManagerTeam | null
  // Senast färdigspelade säsongen, satt bara när ingen säsong är igång — så
  // att lobbyn kan visa förra tabellen i stället för att allt ser raderat ut.
  lastFinished: FinishedSeason | null
  // manager är null för botlagen — serien fylls på med datorstyrt motstånd så
  // att den som är först in kan spela en hel säsong, se server/src/bots.ts.
  teams: { id: number; name: string; manager: string | null; bot: boolean }[]
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
  home: { id: number; name: string }
  away: { id: number; name: string }
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

// Speglar server/src/training.ts — kurvan visas i gränssnittet innan passet
// skickas, servern räknar själv och har sista ordet.
export const TRAINING_CAP = 90

export function trainingGain(rating: number): number {
  return Math.min(6, Math.max(1, Math.round((TRAINING_CAP - rating) / 8)))
}

export async function trainPlayer(player: string, attr: string): Promise<ApiResult<ManagerView>> {
  return await sendJson<ManagerView>('/api/manager/training', 'POST', { player, attr })
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const data = await getJson<SiteConfig>('/api/config')
  return data ?? { discordInviteUrl: '' }
}

// Speglar server/src/discordWidget.ts. Widgeten hämtas av BFF:en, inte av
// webbläsaren — server-ID:t stannar i backend och sajten talar inte med
// Discord från klienten.
export type DiscordPresence = 'online' | 'idle' | 'dnd'

export interface DiscordMember {
  name: string
  status: DiscordPresence
  game: string | null
}

export interface DiscordStatus {
  // Falskt när widgeten är avstängd i Discord, server-ID saknas eller Discord
  // inte svarar. Då visas bara den vanliga inbjudningsknappen.
  available: boolean
  online: number
  members: DiscordMember[]
}

const DISCORD_UNAVAILABLE: DiscordStatus = { available: false, online: 0, members: [] }

export async function fetchDiscordStatus(): Promise<DiscordStatus> {
  return (await getJson<DiscordStatus>('/api/discord')) ?? DISCORD_UNAVAILABLE
}
