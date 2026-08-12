// Genererar favicon.ico + PWA-ikoner från public/favicon.svg.
// Körs manuellt vid behov: node scripts/generate-icons.mjs
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('public/favicon.svg', 'utf8')
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const browser = await chromium.launch()
const page = await browser.newPage()

async function renderPng(size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>*{margin:0;padding:0}</style><img src="${dataUri}" width="${size}" height="${size}">`,
  )
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}

writeFileSync('public/icon-192.png', await renderPng(192))
writeFileSync('public/icon-512.png', await renderPng(512))

// ICO-container med PNG-innehåll (stöds av alla moderna webbläsare)
const png32 = await renderPng(32)
const header = Buffer.alloc(6)
header.writeUInt16LE(1, 2) // typ: ikon
header.writeUInt16LE(1, 4) // antal bilder
const entry = Buffer.alloc(16)
entry[0] = 32 // bredd
entry[1] = 32 // höjd
entry.writeUInt16LE(1, 4) // färgplan
entry.writeUInt16LE(32, 6) // bitar/pixel
entry.writeUInt32LE(png32.length, 8)
entry.writeUInt32LE(22, 12) // offset: 6 + 16
writeFileSync('public/favicon.ico', Buffer.concat([header, entry, png32]))

await browser.close()
console.log('Skrev public/favicon.ico, icon-192.png, icon-512.png')
