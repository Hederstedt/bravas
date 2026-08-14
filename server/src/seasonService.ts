import {
  activeSeason,
  anyFixturePlayed,
  createSeason,
  createTeam,
  getTeam,
  keysTakenByOtherTeams,
  listPool,
  listTeams,
  savePool,
  setFunds,
  setSquad,
  squadOf,
  type SeasonPlayerRow,
  type SeasonRow,
  type TeamRow,
} from "./db.ts";
import type { PlayerRatings } from "./matchSim.ts";
import { publicFixtures, seasonTable, type PublicFixture } from "./leagueService.ts";
import type { TableRow } from "./league.ts";
import { getCards } from "./statsService.ts";
import {
  buildPool,
  SEASON_BUDGET,
  SEASON_WEEKS,
  SQUAD_SIZE,
  squadCost,
  validateSquad,
  type PoolPlayer,
} from "./season.ts";
import { SELL_RATE } from "./market.ts";
import { transfersLeft } from "./marketService.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Så många fria agenter att alla gubbar kan bygga ett lag även om de sneglar
// på samma stjärnor. Tio managers gånger fem platser är femtio, och poolen
// ska vara större än så för att valet ska vara ett val.
const FREE_AGENTS = 60;

export interface PublicPlayer {
  key: string;
  source: string;
  name: string;
  ratings: PlayerRatings;
  value: number;
  takenBy: string | null;
}

function toPublic(row: SeasonPlayerRow, takenBy: string | null): PublicPlayer {
  return {
    key: row.player_key,
    source: row.source,
    name: row.name,
    ratings: JSON.parse(row.ratings_json) as PlayerRatings,
    value: row.value,
    takenBy,
  };
}

function toPoolPlayer(row: SeasonPlayerRow): PoolPlayer {
  return {
    key: row.player_key,
    source: row.source as PoolPlayer["source"],
    steamid64: row.steamid64,
    name: row.name,
    ratings: JSON.parse(row.ratings_json) as PlayerRatings,
    value: row.value,
  };
}

// Startar en säsong och fryser poolen. Historiska lag finns inte ännu — de
// kräver sparade ögonblicksbilder av tidigare säsonger, vilket det första
// varvet per definition saknar.
export async function startSeason(name: string): Promise<SeasonRow> {
  const existing = activeSeason();
  if (existing) return existing;

  const startsAt = Date.now();
  const season = createSeason(name, startsAt, startsAt + SEASON_WEEKS * WEEK_MS);

  const { cards } = await getCards();
  savePool(
    season.id,
    buildPool({
      members: cards,
      historical: [],
      generatedCount: FREE_AGENTS,
      seed: `${season.id}:${name}`,
    })
  );

  return season;
}

export interface SeasonView {
  season: SeasonRow | null;
  budget: number;
  squadSize: number;
  // Seriefas: första omgången är spelad, trupperna är låsta och all förändring
  // går via transfermarknaden.
  locked: boolean;
  sellRate: number;
  pool: PublicPlayer[];
  myTeam: {
    id: number;
    name: string;
    squad: PublicPlayer[];
    spent: number;
    funds: number;
    transfersLeft: number;
  } | null;
  teams: { id: number; name: string; manager: string }[];
  table: TableRow[];
  fixtures: PublicFixture[];
}

export function seasonView(steamid64: string | null): SeasonView {
  const season = activeSeason() ?? null;
  if (!season) {
    return {
      season: null,
      budget: SEASON_BUDGET,
      squadSize: SQUAD_SIZE,
      locked: false,
      sellRate: SELL_RATE,
      pool: [],
      myTeam: null,
      teams: [],
      table: [],
      fixtures: [],
    };
  }

  const teams = listTeams(season.id);
  // Vem som äger vilken spelare, så poolen kan visa det direkt i stället för
  // att managern får reda på det först när han försöker skriva på.
  const owner = new Map<string, string>();
  for (const team of teams) {
    for (const p of squadOf(team.id)) owner.set(p.player_key, team.name);
  }

  const mine = steamid64 ? getTeam(season.id, steamid64) : undefined;
  const squad = mine ? squadOf(mine.id).map((r) => toPublic(r, mine.name)) : [];

  return {
    season,
    budget: SEASON_BUDGET,
    squadSize: SQUAD_SIZE,
    locked: anyFixturePlayed(season.id),
    sellRate: SELL_RATE,
    pool: listPool(season.id).map((r) => toPublic(r, owner.get(r.player_key) ?? null)),
    myTeam: mine
      ? {
          id: mine.id,
          name: mine.name,
          squad,
          spent: squad.reduce((s, p) => s + p.value, 0),
          funds: mine.funds,
          transfersLeft: transfersLeft(season.id, mine.id),
        }
      : null,
    teams: teams.map((t) => ({ id: t.id, name: t.name, manager: t.manager_steamid64 })),
    table: seasonTable(season.id),
    fixtures: publicFixtures(season.id),
  };
}

// Trupperna låses när serien är igång — då går all förändring via transfer.
export function seasonLocked(seasonId: number): boolean {
  return anyFixturePlayed(seasonId);
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export function claimTeam(seasonId: number, steamid64: string, name: string): TeamRow | null {
  if (getTeam(seasonId, steamid64)) return null;
  return createTeam(seasonId, steamid64, name);
}

export function saveSquad(season: SeasonRow, team: TeamRow, keys: string[]): SaveResult {
  const pool = listPool(season.id).map(toPoolPlayer);
  const taken = keysTakenByOtherTeams(season.id, team.id);

  const check = validateSquad(keys, pool, taken);
  if (!check.ok) return check;

  try {
    setSquad(season.id, team.id, keys);
  } catch {
    // Unikhetskravet i databasen är sista ordet. Två managers som skriver på
    // samma gubbe i samma ögonblick tar sig förbi kontrollen ovan, och då är
    // det den som kommer sist som får nej.
    return { ok: false, error: "Någon hann före på en av gubbarna. Ladda om och försök igen." };
  }

  // Kassan är det som blev över av budgeten. Den sätts bara i byggfasen —
  // i seriefasen är truppen låst och pengarna rör sig via transfermarknaden.
  const cost = squadCost(pool.filter((p) => keys.includes(p.key)));
  setFunds(team.id, SEASON_BUDGET - cost);

  return { ok: true };
}

export function squadValue(teamId: number): number {
  return squadCost(squadOf(teamId).map(toPoolPlayer));
}
