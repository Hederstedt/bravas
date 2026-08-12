import { test, expect } from '@playwright/test'

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
  for (const heading of ['Vad vi lirar', 'Gubbarna', 'Siffrorna', 'Om BVS', 'Häng med i Discorden']) {
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

test('no horizontal overflow', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})
