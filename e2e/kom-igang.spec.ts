import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/members', (route) => route.fulfill({ json: { members: [] } }))
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { discordServerId: '', discordInviteUrl: '' } }),
  )
  await page.route('**/api/presence', (route) => route.fulfill({ json: { presence: {} } }))
  await page.route('**/api/stats/highlights', (route) =>
    route.fulfill({ json: { highlights: [], memberCount: 0, withStats: 0 } }),
  )
  await page.route('**/api/quotes', (route) => route.fulfill({ json: { quotes: [] } }))
  await page.route('**/api/events', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: ': ansluten\n\n',
    }),
  )
})

// /api/members/wot/login kräver requireAuth och svarar 401 för en utloggad
// besökare — en direktlänk dit landar på ett rått JSON-fel i webbläsaren.
test('an anonymous visitor never sees a direct link to the protected World of Tanks endpoint', async ({
  page,
}) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { authenticated: false } }))
  await page.goto('/kom-igang')

  await expect(page.getByText(/redan medlem/i)).toBeVisible()
  const wotLinks = await page.locator('a[href*="wot/login"]').count()
  expect(wotLinks).toBe(0)
})

test('a signed-in member sees their own checklist status', async ({ page }) => {
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
            steamid64: '76561198060166361',
            personaName: '[BVS] Kungalv',
            avatarUrl: null,
            discordName: null,
          },
        ],
      },
    }),
  )
  await page.route('**/api/stats/cards', (route) =>
    route.fulfill({
      json: {
        cards: [
          {
            steamid64: '76561198060166361',
            personaName: '[BVS] Kungalv',
            hasStats: true,
            overall: 74,
            tier: 'silver',
            position: 'AWP',
            attributes: [],
            wotAttributes: [],
            comments: [],
            memberOfMonth: false,
          },
        ],
      },
    }),
  )

  await page.goto('/kom-igang')

  await expect(page.getByRole('heading', { name: '2. Öppen spelinformation i Steam' })).toBeVisible()
  const discordStep = page.locator('li', {
    has: page.getByRole('heading', { name: '3. Discord-namn' }),
  })
  await expect(discordStep.getByText('Behöver åtgärdas')).toBeVisible()
})
