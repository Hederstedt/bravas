import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.ts";
import type { Fixture } from "./league.ts";
import { SEASON_BUDGET, type PoolPlayer } from "./season.ts";

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

  -- public_id är det opaka id som visas publikt i stället för steamid64 (se
  -- GET /api/members). Förvalet gör att en rad skriven utan att nämna
  -- kolumnen ändå får ett giltigt id; upsertMemberLogin sätter ändå alltid
  -- ett eget explicit. Unikheten ligger i ett index i stället för i kolumnen,
  -- så att migrationen nedan kan bygga om tabellen med samma definition.
  CREATE TABLE IF NOT EXISTS members (
    steamid64 TEXT PRIMARY KEY REFERENCES allowlist(steamid64),
    public_id TEXT DEFAULT (lower(hex(randomblob(16)))),
    persona_name TEXT NOT NULL,
    avatar_url TEXT,
    discord_name TEXT,
    first_login INTEGER NOT NULL,
    last_login INTEGER NOT NULL
  );

  -- Den som inte står i allowlisten kan ansöka i stället för att mötas av en
  -- vägg. persona_name och avatar_url hämtas från Steam vid ansökan, aldrig
  -- från formuläret, så ingen kan utge sig för någon annan.
  --
  -- Ansökningar raderas aldrig, bara statusmärks (pending/approved/rejected),
  -- så historiken finns kvar. Ett godkännande skriver bara allowlisten —
  -- members-raden skapas av inloggningen som vanligt.
  CREATE TABLE IF NOT EXISTS applications (
    steamid64 TEXT PRIMARY KEY,
    persona_name TEXT NOT NULL,
    avatar_url TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );

  -- Steams stats-anrop är ett per medlem och tar tid. Svaren cachas här så
  -- sidan svarar direkt, och så att en Steam-nedgång inte tömmer Siffrorna.
  CREATE TABLE IF NOT EXISTS cs2_stats (
    steamid64 TEXT PRIMARY KEY,
    stats_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  -- Valheim exponerar varken räknare eller achievements (kollat mot Steams
  -- schema), så speltid är den enda per-gubbe-siffran som finns att hämta —
  -- Steams eget livstidsräkneverk (GetOwnedGames), inte vår serverpoller.
  CREATE TABLE IF NOT EXISTS valheim_playtime (
    steamid64 TEXT PRIMARY KEY,
    minutes INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  -- Wargamings kontostatistik, nyckeln är wot_account_id (inte steamid64 —
  -- Steam och Wargaming är skilda identiteter, kopplade via länkningen i
  -- members). Samma cache-mönster som cs2_stats.
  CREATE TABLE IF NOT EXISTS wot_stats (
    wot_account_id TEXT PRIMARY KEY,
    stats_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  -- Spelservern frågas var 45:e sekund och svaret kastades förr bort. Sparat
  -- blir det statistik ingen annan klan har: när är det fullast, hur länge
  -- håller servern, hur många gubbtimmar har det blivit.
  --
  -- En rad skrivs när läget ändras, plus en pulsrad med jämna mellanrum även
  -- när inget händer. Pulsen är det som gör tiden mätbar: mellan två rader vet
  -- vi vad som gällde, och ett glapp större än pulsen betyder att API:et var
  -- nere — den tiden ska inte räknas som något alls.
  CREATE TABLE IF NOT EXISTS valheim_samples (
    at INTEGER PRIMARY KEY,
    online INTEGER NOT NULL,
    players INTEGER NOT NULL
  );

  -- Vem som spelade vad, och när. Steam berättar det var 45:e sekund och
  -- svaret kastades förr bort så fort prickarna ritats om.
  --
  -- Sparat blir det underlaget för tvärspelspoängen: den som faktiskt lirar
  -- med klanen får mer att göra i managern. Bara medlemmar som är inne i ett
  -- spel skrivs — "online men inte i något spel" är inte aktivitet.
  --
  -- Samma pulsregel som valheim_samples: en rad när spelet byts, plus en med
  -- jämna mellanrum så att tiden går att mäta och glapp går att känna igen.
  CREATE TABLE IF NOT EXISTS presence_samples (
    at INTEGER NOT NULL,
    steamid64 TEXT NOT NULL,
    game TEXT NOT NULL,
    PRIMARY KEY (at, steamid64)
  );

  CREATE INDEX IF NOT EXISTS idx_presence_samples_member ON presence_samples(steamid64, at);

  -- Vem som synts i Discord-widgeten, och när. Egen tabell i stället för en
  -- rad till i presence_samples: den har bara ett läge ("synlig"), inget
  -- "game"-fält, och medvetet skild från Steam-närvaron — en gubbe kan mycket
  -- väl sitta i röstchatt och spela CS2 samtidigt, och skulle de dela ström
  -- hade den ena skrivningen hela tiden avbrutit den andras spann.
  CREATE TABLE IF NOT EXISTS discord_samples (
    at INTEGER NOT NULL,
    steamid64 TEXT NOT NULL,
    PRIMARY KEY (at, steamid64)
  );

  CREATE INDEX IF NOT EXISTS idx_discord_samples_member ON discord_samples(steamid64, at);

  -- Månadens BVS:are. Ett kryss per månad — tabellen är sin egen markör:
  -- kröningsjobbet räknar om en avslutad månad bara om den saknar en rad här,
  -- vilket gör hela mekaniken omstartssäker utan extra state.
  CREATE TABLE IF NOT EXISTS bvs_month (
    month TEXT PRIMARY KEY,          -- 'YYYY-MM'
    steamid64 TEXT NOT NULL,
    score REAL NOT NULL,
    decided_at INTEGER NOT NULL
  );

  -- Månadens övriga utmärkelser: träskeden och de tre skämtutmärkelserna.
  -- En rad per utmärkelse i stället för kolumner på bvs_month — nästa
  -- utmärkelse blir då en rad, inte en migrering. Egen tabell och inte en
  -- kolumn också för att de här, till skillnad från vinnaren, bara visas för
  -- inloggade medlemmar.
  CREATE TABLE IF NOT EXISTS bvs_month_awards (
    month TEXT NOT NULL,             -- 'YYYY-MM'
    award TEXT NOT NULL,             -- 'jumbo' | 'sofflocket' | 'enkelsparet' | 'vindflojeln'
    steamid64 TEXT NOT NULL,
    value REAL NOT NULL,             -- talet som vann den, till förklaringstexten
    decided_at INTEGER NOT NULL,
    PRIMARY KEY (month, award)
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    said_by TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Klippen. Adressen som klistrades in sparas aldrig: den tolkas till en
  -- leverantör och ett id (se clipUrl.ts), och vyn bygger sin embed-adress ur
  -- en fast mall. Det finns alltså ingen väg från något någon skrivit in till
  -- något som hamnar i ett src-attribut.
  --
  -- Unikhetskravet på paret gör att samma klipp inte kan läggas upp två
  -- gånger — två identiska kort i galleriet ser ut som ett fel.
  CREATE TABLE IF NOT EXISTS clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (provider, video_id)
  );

  -- Samma form som quote_votes, av samma skäl: en röst per person och klipp,
  -- upprätthållet av databasen.
  CREATE TABLE IF NOT EXISTS clip_votes (
    clip_id INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    steamid64 TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (clip_id, steamid64)
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
  --
  -- manager_steamid64 är null för botlagen: de fylls på så att en ensam
  -- manager har någon att möta. SQLite räknar nullvärden som olika i ett
  -- unikhetskrav, så flera botlag ryms per säsong utan att kravet luckras
  -- upp för de riktiga gubbarna.
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    manager_steamid64 TEXT REFERENCES members(steamid64),
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    bot INTEGER NOT NULL DEFAULT 0,
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

  -- Spelschemat läggs en gång när säsongen drar igång. played_at null betyder
  -- att matchen inte spelats än; rapporten är hela MatchResult som JSON så att
  -- referatet kan läsas om utan att simuleras på nytt.
  CREATE TABLE IF NOT EXISTS fixtures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    matchday INTEGER NOT NULL,
    home_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    away_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    played_at INTEGER,
    home_score INTEGER,
    away_score INTEGER,
    report_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_fixtures_season ON fixtures(season_id, matchday);

  -- Transferloggen är både historik och kvoträkning: en transfer per lag och
  -- ospelad omgång räknas med COUNT på samma rader som berättar vad som hände,
  -- i stället för en separat räknare som kan glida isär.
  CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    matchday INTEGER NOT NULL,
    sold_player_id INTEGER NOT NULL REFERENCES season_players(id),
    bought_player_id INTEGER NOT NULL REFERENCES season_players(id),
    sold_for INTEGER NOT NULL,
    bought_for INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_transfers_team_day ON transfers(team_id, matchday);

  -- Träningsloggen är kvoträkning på samma sätt som transferloggen: två pass
  -- per lag och ospelad omgång räknas med COUNT på raderna som är historiken.
  CREATE TABLE IF NOT EXISTS training_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    season_player_id INTEGER NOT NULL REFERENCES season_players(id),
    matchday INTEGER NOT NULL,
    attr TEXT NOT NULL,
    gain INTEGER NOT NULL,
    rating_after INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_training_team_day ON training_sessions(team_id, matchday);
`);

// WoT-länkningen kom efter members-tabellen och produktionen har redan
// medlemmar, så kolumnerna läggs till guardat i stället för i CREATE TABLE.
const memberColumns = db.pragma("table_info(members)") as { name: string }[];
if (!memberColumns.some((c) => c.name === "wot_account_id")) {
  db.exec("ALTER TABLE members ADD COLUMN wot_account_id TEXT");
  db.exec("ALTER TABLE members ADD COLUMN wot_nickname TEXT");
}

// public_id kom efter members-tabellen och produktionen har redan medlemmar.
// Kolumnen går inte att lägga till med ALTER: förvalet är slumpat, och SQLite
// vägrar "ADD COLUMN ... DEFAULT (lower(hex(randomblob(16))))" så fort tabellen
// har rader att fylla i det på. Att den ändå gick igenom i testerna beror på
// att en tom tabell aldrig behöver räkna ut förvalet — samma sats som var grön
// i CI kraschade alltså vid start i drift. Alltså byggs tabellen om, precis
// som teams nedan: den nya tabellen har förvalet med sig från CREATE TABLE
// (där det är tillåtet) och varje kopierad rad får sitt eget id av att
// INSERT:en inte nämner kolumnen. Främmande nycklar stängs av under bytet —
// teams.manager_steamid64 pekar hit och skulle annars kaskadera.
if (!memberColumns.some((c) => c.name === "public_id")) {
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    db.exec(`
      CREATE TABLE members_rebuilt (
        steamid64 TEXT PRIMARY KEY REFERENCES allowlist(steamid64),
        public_id TEXT DEFAULT (lower(hex(randomblob(16)))),
        persona_name TEXT NOT NULL,
        avatar_url TEXT,
        discord_name TEXT,
        first_login INTEGER NOT NULL,
        last_login INTEGER NOT NULL,
        wot_account_id TEXT,
        wot_nickname TEXT
      );
      INSERT INTO members_rebuilt (
        steamid64, persona_name, avatar_url, discord_name,
        first_login, last_login, wot_account_id, wot_nickname
      )
        SELECT steamid64, persona_name, avatar_url, discord_name,
               first_login, last_login, wot_account_id, wot_nickname
        FROM members;
      DROP TABLE members;
      ALTER TABLE members_rebuilt RENAME TO members;
    `);
  })();
  db.pragma("foreign_keys = ON");
}

// Utanför guarden ovan: en färsk databas får kolumnen från CREATE TABLE och
// går aldrig in i ombyggnaden, men behöver indexet lika mycket.
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_members_public_id ON members(public_id)");

// Lagkassan kom efter teams-tabellen och produktionen har redan lag, så
// kolumnen läggs till guardat och fylls i från truppens värde: det som är
// kvar av budgeten är budgeten minus det truppen kostade.
const teamColumns = db.pragma("table_info(teams)") as { name: string }[];
if (!teamColumns.some((c) => c.name === "funds")) {
  db.exec("ALTER TABLE teams ADD COLUMN funds INTEGER NOT NULL DEFAULT 0");
  db.exec(`
    UPDATE teams SET funds = ${SEASON_BUDGET} - COALESCE(
      (SELECT SUM(p.value) FROM squads s
       JOIN season_players p ON p.id = s.season_player_id
       WHERE s.team_id = teams.id),
      0
    )
  `);
}

// Botlagen kom efter teams-tabellen, och de behöver två ändringar som inte går
// att lägga till med ALTER: manager_steamid64 måste tåla null, och bot-flaggan
// tillkommer. Alltså byggs tabellen om. Främmande nycklar stängs av under
// bytet — annars skulle DROP TABLE kaskadradera trupper, matcher, affärer och
// träningspass som pekar på lagen.
if (!teamColumns.some((c) => c.name === "bot")) {
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    db.exec(`
      CREATE TABLE teams_rebuilt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        manager_steamid64 TEXT REFERENCES members(steamid64),
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        funds INTEGER NOT NULL DEFAULT 0,
        bot INTEGER NOT NULL DEFAULT 0,
        UNIQUE (season_id, manager_steamid64)
      );
      INSERT INTO teams_rebuilt (id, season_id, manager_steamid64, name, created_at, funds)
        SELECT id, season_id, manager_steamid64, name, created_at, funds FROM teams;
      DROP TABLE teams;
      ALTER TABLE teams_rebuilt RENAME TO teams;
    `);
  })();
  db.pragma("foreign_keys = ON");
}

export interface Member {
  steamid64: string;
  public_id: string;
  persona_name: string;
  avatar_url: string | null;
  discord_name: string | null;
  wot_account_id: string | null;
  wot_nickname: string | null;
  first_login: number;
  last_login: number;
}

export function isAllowlisted(steamid64: string): boolean {
  return db.prepare("SELECT 1 FROM allowlist WHERE steamid64 = ?").get(steamid64) !== undefined;
}

// isNew skiljer den allra första inloggningen från alla senare. Callbacken
// använder den för att skicka en ny gubbe till kontosidan i stället för hem —
// servern vet det här, så frontenden behöver ingen egen minnesanteckning.
export function upsertMemberLogin(input: {
  steamid64: string;
  personaName: string;
  avatarUrl: string | null;
}): { member: Member; isNew: boolean } {
  const now = Date.now();
  const existed =
    db.prepare("SELECT 1 FROM members WHERE steamid64 = ?").get(input.steamid64) !== undefined;
  // publicId genereras varje gång men skrivs bara in på INSERT-grenen — ON
  // CONFLICT-satsen nämner den aldrig, så en omloggning kan inte råka byta ut
  // ett redan utdelat publikt id.
  db.prepare(
    `INSERT INTO members (steamid64, public_id, persona_name, avatar_url, first_login, last_login)
     VALUES (@steamid64, @publicId, @personaName, @avatarUrl, @now, @now)
     ON CONFLICT(steamid64) DO UPDATE SET
       persona_name = @personaName,
       avatar_url = @avatarUrl,
       last_login = @now`
  ).run({ ...input, publicId: randomUUID(), now });
  const member = db
    .prepare("SELECT * FROM members WHERE steamid64 = ?")
    .get(input.steamid64) as Member;
  return { member, isNew: !existed };
}

export type ApplicationStatus = "pending" | "approved" | "rejected";

export interface Application {
  steamid64: string;
  persona_name: string;
  avatar_url: string | null;
  message: string;
  status: ApplicationStatus;
  created_at: number;
}

// En andra ansökan ersätter den första i stället för att kollidera på
// primärnyckeln — den som skrivit slarvigt ska kunna förtydliga sig, och en
// avslagen ansökan ska gå att göra om.
export function upsertApplication(input: {
  steamid64: string;
  personaName: string;
  avatarUrl: string | null;
  message: string;
}): void {
  db.prepare(
    `INSERT INTO applications (steamid64, persona_name, avatar_url, message, status, created_at)
     VALUES (@steamid64, @personaName, @avatarUrl, @message, 'pending', @now)
     ON CONFLICT(steamid64) DO UPDATE SET
       persona_name = @personaName,
       avatar_url = @avatarUrl,
       message = @message,
       status = 'pending',
       created_at = @now`
  ).run({ ...input, now: Date.now() });
}

// Bara väntande — de avgjorda ligger kvar i tabellen som historik, men ska
// inte dyka upp igen i admins kö med Godkänn/Avslå-knappar vid varje sidladdning.
export function listApplications(): Application[] {
  return db
    .prepare(`SELECT * FROM applications WHERE status = 'pending' ORDER BY created_at DESC`)
    .all() as Application[];
}

export function getApplication(steamid64: string): Application | undefined {
  return db.prepare("SELECT * FROM applications WHERE steamid64 = ?").get(steamid64) as
    | Application
    | undefined;
}

// Godkännande skriver allowlisten och inget mer. Members-raden skapas av
// Steam-callbacken nästa gång de loggar in, precis som för alla andra.
export function approveApplication(steamid64: string): boolean {
  const application = getApplication(steamid64);
  if (!application) return false;

  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
      steamid64,
      application.persona_name,
      Date.now()
    );
    db.prepare("UPDATE applications SET status = 'approved' WHERE steamid64 = ?").run(steamid64);
  })();
  return true;
}

export function rejectApplication(steamid64: string): boolean {
  const info = db
    .prepare("UPDATE applications SET status = 'rejected' WHERE steamid64 = ?")
    .run(steamid64);
  return info.changes > 0;
}

// Ordningen är tvingande, inte en stilfråga: members.steamid64 är en främmande
// nyckel in i allowlist och teams.manager_steamid64 en in i members, med
// foreign_keys = ON. Lagen släpper därför sin manager först, sedan går medlemmen
// och sist allowlist-raden.
//
// Historiken (citat, ligatabeller, matchreferat) raderas aldrig när någon
// slutar — bara namnet kopplas loss. Citaten är redan anonyma (said_by är
// fritext, submitted_by visas aldrig publikt, se quotes.ts), så de rörs inte
// här. Manager-poolens namn däremot är den avgångnes riktiga persona_name,
// fryst vid säsongsstart och synligt för vem som helst — den anonymiseras.
export const ANONYMIZED_MEMBER_LABEL = "Tidigare medlem";

interface AnonymizablePlayerLine {
  id: string;
  name: string;
}

interface AnonymizableReport {
  scoreboard?: { home: AnonymizablePlayerLine[]; away: AnonymizablePlayerLine[] };
  mvp?: AnonymizablePlayerLine | null;
}

// player_key för en medlem är "member:<public_id>" (se season.ts) — namnet
// fryses in på två ställen: raden i season_players (poolen/truppvyn) och,
// separat, som en egen kopia inuti varje redan spelad matchs report_json.
// Båda måste skrivas om, annars dyker det riktiga namnet upp igen så fort
// någon öppnar ett gammalt matchreferat.
function anonymizeManagerHistory(publicId: string): void {
  const playerKey = `member:${publicId}`;

  db.prepare("UPDATE season_players SET name = ? WHERE steamid64 = ? AND source = 'member'").run(
    ANONYMIZED_MEMBER_LABEL,
    publicId
  );

  const rename = (line: AnonymizablePlayerLine | null | undefined) =>
    line && line.id === playerKey ? { ...line, name: ANONYMIZED_MEMBER_LABEL } : line;

  const fixtures = db
    .prepare("SELECT id, report_json FROM fixtures WHERE report_json IS NOT NULL")
    .all() as { id: number; report_json: string }[];
  const update = db.prepare("UPDATE fixtures SET report_json = ? WHERE id = ?");

  for (const fixture of fixtures) {
    const report = JSON.parse(fixture.report_json) as AnonymizableReport;
    if (!report.scoreboard) continue; // Valöver har inget scoreboard att skriva om.

    const touched =
      report.scoreboard.home.some((p) => p.id === playerKey) ||
      report.scoreboard.away.some((p) => p.id === playerKey) ||
      report.mvp?.id === playerKey;
    if (!touched) continue;

    report.scoreboard.home = report.scoreboard.home.map((p) => rename(p)!);
    report.scoreboard.away = report.scoreboard.away.map((p) => rename(p)!);
    report.mvp = rename(report.mvp);
    update.run(JSON.stringify(report), fixture.id);
  }
}

// Laget självt blir kvar utan ägare i stället för att raderas — tabellen och
// ligahistoriken ska inte skrivas om för att någon slutat, bara namnet i den.
export function removeMember(steamid64: string): boolean {
  return db.transaction(() => {
    const member = getMember(steamid64);
    if (!member) return false;

    anonymizeManagerHistory(member.public_id);
    db.prepare("UPDATE teams SET manager_steamid64 = NULL WHERE manager_steamid64 = ?").run(
      steamid64
    );
    db.prepare("DELETE FROM members WHERE steamid64 = ?").run(steamid64);
    db.prepare("DELETE FROM allowlist WHERE steamid64 = ?").run(steamid64);
    return true;
  })();
}

export function setWotAccount(steamid64: string, wotAccountId: string, wotNickname: string): void {
  db.prepare("UPDATE members SET wot_account_id = ?, wot_nickname = ? WHERE steamid64 = ?").run(
    wotAccountId,
    wotNickname,
    steamid64
  );
}

export function setDiscordName(steamid64: string, discordName: string): void {
  db.prepare("UPDATE members SET discord_name = ? WHERE steamid64 = ?").run(discordName, steamid64);
}

export function clearDiscordName(steamid64: string): void {
  db.prepare("UPDATE members SET discord_name = NULL WHERE steamid64 = ?").run(steamid64);
}

// Rensar både kopplingen och den cachade statistiken för kontot — en
// wot_stats-rad ingen medlem längre pekar på är bara skräp som blir liggande.
export function clearWotAccount(steamid64: string): void {
  const member = getMember(steamid64);
  db.prepare("UPDATE members SET wot_account_id = NULL, wot_nickname = NULL WHERE steamid64 = ?").run(
    steamid64
  );
  if (!member?.wot_account_id) return;
  const stillLinked = db
    .prepare("SELECT 1 FROM members WHERE wot_account_id = ?")
    .get(member.wot_account_id);
  if (!stillLinked) {
    db.prepare("DELETE FROM wot_stats WHERE wot_account_id = ?").run(member.wot_account_id);
  }
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

// ---------- Valheim-historik ----------

export interface ValheimSample {
  at: number;
  online: number;
  players: number;
}

export function lastValheimSample(): ValheimSample | undefined {
  return db.prepare("SELECT * FROM valheim_samples ORDER BY at DESC LIMIT 1").get() as
    | ValheimSample
    | undefined;
}

// Tidsstämpeln är primärnyckel, så två avläsningar inom samma millisekund
// skulle krocka. Det händer inte i drift med 45 sekunders intervall, men en
// testsvit som skriver i en snabb loop ska inte kunna kasta.
export function recordValheimSample(at: number, online: boolean, players: number): void {
  db.prepare(
    "INSERT INTO valheim_samples (at, online, players) VALUES (?, ?, ?) ON CONFLICT(at) DO NOTHING"
  ).run(at, online ? 1 : 0, players);
}

export function listValheimSamples(since = 0): ValheimSample[] {
  return db
    .prepare("SELECT * FROM valheim_samples WHERE at >= ? ORDER BY at")
    .all(since) as ValheimSample[];
}

// ---------- Närvarohistorik ----------

export interface PresenceSample {
  at: number;
  steamid64: string;
  game: string;
}

export function lastPresenceSample(steamid64: string): PresenceSample | undefined {
  return db
    .prepare("SELECT * FROM presence_samples WHERE steamid64 = ? ORDER BY at DESC LIMIT 1")
    .get(steamid64) as PresenceSample | undefined;
}

export function recordPresenceSample(at: number, steamid64: string, game: string): void {
  db.prepare(
    "INSERT INTO presence_samples (at, steamid64, game) VALUES (?, ?, ?) ON CONFLICT(at, steamid64) DO NOTHING"
  ).run(at, steamid64, game);
}

export function listPresenceSamples(steamid64: string, since = 0): PresenceSample[] {
  return db
    .prepare("SELECT * FROM presence_samples WHERE steamid64 = ? AND at >= ? ORDER BY at")
    .all(steamid64, since) as PresenceSample[];
}

// ---------- Discord-widgeten ----------

export interface DiscordSample {
  at: number;
  steamid64: string;
}

export function lastDiscordSample(steamid64: string): DiscordSample | undefined {
  return db
    .prepare("SELECT * FROM discord_samples WHERE steamid64 = ? ORDER BY at DESC LIMIT 1")
    .get(steamid64) as DiscordSample | undefined;
}

export function recordDiscordSample(at: number, steamid64: string): void {
  db.prepare(
    "INSERT INTO discord_samples (at, steamid64) VALUES (?, ?) ON CONFLICT(at, steamid64) DO NOTHING"
  ).run(at, steamid64);
}

export function listDiscordSamples(steamid64: string, since = 0): DiscordSample[] {
  return db
    .prepare("SELECT * FROM discord_samples WHERE steamid64 = ? AND at >= ? ORDER BY at")
    .all(steamid64, since) as DiscordSample[];
}

// ---------- Månadens BVS:are ----------

export interface BvsMonthWinner {
  month: string;
  steamid64: string;
  score: number;
  decided_at: number;
}

export function getBvsMonthWinner(month: string): BvsMonthWinner | undefined {
  return db.prepare("SELECT * FROM bvs_month WHERE month = ?").get(month) as
    | BvsMonthWinner
    | undefined;
}

// Den regerande vinnaren: senast avgjorda månaden. Kortets stjärna och
// glittret pekar på den här, inte på innevarande (ännu inte avgjorda) månad.
export function getReigningBvsMonth(): BvsMonthWinner | undefined {
  return db.prepare("SELECT * FROM bvs_month ORDER BY month DESC LIMIT 1").get() as
    | BvsMonthWinner
    | undefined;
}

export function crownBvsMonth(input: { month: string; steamid64: string; score: number }): void {
  db.prepare(
    "INSERT INTO bvs_month (month, steamid64, score, decided_at) VALUES (?, ?, ?, ?)"
  ).run(input.month, input.steamid64, input.score, Date.now());
}

// ---------- Månadens övriga utmärkelser ----------

export interface MonthAward {
  month: string;
  award: string;
  steamid64: string;
  value: number;
  decided_at: number;
}

export function getMonthAwards(month: string): MonthAward[] {
  return db
    .prepare("SELECT * FROM bvs_month_awards WHERE month = ? ORDER BY award")
    .all(month) as MonthAward[];
}

// Utmärkelserna för den senast avgjorda månaden, alltså samma månad som
// getReigningBvsMonth pekar ut. Två frågor i stället för en join: bvs_month är
// sanningen om vilken månad som gäller, och utmärkelserna hänger på den.
export function getReigningAwards(): MonthAward[] {
  const reigning = getReigningBvsMonth();
  return reigning ? getMonthAwards(reigning.month) : [];
}

// Alla utmärkelser för en månad skrivs i ett svep. En delvis skriven månad
// hade sett ut som en färdig för idempotensvakten i monthlyPoller.ts, som
// nöjer sig med att det finns någon rad alls.
export function saveMonthAwards(
  month: string,
  rows: readonly { award: string; steamid64: string; value: number }[]
): void {
  const at = Date.now();
  const insert = db.prepare(
    "INSERT OR REPLACE INTO bvs_month_awards (month, award, steamid64, value, decided_at) VALUES (?, ?, ?, ?, ?)"
  );
  db.transaction(() => {
    for (const row of rows) insert.run(month, row.award, row.steamid64, row.value, at);
  })();
}

// När den senast spelade omgången avgjordes. Fönstret för tvärspelspoängen
// börjar där: timmar räknas sedan förra matchen, inte sedan tidernas begynnelse.
export function lastPlayedAt(seasonId: number): number | null {
  const row = db
    .prepare("SELECT MAX(played_at) AS at FROM fixtures WHERE season_id = ? AND played_at IS NOT NULL")
    .get(seasonId) as { at: number | null };
  return row.at;
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

export function saveValheimPlaytime(steamid64: string, minutes: number): void {
  db.prepare(
    `INSERT INTO valheim_playtime (steamid64, minutes, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(steamid64) DO UPDATE SET minutes = excluded.minutes, fetched_at = excluded.fetched_at`
  ).run(steamid64, minutes, Date.now());
}

export interface CachedPlaytime {
  steamid64: string;
  minutes: number;
  fetchedAt: number;
}

export function readValheimPlaytime(): CachedPlaytime[] {
  const rows = db.prepare("SELECT steamid64, minutes, fetched_at FROM valheim_playtime").all() as {
    steamid64: string;
    minutes: number;
    fetched_at: number;
  }[];
  return rows.map((r) => ({ steamid64: r.steamid64, minutes: r.minutes, fetchedAt: r.fetched_at }));
}

export function saveWotStats(wotAccountId: string, stats: Record<string, number>): void {
  db.prepare(
    `INSERT INTO wot_stats (wot_account_id, stats_json, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(wot_account_id) DO UPDATE SET stats_json = excluded.stats_json, fetched_at = excluded.fetched_at`
  ).run(wotAccountId, JSON.stringify(stats), Date.now());
}

export interface CachedWotStats {
  wotAccountId: string;
  stats: Record<string, number>;
  fetchedAt: number;
}

export function readWotStats(): CachedWotStats[] {
  const rows = db.prepare("SELECT wot_account_id, stats_json, fetched_at FROM wot_stats").all() as {
    wot_account_id: string;
    stats_json: string;
    fetched_at: number;
  }[];
  return rows.map((r) => ({
    wotAccountId: r.wot_account_id,
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

// Sista omgången är spelad. Utan det här steget står säsongen kvar som
// 'active' för alltid, lobbyn kommer aldrig tillbaka och det går inte att
// starta en ny säsong utan att gå in i databasen för hand.
export function finishSeason(seasonId: number): void {
  db.prepare("UPDATE seasons SET status = 'finished' WHERE id = ?").run(seasonId);
}

// Den senast färdigspelade säsongen, så att lobbyn kan visa förra tabellen i
// stället för att allt bara försvinner när serien tar slut.
export function lastFinishedSeason(): SeasonRow | undefined {
  return db
    .prepare("SELECT * FROM seasons WHERE status = 'finished' ORDER BY starts_at DESC LIMIT 1")
    .get() as SeasonRow | undefined;
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
  // Null för botlagen — de har ingen gubbe bakom sig.
  manager_steamid64: string | null;
  name: string;
  created_at: number;
  funds: number;
  bot: number;
}

export function setFunds(teamId: number, funds: number): void {
  db.prepare("UPDATE teams SET funds = ? WHERE id = ?").run(funds, teamId);
}

export function getTeam(seasonId: number, steamid64: string): TeamRow | undefined {
  return db
    .prepare("SELECT * FROM teams WHERE season_id = ? AND manager_steamid64 = ?")
    .get(seasonId, steamid64) as TeamRow | undefined;
}

export function getTeamById(id: number): TeamRow | undefined {
  return db.prepare("SELECT * FROM teams WHERE id = ?").get(id) as TeamRow | undefined;
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

// Ett botlag: ingen manager, bot-flaggan satt. Kassan sätts när truppen
// draftats, precis som för ett riktigt lag.
export function createBotTeam(seasonId: number, name: string): TeamRow {
  const info = db
    .prepare("INSERT INTO teams (season_id, manager_steamid64, name, created_at, bot) VALUES (?, NULL, ?, ?, 1)")
    .run(seasonId, name, Date.now());
  return db.prepare("SELECT * FROM teams WHERE id = ?").get(info.lastInsertRowid) as TeamRow;
}

// Alla nycklar som något lag i säsongen redan skrivit på. Driver botdraften:
// den ska bara välja bland gubbar som faktiskt är lediga.
export function takenKeys(seasonId: number): Set<string> {
  const rows = db
    .prepare(
      `SELECT p.player_key FROM squads s
       JOIN season_players p ON p.id = s.season_player_id
       WHERE p.season_id = ?`
    )
    .all(seasonId) as { player_key: string }[];
  return new Set(rows.map((r) => r.player_key));
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

export interface FixtureRow {
  id: number;
  season_id: number;
  matchday: number;
  home_team_id: number;
  away_team_id: number;
  played_at: number | null;
  home_score: number | null;
  away_score: number | null;
  report_json: string | null;
}

// Schemat läggs i en transaktion: ett halvlagt spelschema vore värre än inget,
// eftersom serien då startat med bara några av omgångarna.
export const saveFixtures = db.transaction((seasonId: number, fixtures: readonly Fixture[]) => {
  const insert = db.prepare(
    "INSERT INTO fixtures (season_id, matchday, home_team_id, away_team_id) VALUES (?, ?, ?, ?)"
  );
  for (const f of fixtures) insert.run(seasonId, f.matchday, f.home, f.away);
});

export function listFixtures(seasonId: number): FixtureRow[] {
  return db
    .prepare("SELECT * FROM fixtures WHERE season_id = ? ORDER BY matchday, id")
    .all(seasonId) as FixtureRow[];
}

export function getFixture(id: number): FixtureRow | undefined {
  return db.prepare("SELECT * FROM fixtures WHERE id = ?").get(id) as FixtureRow | undefined;
}

// Nästa omgång som inte spelats. null när serien är färdigspelad.
export function nextMatchday(seasonId: number): number | null {
  const row = db
    .prepare("SELECT MIN(matchday) AS day FROM fixtures WHERE season_id = ? AND played_at IS NULL")
    .get(seasonId) as { day: number | null };
  return row.day;
}

export function unplayedOnMatchday(seasonId: number, matchday: number): FixtureRow[] {
  return db
    .prepare(
      "SELECT * FROM fixtures WHERE season_id = ? AND matchday = ? AND played_at IS NULL ORDER BY id"
    )
    .all(seasonId, matchday) as FixtureRow[];
}

export function saveResult(
  fixtureId: number,
  homeScore: number,
  awayScore: number,
  report: unknown
): void {
  db.prepare(
    "UPDATE fixtures SET played_at = ?, home_score = ?, away_score = ?, report_json = ? WHERE id = ?"
  ).run(Date.now(), homeScore, awayScore, JSON.stringify(report), fixtureId);
}

// Skiljer byggfasen från seriefasen: så fort en match är spelad låses trupperna
// och all förändring går via transfermarknaden.
export function anyFixturePlayed(seasonId: number): boolean {
  return (
    db
      .prepare("SELECT 1 FROM fixtures WHERE season_id = ? AND played_at IS NOT NULL LIMIT 1")
      .get(seasonId) !== undefined
  );
}

export function transferCount(teamId: number, matchday: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM transfers WHERE team_id = ? AND matchday = ?")
    .get(teamId, matchday) as { n: number };
  return row.n;
}

export function trainingCount(teamId: number, matchday: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM training_sessions WHERE team_id = ? AND matchday = ?")
    .get(teamId, matchday) as { n: number };
  return row.n;
}

// Nya betyg, nytt värde och loggrad i en transaktion. Betygen uppdateras
// direkt i season_players, så matchsimuleringen plockar upp dem via truppen
// utan att veta att träning finns — och redan sparade rapporter simuleras
// aldrig om, så determinismen bryts inte.
export const applyTraining = db.transaction(
  (input: {
    seasonId: number;
    teamId: number;
    seasonPlayerId: number;
    matchday: number;
    attr: string;
    gain: number;
    ratingAfter: number;
    ratingsJson: string;
    value: number;
  }) => {
    db.prepare("UPDATE season_players SET ratings_json = ?, value = ? WHERE id = ?").run(
      input.ratingsJson,
      input.value,
      input.seasonPlayerId
    );
    db.prepare(
      `INSERT INTO training_sessions
         (season_id, team_id, season_player_id, matchday, attr, gain, rating_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.seasonId,
      input.teamId,
      input.seasonPlayerId,
      input.matchday,
      input.attr,
      input.gain,
      input.ratingAfter,
      Date.now()
    );
  }
);

// Sälj, köp, kassa och loggrad i en transaktion. INSERT:en in i squads är
// racets sista ord: primärnyckeln ligger på spelaren, så två lag som köper
// samma gubbe i samma ögonblick ger exakt en vinnare — förloraren kastar här
// och anroparen översätter till ett läsbart besked.
export const applyTransfer = db.transaction(
  (input: {
    seasonId: number;
    teamId: number;
    matchday: number;
    soldPlayerId: number;
    boughtPlayerId: number;
    soldFor: number;
    boughtFor: number;
    newFunds: number;
  }) => {
    db.prepare("DELETE FROM squads WHERE season_player_id = ? AND team_id = ?").run(
      input.soldPlayerId,
      input.teamId
    );
    db.prepare("INSERT INTO squads (season_player_id, team_id) VALUES (?, ?)").run(
      input.boughtPlayerId,
      input.teamId
    );
    db.prepare("UPDATE teams SET funds = ? WHERE id = ?").run(input.newFunds, input.teamId);
    db.prepare(
      `INSERT INTO transfers
         (season_id, team_id, matchday, sold_player_id, bought_player_id, sold_for, bought_for, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.seasonId,
      input.teamId,
      input.matchday,
      input.soldPlayerId,
      input.boughtPlayerId,
      input.soldFor,
      input.boughtFor,
      Date.now()
    );
  }
);
