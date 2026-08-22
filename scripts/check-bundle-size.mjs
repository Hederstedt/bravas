// Kör efter `vite build` och stoppar CI om en bundle vuxit förbi sin budget.
// Utan det syns en regression (t.ex. ett tungt bibliotek importerat av
// misstag) först när någon råkar titta på byggloggen — om alls.
//
//   node scripts/check-bundle-size.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const assetsDir = resolve(here, '..', 'dist', 'assets')

// KB, gzippat. Generöst tilltaget över dagens läge (index ~90 KB, css ~9 KB,
// managerPage ~6 KB, matchReport ~1 KB) — ska fånga en riktig regression,
// inte varje enstaka rad kod.
const BUDGETS_KB = {
  'index-*.js': 130,
  'index-*.css': 20,
  'managerPage-*.js': 20,
  'matchReport-*.js': 5,
}

function matches(filename, pattern) {
  const re = new RegExp(`^${pattern.replace('*', '.*')}$`)
  return re.test(filename)
}

const files = readdirSync(assetsDir)
let failed = false

for (const [pattern, budgetKb] of Object.entries(BUDGETS_KB)) {
  const file = files.find((f) => matches(f, pattern))
  if (!file) {
    console.error(`Hittade ingen fil som matchar ${pattern} i dist/assets`)
    failed = true
    continue
  }
  const gzipKb = gzipSync(readFileSync(join(assetsDir, file))).length / 1024
  const overBudget = gzipKb > budgetKb
  console.log(
    `${file}: ${gzipKb.toFixed(1)} KB gzippat (budget ${budgetKb} KB)${overBudget ? ' — ÖVER BUDGET' : ''}`,
  )
  if (overBudget) failed = true
}

if (failed) {
  console.error('\nBundle-budgeten överskreds — se scripts/check-bundle-size.mjs.')
  process.exit(1)
}
