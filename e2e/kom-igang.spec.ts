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
            id: 'e2e-public-id-kungalv',
            personaName: '[BVS] Kungalv',
            avatarUrl: null,
            discordName: null,
            wotNickname: null,
            wowCharacter: null,
            mine: true,
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
            id: 'e2e-public-id-kungalv',
            personaName: '[BVS] Kungalv',
            hasStats: true,
            overall: 74,
            tier: 'silver',
            position: 'AWP',
            attributes: [],
            wotAttributes: [],
            wowAttributes: [],
            comments: [],
            memberOfMonth: false,
          },
        ],
      },
    }),
  )

  await page.goto('/kom-igang')

  // Steget heter numera "Öppna din Steam-profil" och inte "Öppen
  // spelinformation": det krävs två inställningar, och den som bara slår på
  // spelinformationen får fortfarande noll månadspoäng.
  await expect(page.getByRole('heading', { name: '2. Öppna din Steam-profil' })).toBeVisible()
  const steamStep = page.locator('li', {
    has: page.getByRole('heading', { name: '2. Öppna din Steam-profil' }),
  })
  await expect(steamStep.getByRole('term').filter({ hasText: 'Min profil' })).toBeVisible()
  await expect(steamStep.getByRole('term').filter({ hasText: 'Spelinformation' })).toBeVisible()

  const discordStep = page.locator('li', {
    has: page.getByRole('heading', { name: '3. Discord-namn' }),
  })
  await expect(discordStep.getByText('Behöver åtgärdas')).toBeVisible()
})
