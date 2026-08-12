import { chromium } from '@playwright/test'

const out = process.argv[2] ?? '.'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${out}/hero-desktop.png` })
await page.locator('#siffrorna').scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/stats-desktop.png` })

const mob = await browser.newPage({ viewport: { width: 390, height: 844 } })
await mob.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await mob.waitForTimeout(800)
await mob.screenshot({ path: `${out}/hero-mobile.png` })

await browser.close()
console.log('done')
