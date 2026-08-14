import type { AttrKey, PlayerCard } from "./cs2Cards.ts";
import type { PlayerRatings } from "./matchSim.ts";
import { createRng } from "./rng.ts";

// En säsong fryser spelarna vid start. Betygen rör sig sedan bara genom
// träning inne i spelet — annars hade en gubbe som lirat en bra kväll i CS2
// plötsligt varit värd något annat mitt i en pågående serie.

export const SQUAD_SIZE = 5;
export const SEASON_WEEKS = 6;

// Budgeten är satt så att fem solida gubbar går att köpa men fem stjärnor inte.
// Utan den spänningen är lagbygget inget val.
export const SEASON_BUDGET = 20_000;

const ATTR_KEYS: AttrKey[] = ["SIK", "SKA", "FRA", "TÅL", "NYT", "TID"];

export type PlayerSource = "member" | "historical" | "generated";

export interface PoolPlayer {
  key: string;
  source: PlayerSource;
  steamid64: string | null;
  name: string;
  ratings: PlayerRatings;
  value: number;
}

export interface HistoricalPlayer {
  steamid64: string;
  label: string;
  name: string;
  ratings: PlayerRatings;
}

export function overallOf(ratings: PlayerRatings): number {
  return Math.round(ATTR_KEYS.reduce((sum, k) => sum + ratings[k], 0) / ATTR_KEYS.length);
}

// Kubisk kurva. En linjär prissättning hade gjort fem medelgubbar till det
// självklara valet varje gång; med den här kostar en stjärna ungefär två
// medelgubbar, och då finns det något att fundera på.
export function playerValue(ratings: PlayerRatings): number {
  const overall = Math.max(1, overallOf(ratings));
  // Golvet på 1: kurvan avrundar de allra sämsta till noll, och en gratis
  // gubbe hade varit ett hål i budgeten snarare än ett dåligt val.
  return Math.max(1, Math.round(overall ** 3 / 100));
}

export function squadCost(players: readonly PoolPlayer[]): number {
  return players.reduce((sum, p) => sum + p.value, 0);
}

// Fria agenter behöver namn som ingen förväxlar med en riktig gubbe.
const FREE_AGENT_NAMES = [
  "Rush-Rolf",
  "Bunker-Bosse",
  "Smoke-Sune",
  "Flash-Frank",
  "Camper-Kenta",
  "Nade-Nisse",
  "Clutch-Kalle",
  "Eco-Egon",
  "Wallbang-Verner",
  "Spray-Sixten",
  "Peek-Pelle",
  "Awp-Arne",
  "Molle-Mårten",
  "Entry-Evert",
  "Lurk-Ludvig",
  "Baiten-Bertil",
  "Tapp-Tage",
  "Retake-Ragnar",
  "Anchor-Anton",
  "Rotate-Roine",
];

function ratingsFrom(card: PlayerCard): PlayerRatings | null {
  if (!card.hasStats || card.attributes.length === 0) return null;
  const ratings = {} as PlayerRatings;
  for (const key of ATTR_KEYS) {
    const attr = card.attributes.find((a) => a.key === key);
    if (!attr) return null;
    ratings[key] = attr.rating;
  }
  return ratings;
}

function toPoolPlayer(
  key: string,
  source: PlayerSource,
  steamid64: string | null,
  name: string,
  ratings: PlayerRatings
): PoolPlayer {
  return { key, source, steamid64, name, ratings, value: playerValue(ratings) };
}

export interface PoolInput {
  members: PlayerCard[];
  historical: HistoricalPlayer[];
  generatedCount: number;
  seed: string;
}

// Poolen byggs en gång per säsong och sparas. Seedet gör att den går att
// bygga om identiskt, vilket både testerna och en eventuell omkörning behöver.
export function buildPool({ members, historical, generatedCount, seed }: PoolInput): PoolPlayer[] {
  const pool: PoolPlayer[] = [];

  for (const card of members) {
    const ratings = ratingsFrom(card);
    // En låst profil har inga attribut att frysa och kan därför inte prissättas.
    if (!ratings) continue;
    pool.push(toPoolPlayer(`member:${card.steamid64}`, "member", card.steamid64, card.personaName, ratings));
  }

  for (const old of historical) {
    pool.push(
      toPoolPlayer(
        `historical:${old.steamid64}:${old.label}`,
        "historical",
        old.steamid64,
        `${old.name} (${old.label})`,
        old.ratings
      )
    );
  }

  const rng = createRng(`pool:${seed}`);
  for (let i = 0; i < generatedCount; i++) {
    const base = 35 + Math.floor(rng() * 46); // 35-80, med spridning per attribut ovanpå
    const ratings = {} as PlayerRatings;
    for (const key of ATTR_KEYS) {
      ratings[key] = Math.min(85, Math.max(35, base + Math.floor(rng() * 11) - 5));
    }
    const name = `${FREE_AGENT_NAMES[Math.floor(rng() * FREE_AGENT_NAMES.length)]!} ${i + 1}`;
    pool.push(toPoolPlayer(`generated:${i}`, "generated", null, name, ratings));
  }

  return pool;
}

export type SquadCheck = { ok: true } | { ok: false; error: string };

// Meddelandena går rakt ut till managern, så de är på svenska.
export function validateSquad(
  keys: readonly string[],
  pool: readonly PoolPlayer[],
  takenByOthers: ReadonlySet<string>,
  budget = SEASON_BUDGET
): SquadCheck {
  if (keys.length !== SQUAD_SIZE) {
    return { ok: false, error: `Ett lag ska ha exakt ${SQUAD_SIZE} gubbar.` };
  }

  if (new Set(keys).size !== keys.length) {
    return { ok: false, error: "Samma gubbe kan inte väljas två gånger." };
  }

  const byKey = new Map(pool.map((p) => [p.key, p]));
  const picked: PoolPlayer[] = [];

  for (const key of keys) {
    const player = byKey.get(key);
    if (!player) return { ok: false, error: "En av gubbarna finns inte i säsongens pool." };
    // Knappheten är det som ger transfermarknaden mening: samma gubbe kan inte
    // spela för två lag samtidigt.
    if (takenByOthers.has(key)) {
      return { ok: false, error: `${player.name} är redan skriven på ett annat lag.` };
    }
    picked.push(player);
  }

  const cost = squadCost(picked);
  if (cost > budget) {
    return {
      ok: false,
      error: `Laget kostar ${cost} men budgeten är ${budget}.`,
    };
  }

  return { ok: true };
}
