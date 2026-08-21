import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const publicRoutes: { path: string; title: string; description: string }[] = JSON.parse(
  readFileSync(resolve(here, '..', 'src', 'routeMeta.json'), 'utf-8'),
)

// Samma källa som robots.txt/sitemap.xml genereras från (scripts/generate-
// seo-files.mjs) och som RouteMeta läser i klienten — om listorna glider isär
// ska det här testet fånga det, inte en användare som delar en trasig länk.

test('sitemap.xml lists exactly the public routes, nothing private', async ({ request }) => {
  const res = await request.get('/sitemap.xml')
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toMatch(/xml/)

  const body = await res.text()
  for (const route of publicRoutes) {
    expect(body).toContain(`<loc>https://www.bravas.se${route.path}</loc>`)
  }
  for (const privatePath of ['/mitt-konto', '/ansok', '/admin']) {
    expect(body).not.toContain(privatePath)
  }
})

test('robots.txt disallows the private routes and points at the sitemap', async ({ request }) => {
  const res = await request.get('/robots.txt')
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toMatch(/text\/plain/)

  const body = await res.text()
  expect(body).toContain('Disallow: /mitt-konto')
  expect(body).toContain('Disallow: /ansok')
  expect(body).toContain('Disallow: /admin')
  expect(body).toContain('Sitemap: https://www.bravas.se/sitemap.xml')
})

test('each public page gets its own title and canonical once the client has mounted', async ({
  page,
}) => {
  for (const route of publicRoutes) {
    await page.goto(route.path)
    await expect(page).toHaveTitle(route.title)
    const canonical = page.locator('link[rel="canonical"]')
    await expect(canonical).toHaveAttribute('href', `https://www.bravas.se${route.path}`)
    const description = page.locator('meta[name="description"]')
    await expect(description).toHaveAttribute('content', route.description)
  }
})

test('an unknown address is marked noindex', async ({ page }) => {
  await page.goto('/finns-inte')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
})
