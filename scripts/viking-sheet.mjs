// Renderar ett provark med vikingafigurer i alla tier- och positionsvarianter,
// så att formerna går att granska i ett svep i stället för att jaga rätt gubbe
// i rostern. Skriver scripts/viking-sheet.png.
//
//   node scripts/viking-sheet.mjs
//
// Ett utvecklingsverktyg, inte en del av bygget. Playwright finns redan för
// E2E, så det kostar inget nytt beroende.
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  server: { port: 5188, strictPort: true },
})
await server.listen()

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } })
await page.goto('http://localhost:5188/viking-sheet.html')
await page.evaluate(() => document.fonts.ready)
await page.waitForSelector('.sheet-cell svg')
await page.screenshot({ path: resolve(here, 'viking-sheet.png'), fullPage: true })

await browser.close()
await server.close()
console.log(`Skrev ${resolve(here, 'viking-sheet.png')}`)
