import { test, expect } from '@playwright/test'

// Stubbas i testet i stället för att gå mot ett riktigt API: CI ska inte bero
// på att driften är uppe, och svaren blir förutsägbara. Default är den
// utloggade vyn med tom roster — det besökaren möter.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { authenticated: false } }))
  await page.route('**/api/members', (route) => route.fulfill({ json: { members: [] } }))
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { discordServerId: '', discordInviteUrl: '' } }),
  )
  await page.route('**/api/presence', (route) => route.fulfill({ json: { presence: {} } }))
  await page.route('**/api/stats/highlights', (route) =>
    route.fulfill({ json: { highlights: [], memberCount: 0, withStats: 0 } }),
  )
  await page.route('**/api/quotes', (route) => route.fulfill({ json: { quotes: [] } }))
})

test('landing page loads without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await expect(page).toHaveTitle(/BVS — Bravas/)
  await expect(page.getByRole('heading', { name: 'Bravas' })).toBeVisible()
  expect(errors).toEqual([])
})

test('all sections are present', async ({ page }) => {
  await page.goto('/')
  for (const heading of [
    'Vad vi lirar',
    'Gubbarna',
    'Siffrorna',
    'Citatväggen',
    'Om BVS',
    'Häng med i Discorden',
  ]) {
    await expect(page.getByRole('heading', { name: heading })).toBeAttached()
  }
  await expect(page.getByRole('heading', { name: 'World of Tanks' })).toBeAttached()
  await expect(page.getByText('Demo-data')).toBeAttached()
})

test('navigation scrolls to roster section', async ({ page, isMobile }) => {
  await page.goto('/')

  if (isMobile) {
    await page.getByRole('button', { name: 'Öppna menyn' }).click()
    await page.getByRole('dialog', { name: 'Meny' }).getByRole('link', { name: 'Gubbarna' }).click()
    await expect(page.getByRole('dialog', { name: 'Meny' })).not.toBeVisible()
  } else {
    await page.locator('.nav-links').getByRole('link', { name: 'Gubbarna' }).click()
  }

  await expect(page.locator('#gubbarna')).toBeInViewport()
})

test('anonymous visitors are offered Steam login', async ({ page, isMobile }) => {
  await page.goto('/')

  if (isMobile) await page.getByRole('button', { name: 'Öppna menyn' }).click()
  await expect(page.getByRole('link', { name: /Logga in med Steam/ }).first()).toBeVisible()

  // Ingen har loggat in i det här scenariot, så platshållarna ska stå kvar.
  await expect(page.getByRole('heading', { name: 'Gubbe #1' })).toBeAttached()
})

test('signed-in members replace the placeholder roster', async ({ page, isMobile }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { authenticated: true, steamid64: '76561198060166361' } }),
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

  await page.goto('/')

  await expect(page.getByRole('heading', { name: '[BVS] Kungalv' })).toBeAttached()
  await expect(page.getByRole('heading', { name: 'Gubbe #1' })).toHaveCount(0)

  if (isMobile) await page.getByRole('button', { name: 'Öppna menyn' }).click()
  await expect(page.getByRole('link', { name: /Logga in med Steam/ })).toHaveCount(0)
})

test('the quote wall asks anonymous visitors to log in', async ({ page }) => {
  await page.route('**/api/quotes', (route) =>
    route.fulfill({
      json: {
        quotes: [
          { id: 1, text: 'Jag hade ju träklubban', saidBy: 'Gubbe #6', createdAt: 1, votes: 3 },
        ],
      },
    }),
  )

  await page.goto('/')

  // Demo-statistiken råkar citera samma replik, så sökningen hålls inom sektionen.
  const wall = page.locator('#citat')
  await expect(wall.getByRole('blockquote')).toHaveText('Jag hade ju träklubban')
  await expect(wall.getByRole('button', { name: 'Rösta' })).toHaveCount(0)
  await expect(wall.getByText(/Logga in med Steam för att lägga till/)).toBeAttached()
})

test('no horizontal overflow', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})
