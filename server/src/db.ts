import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.ts";
import type { PoolPlayer } from "./season.ts";

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
// Utan detta ignorerar SQLite ON DELETE CASCADE och röster blir kvar som skräp
// när ett citat tas bort.
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS allowlist (
    steamid64 TEXT PRIMARY KEY,
    note TEXT,
    added_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    steamid64 TEXT PRIMARY KEY REFERENCES allowlist(steamid64),
    persona_name TEXT NOT NULL,
    avatar_url TEXT,
    discord_name TEXT,
    first_login INTEGER NOT NULL,
    last_login INTEGER NOT NULL
  );

  -- Steams stats-anrop är ett per medlem och tar tid. Svaren cachas här så
  -- sidan svarar direkt, och så att en Steam-nedgång inte tömmer Siffrorna.
  CREATE TABLE IF NOT EXISTS cs2_stats (
    steamid64 TEXT PRIMARY KEY,
    stats_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    said_by TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Primärnyckeln är (citat, medlem): en röst per person och citat, upprätthållet
  -- av databasen i stället för av applikationslogik som kan tappas bort.
  CREATE TABLE IF NOT EXISTS quote_votes (
    quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    steamid64 TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (quote_id, steamid64)
  );

  -- ---------- Managerspelet ----------

  CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    -- upcoming | active | finished
    status TEXT NOT NULL
  );

  -- Spelarpoolen fryses vid säsongsstart. Betygen ligger som JSON eftersom de
  -- är sex fält som alltid läses tillsammans och aldrig frågas på var för sig.
  CREATE TABLE IF NOT EXISTS season_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    player_key TEXT NOT NULL,
    source TEXT NOT NULL,
    steamid64 TEXT,
    name TEXT NOT NULL,
    ratings_json TEXT NOT NULL,
    value INTEGER NOT NULL,
    UNIQUE (season_id, player_key)
  );

  -- En gubbe managar ett lag per säsong, upprätthållet av databasen.
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    manager_steamid64 TEXT NOT NULL REFERENCES members(steamid64),
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (season_id, manager_steamid64)
  );

  -- Primärnyckeln på spelaren, inte på paret: en spelare kan bara vara skriven
  -- på ett lag i taget. Det är knappheten som gör transfermarknaden meningsfull,
  -- och den upprätthålls här i stället för i applikationslogik som kan tappas.
  CREATE TABLE IF NOT EXISTS squads (
    season_player_id INTEGER PRIMARY KEY REFERENCES season_players(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_squads_team ON squads(team_id);
`);

export interface Member {
  steamid64: string;
  persona_name: string;
  avatar_url: string | null;
  discord_name: string | null;
  first_login: number;
  last_login: number;
}

export function isAllowlisted(steamid64: string): boolean {
  return db.prepare("SELECT 1 FROM allowlist WHERE steamid64 = ?").get(steamid64) !== undefined;
}

export function upsertMemberLogin(input: { steamid64: string; personaName: string; avatarUrl: string | null }): Member {
  const now = Date.now();
  db.prepare(
    `INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login)
     VALUES (@steamid64, @personaName, @avatarUrl, @now, @now)
     ON CONFLICT(steamid64) DO UPDATE SET
       persona_name = @personaName,
       avatar_url = @avatarUrl,
       last_login = @now`
  ).run({ ...input, now });
  return db.prepare("SELECT * FROM members WHERE steamid64 = ?").get(input.steamid64) as Member;
}

export function setDiscordName(steamid64: string, discordName: string): void {
  db.prepare("UPDATE members SET discord_name = ? WHERE steamid64 = ?").run(discordName, steamid64);
}

export function listMembers(): Member[] {
  return db.prepare("SELECT * FROM members ORDER BY persona_name COLLATE NOCASE").all() as Member[];
}

export function getMember(steamid64: string): Member | undefined {
  return db.prepare("SELECT * FROM members WHERE steamid64 = ?").get(steamid64) as Member | undefined;
}

export function saveCs2Stats(steamid64: string, stats: Record<string, number>): void {
  db.prepare(
    `INSERT INTO cs2_stats (steamid64, stats_json, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(steamid64) DO UPDATE SET stats_json = excluded.stats_json, fetched_at = excluded.fetched_at`
  ).run(steamid64, JSON.stringify(stats), Date.now());
}

export interface CachedStats {
  steamid64: string;
  stats: Record<string, number>;
  fetchedAt: number;
}

export function readCs2Stats(): CachedStats[] {
  const rows = db.prepare("SELECT steamid64, stats_json, fetched_at FROM cs2_stats").all() as {
    steamid64: string;
    stats_json: string;
    fetched_at: number;
  }[];
  return rows.map((r) => ({
    steamid64: r.steamid64,
    stats: JSON.parse(r.stats_json) as Record<string, number>,
    fetchedAt: r.fetched_at,
  }));
}

// ---------- Managerspelet ----------

export interface SeasonRow {
  id: number;
  name: string;
  starts_at: number;
  ends_at: number;
  status: string;
}

export function activeSeason(): SeasonRow | undefined {
  return db.prepare("SELECT * FROM seasons WHERE status = 'active' ORDER BY starts_at DESC").get() as
    | SeasonRow
    | undefined;
}

export function createSeason(name: string, startsAt: number, endsAt: number): SeasonRow {
  const info = db
    .prepare("INSERT INTO seasons (name, starts_at, ends_at, status) VALUES (?, ?, ?, 'active')")
    .run(name, startsAt, endsAt);
  return db.prepare("SELECT * FROM seasons WHERE id = ?").get(info.lastInsertRowid) as SeasonRow;
}

export interface SeasonPlayerRow {
  id: number;
  season_id: number;
  player_key: string;
  source: string;
  steamid64: string | null;
  name: string;
  ratings_json: string;
  value: number;
}

// Hela poolen skrivs i en transaktion: en halvskriven pool vore värre än ingen,
// eftersom säsongen då startat med ett godtyckligt urval spelare.
export const savePool = db.transaction((seasonId: number, players: readonly PoolPlayer[]) => {
  const insert = db.prepare(
    `INSERT INTO season_players (season_id, player_key, source, steamid64, name, ratings_json, value)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(season_id, player_key) DO NOTHING`
  );
  for (const p of players) {
    insert.run(seasonId, p.key, p.source, p.steamid64, p.name, JSON.stringify(p.ratings), p.value);
  }
});

export function listPool(seasonId: number): SeasonPlayerRow[] {
  return db
    .prepare("SELECT * FROM season_players WHERE season_id = ? ORDER BY value DESC, name COLLATE NOCASE")
    .all(seasonId) as SeasonPlayerRow[];
}

export interface TeamRow {
  id: number;
  season_id: number;
  manager_steamid64: string;
  name: string;
  created_at: number;
}

export function getTeam(seasonId: number, steamid64: string): TeamRow | undefined {
  return db
    .prepare("SELECT * FROM teams WHERE season_id = ? AND manager_steamid64 = ?")
    .get(seasonId, steamid64) as TeamRow | undefined;
}

export function listTeams(seasonId: number): TeamRow[] {
  return db
    .prepare("SELECT * FROM teams WHERE season_id = ? ORDER BY created_at")
    .all(seasonId) as TeamRow[];
}

export function createTeam(seasonId: number, steamid64: string, name: string): TeamRow {
  const info = db
    .prepare("INSERT INTO teams (season_id, manager_steamid64, name, created_at) VALUES (?, ?, ?, ?)")
    .run(seasonId, steamid64, name, Date.now());
  return db.prepare("SELECT * FROM teams WHERE id = ?").get(info.lastInsertRowid) as TeamRow;
}

export function squadOf(teamId: number): SeasonPlayerRow[] {
  return db
    .prepare(
      `SELECT p.* FROM squads s
       JOIN season_players p ON p.id = s.season_player_id
       WHERE s.team_id = ?
       ORDER BY p.value DESC`
    )
    .all(teamId) as SeasonPlayerRow[];
}

// Vilka nycklar som är upptagna av någon annan än det här laget. Driver
// knapphetsregeln i validateSquad.
export function keysTakenByOtherTeams(seasonId: number, teamId: number): Set<string> {
  const rows = db
    .prepare(
      `SELECT p.player_key FROM squads s
       JOIN season_players p ON p.id = s.season_player_id
       WHERE p.season_id = ? AND s.team_id != ?`
    )
    .all(seasonId, teamId) as { player_key: string }[];
  return new Set(rows.map((r) => r.player_key));
}

// Byter ut hela truppen på en gång. Att radera först och sedan lägga till i en
// transaktion är det enda sättet att byta två gubbar mot varandra utan att
// kollidera med unikhetskravet mitt i.
export const setSquad = db.transaction((seasonId: number, teamId: number, keys: readonly string[]) => {
  db.prepare("DELETE FROM squads WHERE team_id = ?").run(teamId);
  const lookup = db.prepare("SELECT id FROM season_players WHERE season_id = ? AND player_key = ?");
  const insert = db.prepare("INSERT INTO squads (season_player_id, team_id) VALUES (?, ?)");
  for (const key of keys) {
    const row = lookup.get(seasonId, key) as { id: number } | undefined;
    if (!row) throw new Error(`Okänd spelare i truppen: ${key}`);
    insert.run(row.id, teamId);
  }
});
