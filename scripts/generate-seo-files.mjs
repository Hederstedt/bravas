// Genererar public/sitemap.xml och public/robots.txt från src/routeMeta.json
// — appens klientstyrda metadata (src/components/routeMeta.tsx) och de här
// filerna läser samma lista, så de aldrig kan glida isär. Körs som prebuild
// (se package.json) så filerna aldrig hinner bli inaktuella.
//
//   node scripts/generate-seo-files.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const routesPath = resolve(here, '..', 'src', 'routeMeta.json')
const publicDir = resolve(here, '..', 'public')

const routes = JSON.parse(readFileSync(routesPath, 'utf-8'))
const BASE_URL = 'https://www.bravas.se'

const urls = routes.map((r) => `  <url><loc>${BASE_URL}${r.path}</loc></url>`).join('\n')
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
writeFileSync(resolve(publicDir, 'sitemap.xml'), sitemap)

// Privata rutter är inte hemliga — bara inget sökmotorer ska lista. robots.txt
// hindrar ingen från att öppna dem, det gör requireAuth i backend.
const robots = `User-agent: *
Disallow: /mitt-konto
Disallow: /ansok
Disallow: /admin
Disallow: /manager/match/

Sitemap: ${BASE_URL}/sitemap.xml
`
writeFileSync(resolve(publicDir, 'robots.txt'), robots)

console.log(`Skrev sitemap.xml (${routes.length} rutter) och robots.txt`)
