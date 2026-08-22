import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'

// CI ska stoppa på allvarliga fel, inte varje enskild opinionsfråga axe har —
// "moderate"/"minor" (t.ex. kontrastnyanser i designen) rapporteras inte här,
// bara "critical" och "serious" (trasig struktur, saknad accessible name,
// tangentbordsfällor m.m.). Manuell skärmläsarprovning (docs/a11y-checklist.md)
// täcker resten — automatiska verktyg hittar bara en bråkdel av det som
// spelar roll för fokusordning och begriplighet.
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  return results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
}

function describeViolations(violations: Awaited<ReturnType<typeof seriousViolations>>) {
  return violations
    .map((v) => `${v.impact}: ${v.id} — ${v.description}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`)
    .join('\n\n')
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/members', (route) => route.fulfill({ json: { members: [] } }))
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { discordServerId: '', discordInviteUrl: '' } }),
  )
  await page.route('**/api/presence', (route) => route.fulfill({ json: { presence: {} } }))
  await page.route('**/api/stats/highlights', (route) =>
    route.fulfill({ json: { highlights: [], memberCount: 0, withStats: 0 } }),
  )
  await page.route('**/api/stats/cards', (route) =>
    route.fulfill({ json: { cards: [], memberCount: 0, withStats: 0 } }),
  )
  await page.route('**/api/quotes', (route) => route.fulfill({ json: { quotes: [] } }))
  await page.route('**/api/valheim/status', (route) =>
    route.fulfill({
      json: { online: false, players: null, maxPlayers: null, address: '', signedIn: false, serverName: null, password: null },
    }),
  )
  await page.route('**/api/discord', (route) =>
    route.fulfill({ json: { available: false, online: 0, members: [] } }),
  )
  await page.route('**/api/events', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: ': ansluten\n\n',
    }),
  )
})

test('the start page has no serious accessibility violations', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { authenticated: false } }))
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const violations = await seriousViolations(page)
  expect(violations, describeViolations(violations)).toEqual([])
})

test('Kom igång has no serious accessibility violations, anonymous', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { authenticated: false } }))
  await page.goto('/kom-igang')
  await page.waitForLoadState('networkidle')

  const violations = await seriousViolations(page)
  expect(violations, describeViolations(violations)).toEqual([])
})

test('Manager has no serious accessibility violations, no season running', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { authenticated: false } }))
  await page.route('**/api/manager', (route) =>
    route.fulfill({
      json: {
        season: null,
        budget: 20_000,
        squadSize: 5,
        locked: false,
        sellRate: 0.7,
        pointsWin: 3,
        pointsDraw: 1,
        transfersPerMatchday: 1,
        trainingPerMatchday: 2,
        pool: [],
        myTeam: null,
        lastFinished: null,
        teams: [],
        table: [],
        fixtures: [],
      },
    }),
  )
  await page.goto('/manager')
  await page.waitForLoadState('networkidle')

  const violations = await seriousViolations(page)
  expect(violations, describeViolations(violations)).toEqual([])
})

// Tabellen och tabbordningen ser annorlunda ut när en säsong faktiskt är
// igång — samma sida, ett strukturellt sett helt annat innehåll.
test('Manager has no serious accessibility violations, season running with a table', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { authenticated: false } }))
  await page.route('**/api/manager', (route) =>
    route.fulfill({
      json: {
        season: { id: 1, name: 'Höstserien', starts_at: 1, ends_at: 2, status: 'active' },
        budget: 20_000,
        squadSize: 5,
        locked: true,
        sellRate: 0.7,
        pointsWin: 3,
        pointsDraw: 1,
        transfersPerMatchday: 1,
        trainingPerMatchday: 2,
        pool: [],
        myTeam: null,
        lastFinished: null,
        teams: [
          { id: 1, name: 'FC Gubbarna', manager: '76561198000000001', bot: false },
          { id: 2, name: 'Träklubborna', manager: null, bot: true },
        ],
        table: [
          {
            teamId: 1,
            name: 'FC Gubbarna',
            played: 2,
            won: 2,
            drawn: 0,
            lost: 0,
            roundsFor: 26,
            roundsAgainst: 10,
            diff: 16,
            points: 6,
          },
          {
            teamId: 2,
            name: 'Träklubborna',
            played: 2,
            won: 0,
            drawn: 0,
            lost: 2,
            roundsFor: 10,
            roundsAgainst: 26,
            diff: -16,
            points: 0,
          },
        ],
        fixtures: [
          {
            id: 11,
            matchday: 1,
            home: { id: 1, name: 'FC Gubbarna' },
            away: { id: 2, name: 'Träklubborna' },
            played: true,
            homeScore: 13,
            awayScore: 5,
          },
        ],
      },
    }),
  )
  await page.goto('/manager')
  await page.waitForLoadState('networkidle')

  const violations = await seriousViolations(page)
  expect(violations, describeViolations(violations)).toEqual([])
})

test('the 404 page has no serious accessibility violations', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { authenticated: false } }))
  await page.goto('/finns-inte')
  await page.waitForLoadState('networkidle')

  const violations = await seriousViolations(page)
  expect(violations, describeViolations(violations)).toEqual([])
})

// Mitt konto: den mest sammansatta inloggade vyn (kort, formulär,
// bortkopplingsknappar, månadsställning) — den "relevanta inloggade vy"
// planen efterlyser.
test('Mitt konto has no serious accessibility violations, signed in', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: { authenticated: true, steamid64: '76561198060166361', isMember: true, isAdmin: false },
    }),
  )
  await page.route('**/api/members', (route) =>
    route.fulfill({
      json: {
        members: [
          {
            id: 'e2e-public-id-kungalv',
            personaName: '[BVS] Kungalv',
            avatarUrl: null,
            discordName: 'kungalv',
            wotNickname: 'KungalvIRL',
            mine: true,
          },
        ],
      },
    }),
  )
  await page.route('**/api/stats/month', (route) =>
    route.fulfill({
      json: {
        month: '2026-08',
        standings: [{ id: 'e2e-public-id-kungalv', personaName: '[BVS] Kungalv', score: 12 }],
        lastMonth: null,
      },
    }),
  )
  await page.goto('/mitt-konto')
  await page.waitForLoadState('networkidle')

  const violations = await seriousViolations(page)
  expect(violations, describeViolations(violations)).toEqual([])
})
