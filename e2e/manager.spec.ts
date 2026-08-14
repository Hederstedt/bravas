import { test, expect, type Page } from '@playwright/test'

// Manager-flödet mot en statefull stub av API:et: en state-variabel i testet
// muteras av POST/PUT-stubbarna, precis som databasen hade gjort. CI ska inte
// bero på driften, och svaren blir förutsägbara.

interface StubState {
  seasonName: string | null
  teamName: string | null
  squad: string[]
  // Antal spelade omgångar (0–2). Från första spelade omgången är truppen låst
  // och transferfönstret öppet.
  played: number
  funds: number
  transfersUsed: number
}

const POOL = [
  { key: 'p:a', name: 'Stjärnan', value: 9000 },
  { key: 'p:b', name: 'Bärarn', value: 6000 },
  { key: 'p:c', name: 'Cyklisten', value: 5000 },
  { key: 'p:d', name: 'Dundret', value: 4000 },
  { key: 'p:e', name: 'Enstöringen', value: 3000 },
  { key: 'p:f', name: 'Fyllnadsgubben', value: 2000 },
  { key: 'p:g', name: 'Gnällspiken', value: 1500 },
]

const RATINGS = { SIK: 70, SKA: 65, FRA: 60, TÅL: 55, NYT: 50, TID: 45 }
const BUDGET = 20_000
const MATCHDAYS = 2

function view(state: StubState) {
  if (!state.seasonName) {
    return {
      season: null,
      budget: BUDGET,
      squadSize: 5,
      locked: false,
      sellRate: 0.7,
      pool: [],
      myTeam: null,
      teams: [],
      table: [],
      fixtures: [],
    }
  }

  const pool = POOL.map((p) => ({
    ...p,
    source: 'generated',
    ratings: RATINGS,
    takenBy: p.key === 'p:a' ? 'Motståndarna' : state.squad.includes(p.key) ? state.teamName : null,
  }))
  const squad = pool.filter((p) => state.squad.includes(p.key))
  const spent = squad.reduce((s, p) => s + p.value, 0)

  const windowOpen = state.played > 0 && state.played < MATCHDAYS
  const teams = [{ id: 1, name: 'Motståndarna', manager: '76561198000000009' }]
  if (state.teamName) teams.push({ id: 2, name: state.teamName, manager: '76561198000000001' })

  const tableRow = (id: number, name: string, won: boolean) => ({
    teamId: id,
    name,
    played: state.played,
    won: won ? state.played : 0,
    drawn: 0,
    lost: won ? 0 : state.played,
    roundsFor: won ? 13 * state.played : 5 * state.played,
    roundsAgainst: won ? 5 * state.played : 13 * state.played,
    diff: (won ? 8 : -8) * state.played,
    points: won ? 3 * state.played : 0,
  })

  const fixture = (id: number, matchday: number) => ({
    id,
    matchday,
    home: { id: 2, name: state.teamName ?? 'Motståndarna' },
    away: { id: 1, name: 'Motståndarna' },
    played: state.played >= matchday,
    homeScore: state.played >= matchday ? 13 : null,
    awayScore: state.played >= matchday ? 5 : null,
  })

  return {
    season: { id: 1, name: state.seasonName, starts_at: 1, ends_at: 2, status: 'active' },
    budget: BUDGET,
    squadSize: 5,
    locked: state.played > 0,
    sellRate: 0.7,
    pool,
    myTeam: state.teamName
      ? {
          id: 2,
          name: state.teamName,
          squad,
          spent,
          funds: state.funds,
          transfersLeft: windowOpen ? Math.max(0, 1 - state.transfersUsed) : 0,
        }
      : null,
    teams,
    table: state.teamName
      ? [tableRow(2, state.teamName, true), tableRow(1, 'Motståndarna', false)]
      : [tableRow(1, 'Motståndarna', false)],
    fixtures: state.teamName ? [fixture(1, 1), fixture(2, 2)] : [],
  }
}

const REPORT = {
  id: 1,
  matchday: 1,
  homeScore: 13,
  awayScore: 5,
  report: {
    homeScore: 13,
    awayScore: 5,
    winner: 'home',
    rounds: [
      { round: 1, winner: 'home', kills: [] },
      { round: 2, winner: 'away', kills: [] },
    ],
    scoreboard: {
      home: [{ id: 'p:b', name: 'Bärarn', kills: 19, deaths: 12 }],
      away: [{ id: 'p:a', name: 'Stjärnan', kills: 12, deaths: 19 }],
    },
    mvp: { id: 'p:b', name: 'Bärarn', kills: 19, deaths: 12 },
  },
}

