import { test, expect, type Page } from '@playwright/test'

// Manager-flödet mot en statefull stub av API:et: en view-variabel i testet
// muteras av POST/PUT-stubbarna, precis som databasen hade gjort. CI ska inte
// bero på driften, och svaren blir förutsägbara.

interface StubState {
  seasonName: string | null
  teamName: string | null
  squad: string[]
  played: boolean
}

const POOL = [
  { key: 'p:a', name: 'Stjärnan', value: 9000 },
  { key: 'p:b', name: 'Bärarn', value: 6000 },
  { key: 'p:c', name: 'Cyklisten', value: 5000 },
  { key: 'p:d', name: 'Dundret', value: 4000 },
  { key: 'p:e', name: 'Enstöringen', value: 3000 },
  { key: 'p:f', name: 'Fyllnadsgubben', value: 2000 },
]

const RATINGS = { SIK: 70, SKA: 65, FRA: 60, TÅL: 55, NYT: 50, TID: 45 }
const BUDGET = 20_000

function view(state: StubState) {
  if (!state.seasonName) {
    return {
      season: null,
      budget: BUDGET,
      squadSize: 5,
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

  const teams = [{ id: 1, name: 'Motståndarna', manager: '76561198000000009' }]
  if (state.teamName) teams.push({ id: 2, name: state.teamName, manager: '76561198000000001' })

  const tableRow = (id: number, name: string, won: boolean) => ({
    teamId: id,
    name,
    played: state.played ? 1 : 0,
    won: state.played && won ? 1 : 0,
    drawn: 0,
    lost: state.played && !won ? 1 : 0,
    roundsFor: state.played ? (won ? 13 : 5) : 0,
    roundsAgainst: state.played ? (won ? 5 : 13) : 0,
    diff: state.played ? (won ? 8 : -8) : 0,
    points: state.played && won ? 3 : 0,
  })

  return {
    season: { id: 1, name: state.seasonName, starts_at: 1, ends_at: 2, status: 'active' },
    budget: BUDGET,
    squadSize: 5,
    pool,
    myTeam: state.teamName ? { id: 2, name: state.teamName, squad, spent } : null,
    teams,
    table: state.teamName
      ? [tableRow(2, state.teamName, true), tableRow(1, 'Motståndarna', false)]
      : [tableRow(1, 'Motståndarna', false)],
    fixtures: state.teamName
      ? [
          {
            id: 1,
            matchday: 1,
            home: { id: 2, name: state.teamName },
            away: { id: 1, name: 'Motståndarna' },
            played: state.played,
            homeScore: state.played ? 13 : null,
            awayScore: state.played ? 5 : null,
          },
        ]
      : [],
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
    return route.fulfill({ json: view(state) })
  })
  await page.route('**/api/manager/matchday', (route) => {
    state.played = true
    return route.fulfill({ status: 201, json: { matchday: 1, played: 1 } })
  })
  await page.route('**/api/manager/match/1', (route) => route.fulfill({ json: REPORT }))
}

async function pick(page: Page, name: string) {
  await page.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Välj' }).click()
}

test('a manager plays through the whole flow', async ({ page }) => {
  const state: StubState = { seasonName: null, teamName: null, squad: [], played: false }
  await stubApi(page, state)

  await page.goto('/manager')

  // Starta säsongen.
  await page.getByLabel(/Vad ska säsongen heta/).fill('Garageligan')
  await page.getByRole('button', { name: 'Starta säsongen' }).click()

  // Döp laget.
  await page.getByLabel('Lagnamn').fill('FC Träklubban')
  await page.getByRole('button', { name: 'Skapa laget' }).click()

  // Bygg truppen: fem gubbar för exakt 20 000.
  await expect(page.getByRole('heading', { name: 'FC Träklubban' })).toBeVisible()
  for (const name of ['Bärarn', 'Cyklisten', 'Dundret', 'Enstöringen', 'Fyllnadsgubben']) {
    await pick(page, name)
  }
  await page.getByRole('button', { name: 'Skriv på truppen' }).click()
  await expect(page.getByText(/Trupp: 5\/5/)).toBeVisible()

  // Spela omgången och läs referatet.
  await page.getByRole('button', { name: 'Spela nästa omgång' }).click()
  const scoreLink = page.getByRole('link', { name: '13–5' })
  await expect(scoreLink).toBeVisible()
  await scoreLink.click()

  await expect(page.getByRole('heading', { name: 'Matchreferat' })).toBeVisible()
  await expect(page.getByText('Matchens gubbe:')).toBeVisible()
  await expect(page.getByText('Bärarn').first()).toBeVisible()
})

test('anonymous visitors can look but not touch', async ({ page }) => {
  const state: StubState = {
    seasonName: 'Garageligan',
    teamName: null,
    squad: [],
    played: false,
  }
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
  const state: StubState = {
    seasonName: 'Garageligan',
    teamName: 'FC Träklubban',
    squad: ['p:b', 'p:c', 'p:d', 'p:e', 'p:f'],
    played: true,
  }
  await stubApi(page, state)

  await page.goto('/manager/match/1')

  await expect(page.getByRole('heading', { name: 'Matchreferat' })).toBeVisible()
  await expect(page.getByText('13–5')).toBeVisible()
})

test("the server's verdict is shown when someone got there first", async ({ page }) => {
  const state: StubState = {
    seasonName: 'Garageligan',
    teamName: 'FC Träklubban',
    squad: [],
    played: false,
  }
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
