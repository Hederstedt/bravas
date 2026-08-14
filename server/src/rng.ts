// Deterministisk slump. En match måste gå att spela om exakt likadant — annars
// blir all balansering gissningar och varje buggrapport omöjlig att återskapa.
// Math.random duger därför inte någonstans i simuleringen.

// FNV-1a. Samma funktion som citatvarianterna alltid valts med, flyttad hit så
// att simuleringen kan använda den utan att duplicera den.
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// mulberry32: liten, snabb och tillräckligt jämn för det här. Ingen
// kryptografi, bara reproducerbar slump.
export function createRng(seed: string | number): () => number {
  let state = (typeof seed === "string" ? hashSeed(seed) : seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Väljer ur en lista där vissa kandidater ska dyka upp oftare än andra.
// Returnerar null bara för en tom lista: väger allt noll faller den tillbaka på
// ett jämnt val, för mitt i en runda finns det ingen vettig tolkning av "ingen".
export function pickWeighted<T>(
  candidates: readonly T[],
  weight: (candidate: T) => number,
  rng: () => number
): T | null {
  if (candidates.length === 0) return null;

  const weights = candidates.map((c) => Math.max(0, weight(c)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return candidates[Math.floor(rng() * candidates.length)] ?? candidates[0]!;

  let roll = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1]!;
}
