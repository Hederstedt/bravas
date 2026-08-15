// Deterministisk slump. Samma två funktioner som server/src/rng.ts — medvetet
// duplicerade i stället för brutna ut i ett delat paket: det är tjugo rader
// utan beroenden, och frontend och backend byggs till helt olika mål. Ett
// paket däremellan hade kostat mer i bygge och underhåll än det sparat.
//
// Här används den till vikingafigurerna: varje gubbe ska få samma figur varje
// gång sidan laddas, annars byter han utseende mellan besöken.

// FNV-1a.
export function hashSeed(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

// mulberry32: liten, snabb och tillräckligt jämn. Ingen kryptografi, bara
// reproducerbar slump.
export function createRng(seed: string | number): () => number {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
