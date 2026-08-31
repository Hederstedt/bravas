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

// Nav, SteamLogin (monterad två gånger: desktopmeny + mobilöverlägg), Roster
// och About frågade förut var för sig efter samma sak — se useSession.ts och
// useMembers.ts. Ett normalt besök ska bara göra ett anrop per grundresurs.
test('a normal visit makes only one request per shared resource, even with the mobile menu open', async ({
  page,
  isMobile,
}) => {
  const requests: string[] = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (['/api/auth/me', '/api/members', '/api/presence'].includes(url.pathname)) {
      requests.push(url.pathname)
    }
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  if (isMobile) {
    await page.getByRole('button', { name: 'Öppna menyn' }).click()
    await page.waitForLoadState('networkidle')
  }

  const count = (path: string) => requests.filter((r) => r === path).length
  expect(count('/api/auth/me')).toBe(1)
  expect(count('/api/members')).toBe(1)
  // Navbarens live-pill och Gubbarna delar närvaron via usePresence.
  expect(count('/api/presence')).toBe(1)
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
  // "World of Tanks" är rubrik både på spelkortet och på dess Siffror-grupp
  // sedan Siffrorna grupperas per spel — låst till Spel-sektionen för att inte
  // bli tvetydig.
  await expect(page.locator('#spel').getByRole('heading', { name: 'World of Tanks' })).toBeAttached()
  // Ett fungerande API som svarar tomt (ingen inloggad än) ska aldrig hitta
  // på siffror för att fylla ut sektionen.
  await expect(page.getByText('Demo-data')).toHaveCount(0)

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
  await expect(page.getByRole('heading', { name: 'Bravas CS Manager' })).toBeVisible()

  // En delad länk ska fungera utan att gå via startsidan. Vites preview har
  // SPA-fallback inbyggd — i drift kräver detta try_files i nginx.
  await page.goto('/manager')
  await expect(page.getByRole('heading', { name: 'Bravas CS Manager' })).toBeVisible()

  // Och logotypen leder hem igen.
  await page.getByRole('link', { name: /BVS/ }).click()
  await expect(page.getByRole('heading', { name: 'Bravas' })).toBeVisible()
})

test('anonymous visitors are offered Steam login', async ({ page, isMobile }) => {
  await page.goto('/')

  if (isMobile) await page.getByRole('button', { name: 'Öppna menyn' }).click()
  await expect(page.getByRole('link', { name: /Logga in med Steam/ }).first()).toBeVisible()

  // Ingen har loggat in i det här scenariot — sektionen ska säga det rakt ut,
  // inte hitta på en laguppställning.
  await expect(page.getByText(/ingen har loggat in än/i)).toBeAttached()
})

test('signed-in members appear in the roster', async ({ page, isMobile }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { authenticated: true, steamid64: '76561198060166361' } }),
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

  await page.goto('/')

  await expect(page.getByRole('heading', { name: '[BVS] Kungalv' })).toBeAttached()
  await expect(page.getByText(/ingen har loggat in än/i)).toHaveCount(0)

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

  const wall = page.locator('#citat')
  await expect(wall.getByRole('blockquote')).toHaveText('Jag hade ju träklubban')
  await expect(wall.getByRole('button', { name: 'Rösta' })).toHaveCount(0)
  await expect(wall.getByText(/Logga in med Steam för att lägga till/)).toBeAttached()
})

