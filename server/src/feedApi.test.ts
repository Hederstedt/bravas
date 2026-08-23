import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { db, removeMember } from "./db.ts";
import { FEED_LIMIT } from "./feed.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";

const app = createApp();
const MAG = "76561198053832683";
const KUNGALV = "76561198060166361";
const DAY = 86_400_000;

// public_id får medvetet inte innehålla steamid64 som delsträng — annars kan
// testet nedan inte skilja ett läckt steamid64 från ett giltigt opakt id.
function addMember(steamid64: string, name: string, firstLogin: number) {
  db.prepare("INSERT OR IGNORE INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
    steamid64,
    name,
    firstLogin
  );
  db.prepare(
    `INSERT INTO members (steamid64, public_id, persona_name, avatar_url, first_login, last_login)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(steamid64, `pid-${name.toLowerCase()}`, name, "https://avatar", firstLogin, firstLogin);
}

function addQuote(text: string, saidBy: string, submittedBy: string, createdAt: number) {
  db.prepare(
    "INSERT INTO quotes (text, said_by, submitted_by, created_at) VALUES (?, ?, ?, ?)"
  ).run(text, saidBy, submittedBy, createdAt);
}

function playMatch(at: number, homeScore: number, awayScore: number): number {
  const season = db
    .prepare("INSERT INTO seasons (name, starts_at, ends_at, status) VALUES (?, ?, ?, ?)")
    .run("Höstserien", at - DAY, at + DAY, "active");
  const seasonId = Number(season.lastInsertRowid);
  const team = (name: string) =>
    Number(
      db
        .prepare("INSERT INTO teams (season_id, name, created_at) VALUES (?, ?, ?)")
        .run(seasonId, name, at).lastInsertRowid
    );
  const home = team("Gubbarna FC");
  const away = team("Rush B United");

  return Number(
    db
      .prepare(
        `INSERT INTO fixtures (season_id, matchday, home_team_id, away_team_id, played_at, home_score, away_score)
         VALUES (?, 1, ?, ?, ?, ?, ?)`
      )
      .run(seasonId, home, away, at, homeScore, awayScore).lastInsertRowid
  );
}

beforeEach(() => {
  resetRateLimits();
  db.exec(`
    DELETE FROM fixtures; DELETE FROM teams; DELETE FROM seasons;
    DELETE FROM quotes; DELETE FROM bvs_month;
    DELETE FROM members; DELETE FROM allowlist;
  `);
});

describe("GET /api/feed", () => {
  it("är publik — loggboken ska gå att läsa utan att logga in", async () => {
    await request(app).get("/api/feed").expect(200);
  });

  it("är tom när ingenting hänt, i stället för att hitta på", async () => {
    const res = await request(app).get("/api/feed").expect(200);
    expect(res.body).toEqual({ items: [] });
  });

  it("blandar inloggningar, citat och matcher med det senaste först", async () => {
    const now = Date.now();
    addMember(MAG, "Mag", now - 5 * DAY);
    addQuote("Jag hade ju träklubban", "Mag", MAG, now - 2 * DAY);
    playMatch(now - DAY, 16, 13);

    const res = await request(app).get("/api/feed").expect(200);

    expect(res.body.items.map((i: { kind: string }) => i.kind)).toEqual([
      "match",
      "quote",
      "season",
      "member",
    ]);
    expect(res.body.items[0]).toMatchObject({
      kind: "match",
      home: "Gubbarna FC",
      away: "Rush B United",
      homeScore: 16,
      awayScore: 13,
    });
  });

  // Samma regel som citatväggen och rostern lyder under: inskickaren visas
  // aldrig, och steamid64 lämnar aldrig servern.
  it("avslöjar varken steamid64 eller vem som skickat in ett citat", async () => {
    const now = Date.now();
    addMember(MAG, "Mag", now - DAY);
    addQuote("Rush B, tänk inte", "Kungalv", MAG, now);
    db.prepare("INSERT INTO bvs_month (month, steamid64, score, decided_at) VALUES (?, ?, ?, ?)").run(
      "2026-07",
      MAG,
      42,
      now - 2 * DAY
    );

    const res = await request(app).get("/api/feed").expect(200);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(MAG);
    expect(body).toContain("pid-mag");
  });

  // Loggboken räknas fram ur medlemsregistret vid varje anrop, inte ur en egen
  // händelsetabell — därför följer den anonymiseringen utan att veta om den.
  it("följer med när en gubbe lämnar och anonymiseras", async () => {
    const now = Date.now();
    addMember(KUNGALV, "Kungalv", now - DAY);
    db.prepare("INSERT INTO bvs_month (month, steamid64, score, decided_at) VALUES (?, ?, ?, ?)").run(
      "2026-07",
      KUNGALV,
      42,
      now
    );

    expect((await request(app).get("/api/feed")).body.items[0]).toMatchObject({ name: "Kungalv" });

    resetRateLimits();
    removeMember(KUNGALV);

    const after = await request(app).get("/api/feed").expect(200);
    expect(after.body.items).toEqual([
      { kind: "month", at: now, id: null, name: "Tidigare medlem", month: "2026-07" },
    ]);
  });

  it("skickar aldrig mer än en skärmfull", async () => {
    const now = Date.now();
    for (let i = 0; i < FEED_LIMIT + 4; i++) addQuote(`Citat ${i}`, "Gubbe", MAG, now - i * 1000);

    const res = await request(app).get("/api/feed").expect(200);
    expect(res.body.items).toHaveLength(FEED_LIMIT);
  });
});
