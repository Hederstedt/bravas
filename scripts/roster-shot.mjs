// Skärmbild på laguppställningen mot det lokala API:et, så att korten går att
// granska som de faktiskt ser ut — med viking, Steam-bricka och närvaroprick
// ovanpå varandra. Kräver att bravas-api och dev-servern kör.
//
//   node scripts/roster-shot.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('http://localhost:5173/')
await page.evaluate(() => document.fonts.ready)
await page.waitForSelector('.player-card .viking')

const lineup = page.locator('.lineup-wrap')
await lineup.screenshot({ path: resolve(here, 'roster-shot.png') })

await browser.close()
console.log(`Skrev ${resolve(here, 'roster-shot.png')}`)
