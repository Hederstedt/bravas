import { test, expect, type Page } from '@playwright/test'

// Riktig pixel-för-pixel skärmdumpsjämförelse (Playwright toHaveScreenshot)
// övervägdes men medvetet inte gjort här: ett baseline skulle behöva
// genereras i samma miljö CI kör i (ubuntu-latest), inte lokalt på Windows —
// annars är CI rött från commit ett på grund av typsnittsrendering, inte en
// riktig regression. Det kräver ett separat, avsiktligt steg i CI självt.
// Strukturella kontroller (ingen sidledsscroll, inget som knuffar layouten)
// fångar samma sorts brutna gränssnitt utan den risken.

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.use({ viewport: { width: 375, height: 812 } })

test.beforeEach(async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { discordServerId: '', discordInviteUrl: '' } }),
  )
  await page.route('**/api/presence', (route) => route.fulfill({ json: { presence: {} } }))
  await page.route('**/api/quotes', (route) => route.fulfill({ json: { quotes: [] } }))
  await page.route('**/api/events', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: ': ansluten\n\n',
    }),
  )
})

// En lång, ordentligt fylld tabell på en smal skärm är precis situationen
// horisontell scroll inuti tabellomslaget ska hantera — sidan runt omkring
// ska aldrig behöva breda ut sig för att rymma den.
test('a long league table does not push the page into horizontal scroll on mobile', async ({
  page,
}) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { authenticated: false } }))
  const table = Array.from({ length: 8 }, (_, i) => ({
    teamId: i + 1,
    name: `Ett Rejält Långt Lagnamn Nummer ${i + 1}`,
    played: 6,
    won: 6 - i,
    drawn: 0,
    lost: i,
    roundsFor: 78 - i * 5,
    roundsAgainst: 30 + i * 5,
    diff: 48 - i * 10,
    points: (6 - i) * 3,
  }))
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
        teams: table.map((t) => ({ id: t.teamId, name: t.name, manager: null, bot: t.teamId % 2 === 0 })),
        table,
        fixtures: [],
      },
    }),
  )

  await page.goto('/manager')
  await expect(page.getByRole('table', { name: 'Ligatabellen' })).toBeVisible()

  expect(await hasHorizontalOverflow(page)).toBe(false)
})

// Felläget (API nere) och regelblockets utfällda innehåll är de två andra
// tillstånd som lades till av Etapp 1/6 — ingen av dem fanns när sidan
// först byggdes för en enkel, alltid-lyckad laddning.
test('the roster error state does not overflow on mobile', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { authenticated: false } }))
  await page.route('**/api/members', (route) => route.fulfill({ status: 500, body: 'boom' }))
  await page.route('**/api/stats/highlights', (route) =>
    route.fulfill({ json: { highlights: [], memberCount: 0, withStats: 0 } }),
  )

  await page.goto('/')
  await expect(page.getByRole('alert').first()).toBeVisible()

  expect(await hasHorizontalOverflow(page)).toBe(false)
})

test('the expanded Manager rules block does not overflow on mobile', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Så funkar Manager' }).click()
  await expect(page.getByText(/Vem får starta en säsong/)).toBeVisible()

  expect(await hasHorizontalOverflow(page)).toBe(false)
})
