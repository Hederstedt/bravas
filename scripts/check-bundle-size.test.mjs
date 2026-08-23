import { describe, expect, it } from 'vitest'
import { matches } from './check-bundle-size.mjs'

// CodeQL flaggade mönstermatchningen här (js/incomplete-sanitization, "This
// replaces only the first occurrence of '*'"). Ingen säkerhetslucka —
// mönstren är hårdkodade literaler i samma fil — men skriptet var fel skrivet
// på två sätt, och båda hade gett tyst fel svar i stället för ett fel.
describe('matches', () => {
  it('matchar en hashad fil mot sitt mönster', () => {
    expect(matches('index-BzfhKSCH.js', 'index-*.js')).toBe(true)
    expect(matches('managerPage-BaQL3kS2.js', 'managerPage-*.js')).toBe(true)
  })

  it('skiljer på filändelser', () => {
    expect(matches('index-BzfhKSCH.css', 'index-*.js')).toBe(false)
    expect(matches('matchReport-abc.js', 'index-*.js')).toBe(false)
  })

  it('är förankrat i båda ändar', () => {
    expect(matches('vendor-index-abc.js', 'index-*.js')).toBe(false)
    expect(matches('index-abc.js.map', 'index-*.js')).toBe(false)
  })

  // Punkten var inte escapad, så `index-*.js` byggde `^index-.*.js$` där
  // punkten matchade vilket tecken som helst.
  it('behandlar punkten som en punkt och inte som vad som helst', () => {
    expect(matches('index-abcXjs', 'index-*.js')).toBe(false)
  })

  // `pattern.replace('*', '.*')` bytte bara den första stjärnan. Den andra
  // blev kvar som en literal stjärna, som aldrig matchar ett filnamn.
  it('klarar ett mönster med mer än en stjärna', () => {
    expect(matches('index-abc-legacy-def.js', 'index-*-legacy-*.js')).toBe(true)
    expect(matches('index-abc-modern-def.js', 'index-*-legacy-*.js')).toBe(false)
  })

  it('kräver att stjärnan har något att matcha på var sida', () => {
    expect(matches('index-.js', 'index-*.js')).toBe(true)
    expect(matches('index.js', 'index-*.js')).toBe(false)
  })
})