// Mobilmenyn låg en gång inuti <nav>, som har backdrop-filter. Ett filter gör
// elementet till containing block för allt med position: fixed inuti, så
// overlayns `inset: 64px 0 0` räknades mot navbarens 65 px i stället för mot
// skärmen: menyn kollapsade till en 48 px hög remsa och alla länkarna klipptes
// bort. Den öppnades alltså, men innehöll inget klickbart.
//
// Enhetstesterna missade det helt — jsdom har ingen layout, så en kollapsad
// overlay går inte att upptäcka där. Därför måste det vaktas här, med riktig
// layout, och med krav på att länkarna faktiskt SYNS och inte bara finns.
test.describe('the mobile menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
  })

  test('opens with every link visible and inside the screen', async ({ page }) => {
    await page.getByRole('button', { name: 'Öppna menyn' }).click()

    const menu = page.getByRole('dialog', { name: 'Meny' })
    await expect(menu).toBeVisible()

    // Kärnan: länkarna ska synas, inte bara vara monterade.
    for (const label of ['Gubbarna', 'Spel', 'Siffrorna', 'Citat', 'Manager', 'Om oss', 'Discord']) {
      await expect(menu.getByRole('link', { name: label })).toBeInViewport()
    }

    // Och överlagret ska täcka skärmen, inte kollapsa till en remsa.
    const height = await menu.evaluate((el) => el.getBoundingClientRect().height)
    expect(height).toBeGreaterThan(600)
  })

  test('navigates when a link is tapped and closes behind it', async ({ page }) => {
    await page.getByRole('button', { name: 'Öppna menyn' }).click()
    await page.getByRole('dialog', { name: 'Meny' }).getByRole('link', { name: 'Manager' }).click()

    await expect(page).toHaveURL(/\/manager$/)
    await expect(page.getByRole('dialog', { name: 'Meny' })).toBeHidden()
  })

  test('closes on Escape and hands focus back to the burger', async ({ page }) => {
    const burger = page.getByRole('button', { name: 'Öppna menyn' })
    await burger.click()
    await expect(page.getByRole('dialog', { name: 'Meny' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Meny' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Öppna menyn' })).toBeFocused()
  })
})

// Sidan som helhet får aldrig gå att dra i sidled.
test('no horizontal overflow', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})

// Panelen ligger absolut positionerad ovanpå kortet, inte i flödet — annars
// hade ett öppnat attribut vuxit varenda kort i raden samtidigt (grid-items
// sträcker sig till det högsta syskonet som standard) och knuffat sidan nedåt.
test('opening an attribute does not resize the lineup', async ({ page }) => {
  // Behöver ett riktigt kort med attribut att klicka på — sektionen visar
  // inget kort alls i det tomma standardläget från beforeEach.
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
            mine: false,
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
            attributes: [
              { key: 'SIK', label: 'Sikte', description: 'Andel av avlossade skott som träffar', rating: 80 },
              { key: 'SKA', label: 'Skallar', description: 'Andel av hans kills som är headshots', rating: 71 },
              { key: 'FRA', label: 'Frag', description: 'Kills per spelad runda', rating: 55 },
              { key: 'TÅL', label: 'Tålighet', description: 'Hur ofta han överlever rundan', rating: 92 },
              { key: 'NYT', label: 'Nytta', description: 'Bomber och MVP:er per runda', rating: 64 },
              { key: 'TID', label: 'Tid', description: 'Total speltid i CS2', rating: 88 },
            ],
            wotAttributes: [],
            wowAttributes: [],
            comments: ['Smyger runt mest.'],
            memberOfMonth: false,
          },
        ],
      },
    }),
  )

  await page.goto('/')

  const card = page.locator('.player-card').first()
  const before = await card.evaluate((el) => el.getBoundingClientRect().height)

  await card.getByRole('button', { name: /NYT/ }).click()
  await expect(card.locator('.attr-detail')).toBeVisible()

  const after = await card.evaluate((el) => el.getBoundingClientRect().height)
  // Tolerans, inte exakt likhet: getBoundingClientRect ger flyttal, och
  // Chromium räknar om layouten med några hundradels promilles skillnad mellan
  // två mätningar av samma element — på mobilprojektet syns det som
  // 448.40625 mot 448.4062194824219. Buggen testet vaktar växte korten med
  // tiotals pixlar, så en halv pixel fångar den lika säkert utan att fälla på
  // avrundningsbrus.
  expect(after).toBeCloseTo(before, 0)

  // Och panelen ska hålla sig innanför kortet den hör till.
  const fits = await card.evaluate((el) => {
    const c = el.getBoundingClientRect()
    const p = el.querySelector('.attr-detail')!.getBoundingClientRect()
    return p.top >= c.top && p.bottom <= c.bottom
  })
  expect(fits).toBe(true)
})
