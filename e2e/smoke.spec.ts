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
  await page.route('**/api/stats/cards', (route) =>
    route.fulfill({ json: { cards: [], memberCount: 0, withStats: 0 } }),
  )
  await page.route('**/api/quotes', (route) => route.fulfill({ json: { quotes: [] } }))
  // Händelseströmmen svarar 200 med rätt innehållstyp men inget innehåll. En
  // 404 här hade fått EventSource att logga ett fel, vilket inte speglar
  // driften — där finns endpointen.
  await page.route('**/api/events', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: ': ansluten\n\n',
    }),
  )
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

test('all sections are present, with the crew first', async ({ page }) => {
  await page.goto('/')
  const sections = [
    'Gubbarna',
    'Vad vi lirar',
    'Siffrorna',
    'Citatväggen',
    'Om BVS',
    'Häng med i Discorden',
  ]
  for (const heading of sections) {
    await expect(page.getByRole('heading', { name: heading })).toBeAttached()
  }
  await expect(page.getByRole('heading', { name: 'World of Tanks' })).toBeAttached()
  await expect(page.getByText('Demo-data')).toBeAttached()

  // Gubbarna är sidans huvudnummer och ska ligga före spelen, inte efter.
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('main section')].map((s) => s.id),
  )
  expect(order.indexOf('gubbarna')).toBeLessThan(order.indexOf('spel'))
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

test('the manager page is reachable from the nav and by direct address', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')

  if (isMobile) {
    await page.getByRole('button', { name: 'Öppna menyn' }).click()
    await page.getByRole('dialog', { name: 'Meny' }).getByRole('link', { name: 'Manager' }).click()
  } else {
    await page.locator('.nav-links').getByRole('link', { name: 'Manager' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Manager' })).toBeVisible()

  // En delad länk ska fungera utan att gå via startsidan. Vites preview har
  // SPA-fallback inbyggd — i drift kräver detta try_files i nginx.
  await page.goto('/manager')
  await expect(page.getByRole('heading', { name: 'Manager' })).toBeVisible()

  // Och logotypen leder hem igen.
  await page.getByRole('link', { name: /BVS/ }).click()
  await expect(page.getByRole('heading', { name: 'Bravas' })).toBeVisible()
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

// Laguppställningen scrollar avsiktligt i sidled, men den scrollen ska stanna
// inne i raden. Sidan som helhet får aldrig gå att dra i sidled.
test('no horizontal overflow', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})

// Panelen låg först i flödet. Korten i raden är flex-items som sträcker sig
// till det högsta syskonet, så ett öppnat attribut växte varenda kort samtidigt
// och knuffade hela sidan nedåt.
test('opening an attribute does not resize the lineup', async ({ page }) => {
  await page.goto('/')

  const card = page.locator('.player-card').first()
  const before = await card.evaluate((el) => el.getBoundingClientRect().height)

  await card.getByRole('button', { name: /NYT/ }).click()
  await expect(card.locator('.attr-detail')).toBeVisible()

  const after = await card.evaluate((el) => el.getBoundingClientRect().height)
  expect(after).toBe(before)

  // Och panelen ska hålla sig innanför kortet den hör till.
  const fits = await card.evaluate((el) => {
    const c = el.getBoundingClientRect()
    const p = el.querySelector('.attr-detail')!.getBoundingClientRect()
    return p.top >= c.top && p.bottom <= c.bottom
  })
  expect(fits).toBe(true)
})

test('the lineup scrolls sideways without dragging the page with it', async ({ page }) => {
  await page.goto('/')
  const lineup = page.getByRole('group', { name: 'Gubbarna i BVS' })
  await expect(lineup).toBeVisible()

  const scrollable = await lineup.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(scrollable).toBe(true)

  await lineup.evaluate((el) => el.scrollBy(300, 0))
  const pageScrolledSideways = await page.evaluate(() => window.scrollX > 0)
  expect(pageScrolledSideways).toBe(false)
})
