import { createRng } from "./rng.ts";
import { SEASON_BUDGET, SQUAD_SIZE, squadCost, type PoolPlayer } from "./season.ts";

// Serien behöver motstånd. Utan botlag kan den som är först in i spelet skriva
// på sin trupp och sedan inte göra någonting alls — det finns ingen att möta,
// och att vänta på att resten av klanen loggar in är inget spel. Botlagen
// fylls därför på när serien startar, så att en ensam manager får en hel
// säsong att spela.

// Så många lag serien fylls upp till. Fyra ger dubbelmöten över sex omgångar:
// tillräckligt för att tabellen ska säga något, kort nog att spelas i ett svep.
export const MIN_TEAMS = 4;

// Namnen ska läsas som datorstyrda vid en blick, utan att vara tråkiga. Ingen
// av dem kan förväxlas med ett lag som en gubbe hittat på.
export const BOT_TEAM_NAMES = [
  "Botvid & Sönner",
  "AFK Allstars",
  "Silikondalen",
  "Kretskort United",
  "FC Fyrkantig",
  "Algoritmerna",
  "Lagg IF",
  "Skriptgänget",
] as const;

// Namnen tas i ordning men hoppar över det som redan finns i serien, så att en
// omstartad säsong eller ett hemmasnickrat lagnamn inte ger dubbletter.
export function pickBotNames(count: number, taken: ReadonlySet<string>): string[] {
  const names: string[] = [];
  for (const name of BOT_TEAM_NAMES) {
    if (names.length === count) break;
    if (!taken.has(name)) names.push(name);
  }
  // Har namnen tagit slut får de numrerade syskon hellre än att serien blir
  // kortare än den ska.
  for (let i = 1; names.length < count; i++) {
    const fallback = `Botvid & Sönner ${i + 1}`;
    if (!taken.has(fallback) && !names.includes(fallback)) names.push(fallback);
  }
  return names;
}

// Draften: börja med de billigaste fem, uppgradera sedan slumpvis så länge
// budgeten räcker. Att börja billigt garanterar att truppen alltid går ihop —
// en girig draft uppifrån kan måla in sig i ett hörn där de sista platserna
// inte går att fylla. Uppgraderingarna gör lagen olika utan att någon blir
// omöjlig att slå.
const UPGRADE_ROUNDS = 40;

// Botlagen får olika djupa fickor. Lät man dem alla handla för hela budgeten
// blev serien en mur: varje lag maximalt optimerat, och den som testar spelet
// första gången får däng i alla matcher utan att förstå varför. Med spridning
// finns det en stege — ett lag att slå direkt, ett att sikta mot.
const BOT_BUDGET_FLOOR = 0.62;
const BOT_BUDGET_SPAN = 0.38;

export function botBudget(seed: string, budget = SEASON_BUDGET): number {
  const rng = createRng(`budget:${seed}`);
  return Math.round(budget * (BOT_BUDGET_FLOOR + rng() * BOT_BUDGET_SPAN));
}

export function draftSquad(
  available: readonly PoolPlayer[],
  seed: string,
  budget = SEASON_BUDGET,
  squadSize = SQUAD_SIZE
): PoolPlayer[] {
  if (available.length < squadSize) return [];

  const byPrice = [...available].sort((a, b) => a.value - b.value || a.key.localeCompare(b.key));
  const squad = byPrice.slice(0, squadSize);
  if (squadCost(squad) > budget) return []; // ens de billigaste ryms inte

  const rng = createRng(`draft:${seed}`);
  const bench = byPrice.slice(squadSize);

  for (let round = 0; round < UPGRADE_ROUNDS && bench.length > 0; round++) {
    const outIndex = Math.floor(rng() * squad.length);
    const out = squad[outIndex]!;
    const headroom = budget - squadCost(squad) + out.value;

    // Bara uppgraderingar: en kandidat som är dyrare än den som ryker, men som
    // fortfarande ryms. Utan dyrare-kravet skulle laget kunna vandra nedåt och
    // sluta lika billigt som det började.
    const candidates = bench.filter((p) => p.value <= headroom && p.value > out.value);
    if (candidates.length === 0) continue;

    const pick = candidates[Math.floor(rng() * candidates.length)]!;
    squad[outIndex] = pick;
    bench.splice(bench.indexOf(pick), 1);
    bench.push(out);
  }

  return squad;
}
