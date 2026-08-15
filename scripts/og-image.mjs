// Renderar scripts/og-image.html till public/og-image.png i 1200x630 — formatet
// Discord och Open Graph vill ha för ett stort delningskort.
//
//   node scripts/og-image.mjs
//
// Playwright finns redan i repot för E2E, så det här kostar inget nytt beroende.
// Kortet är statiskt: kör om skriptet när og-image.html ändras och committa
// PNG:en, så slipper bygget ett renderingssteg.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, 'og-image.html')
const target = resolve(here, '..', 'public', 'og-image.png')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto(`file://${source}`)
// Typsnittet laddas lokalt men asynkront — utan det här renderas kortet med
// systemtypsnittet och ser inte alls ut som sajten.
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: target })
await browser.close()

console.log(`Skrev ${target} (1200x630)`)
