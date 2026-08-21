import { test, expect } from '@playwright/test'

// jsdom har ingen layout, så pixelmått och riktig fokusordning går bara att
// vakta här — se samma resonemang i smoke.spec.ts om mobilmenyns fällfilter.

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { authenticated: false } }))
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
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { discordServerId: '', discordInviteUrl: '' } }),
  )
  await page.route('**/api/presence', (route) => route.fulfill({ json: { presence: {} } }))
  await page.route('**/api/stats/highlights', (route) =>
    route.fulfill({
      json: {
        highlights: [
          {
            gameId: 'cs2',
            gameTitle: 'Counter-Strike 2',
            label: 'Flest kills',
            value: '87 021',
            holder: '[BVS] Kungalv',
            detail: '52 000 dödsfall på vägen',
            standings: [
              { name: '[BVS] Kungalv', value: '87 021' },
              { name: '[BVS] #Mag', value: '47 821' },
            ],
          },
        ],
        memberCount: 1,
        withStats: 1,
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
            attributes: [
              { key: 'SIK', label: 'Sikte', description: 'Andel av avlossade skott som träffar', rating: 80 },
            ],
            wotAttributes: [],
            comments: ['Smyger runt mest.'],
            memberOfMonth: false,
          },
        ],
      },
    }),
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

test('the skip link is the first stop and jumps past nav to main content', async ({ page }) => {
  await page.goto('/')
  // Ger sidan ett känt fokusläge innan Tab — annars kan webbläsarens eget
  // gränssnitt (t.ex. adressfältet) äga det första tabbstoppet i stället.
  await page.locator('body').focus()

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Hoppa till huvudinnehåll' })
  await expect(skipLink).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})

test('the attribute, legend and expand buttons meet the 44x44 touch target', async ({ page }) => {
  await page.goto('/')

  const attrToggle = page.getByRole('button', { name: /SIK/ }).first()
  const attrBox = await attrToggle.boundingBox()
  expect(attrBox!.height).toBeGreaterThanOrEqual(44)

  const legendToggle = page.getByRole('button', { name: 'Hur räknas betyget fram?' })
  const legendBox = await legendToggle.boundingBox()
  expect(legendBox!.height).toBeGreaterThanOrEqual(44)

  const expandButton = page.getByRole('button', { name: /Visa hela listan/ })
  const expandBox = await expandButton.boundingBox()
  expect(expandBox!.height).toBeGreaterThanOrEqual(44)
})

test('focus moves to the new heading after a route change', async ({ page, isMobile }) => {
  await page.goto('/')

  if (isMobile) {
    await page.getByRole('button', { name: 'Öppna menyn' }).click()
    await page.getByRole('dialog', { name: 'Meny' }).getByRole('link', { name: 'Kom igång' }).click()
  } else {
    await page.locator('.nav-links').getByRole('link', { name: 'Kom igång' }).click()
  }

  await expect(page.getByRole('heading', { name: 'Kom igång med Bravas' })).toBeFocused()
})

test('the active page link is marked aria-current', async ({ page, isMobile }) => {
  await page.goto('/manager')

  if (isMobile) {
    await page.getByRole('button', { name: 'Öppna menyn' }).click()
    await expect(
      page.getByRole('dialog', { name: 'Meny' }).getByRole('link', { name: 'Manager' }),
    ).toHaveAttribute('aria-current', 'page')
  } else {
    await expect(page.locator('.nav-links').getByRole('link', { name: 'Manager' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  }
})

// Navbaren är klistrad (64px) — utan scroll-margin täcker den sektionens
// egen rubrik precis efter ankarscrollet.
test('a jumped-to section is not tucked under the sticky nav', async ({ page, isMobile }) => {
  await page.goto('/')

  if (isMobile) {
    await page.getByRole('button', { name: 'Öppna menyn' }).click()
    await page.getByRole('dialog', { name: 'Meny' }).getByRole('link', { name: 'Siffrorna' }).click()
  } else {
    await page.locator('.nav-links').getByRole('link', { name: 'Siffrorna' }).click()
  }

  const section = page.locator('#siffrorna')
  await expect(section).toBeInViewport()
  const box = await section.boundingBox()
  expect(box!.y).toBeGreaterThanOrEqual(60)
})
