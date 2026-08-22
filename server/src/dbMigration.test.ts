import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";

// Migrationerna körs vid import av db.ts, en gång per process. Testerna i
// övrigt startar från en tom databas — och en tom members-tabell är precis det
// läge där SQLite accepterar en ALTER som drift avvisar. Därför bygger det här
// testet upp den gamla databasen med en rad i, som i drift, innan db.ts läses
// in: annars är det inte migrationen som testas utan CREATE TABLE.
const dir = mkdtempSync(join(tmpdir(), "bravas-migration-"));
const dbPath = join(dir, "legacy.db");
process.env.DB_PATH = dbPath;

const STEAMID = "76561190000000042";
const OTHER_STEAMIDS = ["76561190000000044", "76561190000000045"];

beforeAll(() => {
  const legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE allowlist (
      steamid64 TEXT PRIMARY KEY,
      note TEXT,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE members (
      steamid64 TEXT PRIMARY KEY REFERENCES allowlist(steamid64),
      persona_name TEXT NOT NULL,
      avatar_url TEXT,
      discord_name TEXT,
      first_login INTEGER NOT NULL,
      last_login INTEGER NOT NULL,
      wot_account_id TEXT,
      wot_nickname TEXT
    );
    -- Lagen pekar på members med en främmande nyckel, och ombyggnaden släpper
    -- tabellen på vägen. Laget finns med här för att bevisa att managern sitter
    -- kvar på sitt lag efteråt i stället för att kaskaderas bort.
    CREATE TABLE seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      manager_steamid64 TEXT REFERENCES members(steamid64),
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      funds INTEGER NOT NULL DEFAULT 0,
      bot INTEGER NOT NULL DEFAULT 0,
      UNIQUE (season_id, manager_steamid64)
    );

    INSERT INTO allowlist (steamid64, note, added_at) VALUES ('${STEAMID}', 'gubbe', 1);
    INSERT INTO members (steamid64, persona_name, avatar_url, discord_name, first_login, last_login)
      VALUES ('${STEAMID}', 'Gubben', 'https://avatar', 'gubben', 1, 2);

    INSERT INTO seasons (id, created_at) VALUES (1, 1);
    INSERT INTO teams (season_id, manager_steamid64, name, created_at)
      VALUES (1, '${STEAMID}', 'Gubbarna FC', 1);
  `);

  const allow = legacy.prepare(
    "INSERT INTO allowlist (steamid64, note, added_at) VALUES (?, 'gubbe', 1)"
  );
  const member = legacy.prepare(
    "INSERT INTO members (steamid64, persona_name, first_login, last_login) VALUES (?, ?, 1, 2)"
  );
  for (const id of OTHER_STEAMIDS) {
    allow.run(id);
    member.run(id, `Gubbe ${id.slice(-2)}`);
  }

  legacy.close();
});

it("ger befintliga medlemmar ett public_id i stället för att krascha vid start", async () => {
  const { db } = await import("./db.ts");

  const row = db.prepare("SELECT public_id FROM members WHERE steamid64 = ?").get(STEAMID) as {
    public_id: string | null;
  };
  expect(row.public_id).toBeTruthy();
});

it("behåller förvalet, så en insert utan public_id ändå får ett id", async () => {
  const { db } = await import("./db.ts");

  db.prepare("INSERT INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
    "76561190000000043",
    "ny gubbe",
    1
  );
  db.prepare(
    "INSERT INTO members (steamid64, persona_name, first_login, last_login) VALUES (?, ?, ?, ?)"
  ).run("76561190000000043", "Nya gubben", 1, 2);

  const row = db.prepare("SELECT public_id FROM members WHERE steamid64 = ?").get(
    "76561190000000043"
  ) as { public_id: string | null };
  expect(row.public_id).toBeTruthy();
});

it("håller public_id unikt", async () => {
  const { db } = await import("./db.ts");

  const indexes = db.pragma("index_list(members)") as { name: string; unique: number }[];
  expect(indexes.some((i) => i.name === "idx_members_public_id" && i.unique === 1)).toBe(true);
});

it("tappar inte medlemmens övriga uppgifter under migrationen", async () => {
  const { getMember } = await import("./db.ts");

  expect(getMember(STEAMID)).toMatchObject({
    persona_name: "Gubben",
    avatar_url: "https://avatar",
    discord_name: "gubben",
    first_login: 1,
    last_login: 2,
  });
});

it("tappar ingen medlem, och ger var och en ett eget id", async () => {
  const { db } = await import("./db.ts");

  // Bara de inseedade raderna räknas — ett annat test här skriver in en egen
  // medlem, och den här kontrollen handlar om vad migrationen tog med sig.
  const seeded = [STEAMID, ...OTHER_STEAMIDS];
  const rows = db
    .prepare(
      `SELECT steamid64, public_id FROM members WHERE steamid64 IN (${seeded.map(() => "?").join(",")})`
    )
    .all(...seeded) as { steamid64: string; public_id: string | null }[];

  expect(rows.map((r) => r.steamid64).sort()).toEqual([...seeded].sort());
  expect(new Set(rows.map((r) => r.public_id)).size).toBe(seeded.length);
});

it("låter laget behålla sin manager när members byggs om", async () => {
  const { db } = await import("./db.ts");

  const team = db
    .prepare("SELECT manager_steamid64 FROM teams WHERE name = ?")
    .get("Gubbarna FC") as { manager_steamid64: string | null };
  expect(team.manager_steamid64).toBe(STEAMID);
  expect(db.pragma("foreign_key_check")).toEqual([]);
});