async function stubApi(page: Page, state: StubState, { signedIn = true } = {}) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: signedIn
        ? { authenticated: true, steamid64: '76561198000000001' }
        : { authenticated: false },
    }),
  )
  await page.route('**/api/auth/csrf-token', (route) =>
    route.fulfill({ json: { csrfToken: 'e2e-token' } }),
  )
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { discordServerId: '', discordInviteUrl: '' } }),
  )
  await page.route('**/api/events', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: ': ansluten\n\n',
    }),
  )

  await page.route('**/api/manager', (route) => route.fulfill({ json: view(state) }))
  await page.route('**/api/manager/season', (route) => {
    const name = (route.request().postDataJSON() as { name: string }).name
    state.seasonName = state.seasonName ?? name
    return route.fulfill({ status: 201, json: { season: view(state).season } })
  })
  await page.route('**/api/manager/team', (route) => {
    state.teamName = (route.request().postDataJSON() as { name: string }).name
    return route.fulfill({ status: 201, json: { team: { id: 2, name: state.teamName } } })
  })
  await page.route('**/api/manager/squad', (route) => {
    const players = (route.request().postDataJSON() as { players: string[] }).players
    const cost = POOL.filter((p) => players.includes(p.key)).reduce((s, p) => s + p.value, 0)
    if (cost > BUDGET) {
      return route.fulfill({
        status: 400,
        json: { error: 'invalid_squad', message: `Laget kostar ${cost} men budgeten är ${BUDGET}.` },
      })
    }
    state.squad = players
    state.funds = BUDGET - cost
    return route.fulfill({ json: view(state) })
  })
  await page.route('**/api/manager/transfer', (route) => {
    const { sell, buy } = route.request().postDataJSON() as { sell: string; buy: string }
    const selling = POOL.find((p) => p.key === sell)!
    const buying = POOL.find((p) => p.key === buy)!
    state.squad = [...state.squad.filter((k) => k !== sell), buy]
    state.funds = state.funds + Math.floor(selling.value * 0.7) - buying.value
    state.transfersUsed += 1
    return route.fulfill({ json: view(state) })
  })
  await page.route('**/api/manager/matchday', (route) => {
    state.played += 1
    return route.fulfill({ status: 201, json: { matchday: state.played, played: 1 } })
  })
  await page.route('**/api/manager/match/1', (route) => route.fulfill({ json: REPORT }))
}

function freshState(overrides: Partial<StubState> = {}): StubState {
  return {
    seasonName: null,
    teamName: null,
    squad: [],
    played: 0,
    funds: BUDGET,
    transfersUsed: 0,
    ...overrides,
  }
}

async function pick(page: Page, name: string) {
  await page.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Välj' }).click()
}

test('a manager plays through the whole flow', async ({ page }) => {
  const state = freshState()
  await stubApi(page, state)

  await page.goto('/manager')

  // Starta säsongen.
  await page.getByLabel(/Vad ska säsongen heta/).fill('Garageligan')
  await page.getByRole('button', { name: 'Starta säsongen' }).click()

  // Döp laget.
  await page.getByLabel('Lagnamn').fill('FC Träklubban')
  await page.getByRole('button', { name: 'Skapa laget' }).click()

  // Bygg truppen: fem gubbar för 19 500 — 500 kvar i kassan till marknaden.
  await expect(page.getByRole('heading', { name: 'FC Träklubban' })).toBeVisible()
  for (const name of ['Bärarn', 'Cyklisten', 'Dundret', 'Enstöringen', 'Gnällspiken']) {
    await pick(page, name)
  }
  await page.getByRole('button', { name: 'Skriv på truppen' }).click()
  await expect(page.getByText(/Trupp: 5\/5/)).toBeVisible()

  // Spela omgången — truppen låses och marknaden öppnar.
  await page.getByRole('button', { name: 'Spela nästa omgång' }).click()
  await expect(page.getByText(/Kassa:/)).toBeVisible()

  // En affär: sälj Enstöringen (ger 2 100), köp Fyllnadsgubben (kostar 2 000).
  await page
    .getByText('Enstöringen')
    .locator('xpath=ancestor::li')
    .getByRole('button', { name: 'Sälj' })
    .click()
  await page
    .getByRole('row', { name: /Fyllnadsgubben/ })
    .getByRole('button', { name: 'Köp' })
    .click()
  await expect(page.getByText(/kassa efter/)).toBeVisible()
  await page.getByRole('button', { name: 'Genomför affären' }).click()
  await expect(page.getByText(/omgångens affär är gjord/)).toBeVisible()

  // Läs referatet.
  const scoreLink = page.getByRole('link', { name: '13–5' }).first()
  await expect(scoreLink).toBeVisible()
  await scoreLink.click()

  await expect(page.getByRole('heading', { name: 'Matchreferat' })).toBeVisible()
  await expect(page.getByText('Matchens gubbe:')).toBeVisible()
})

test('anonymous visitors can look but not touch', async ({ page }) => {
  const state = freshState({ seasonName: 'Garageligan' })
  await stubApi(page, state, { signedIn: false })

  await page.goto('/manager')

  await expect(page.getByText('Garageligan')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Ligatabellen' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Spelarpoolen' })).toBeVisible()

  // Inga knappar för den som inte är inloggad — läsvyn är öppen, resten stängd.
  await expect(page.locator('#manager').getByRole('button')).toHaveCount(0)
})

// En delad referatlänk ska fungera som direktladdning — det är den här vägen
// som kräver try_files i nginx i drift.
test('a match report deep link loads on its own', async ({ page }) => {
  const state = freshState({
    seasonName: 'Garageligan',
    teamName: 'FC Träklubban',
    squad: ['p:b', 'p:c', 'p:d', 'p:e', 'p:f'],
    played: 1,
    funds: 0,
  })
  await stubApi(page, state)

  await page.goto('/manager/match/1')

  await expect(page.getByRole('heading', { name: 'Matchreferat' })).toBeVisible()
  await expect(page.getByText('13–5')).toBeVisible()
})

test("the server's verdict is shown when someone got there first", async ({ page }) => {
  const state = freshState({ seasonName: 'Garageligan', teamName: 'FC Träklubban' })
  await stubApi(page, state)

  // Stubben svarar som servern gör när en annan manager hann skriva på gubben
  // mellan valideringen och sparandet.
  await page.route('**/api/manager/squad', (route) =>
    route.fulfill({
      status: 400,
      json: { error: 'invalid_squad', message: 'Bärarn är redan skriven på ett annat lag.' },
    }),
  )

  await page.goto('/manager')

  for (const name of ['Bärarn', 'Cyklisten', 'Dundret', 'Enstöringen', 'Fyllnadsgubben']) {
    await pick(page, name)
  }
  await page.getByRole('button', { name: 'Skriv på truppen' }).click()

  await expect(page.getByText('Bärarn är redan skriven på ett annat lag.')).toBeVisible()
})
