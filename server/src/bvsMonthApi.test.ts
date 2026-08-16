import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { crownBvsMonth, db } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";

const app = createApp();
const MAG = "76561198053832683";
const KUNGALV = "76561198060166361";
const MIN = 60_000;

function addMember(steamid64: string, name: string) {
  db.prepare("INSERT OR IGNORE INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
    steamid64,
    name,
    Date.now()
  );
  db.prepare(
    "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
  ).run(steamid64, name, null, Date.now(), Date.now());
}

function play(steamid64: string, game: string, from: number, minutes: number) {
  let at = from;
  for (let left = minutes; left >= 0; left -= 5) {
    db.prepare(
      "INSERT INTO presence_samples (at, steamid64, game) VALUES (?, ?, ?) ON CONFLICT(at, steamid64) DO NOTHING"
    ).run(at, steamid64, game);
    at += 5 * MIN;
  }
}

beforeEach(() => {
  resetRateLimits();
  db.exec("DELETE FROM members; DELETE FROM allowlist; DELETE FROM presence_samples; DELETE FROM bvs_month;");
});

// Fönstret är alltid "innevarande månad till nu", vilket gör den byggd runt
// riktig tid svår att testa deterministiskt utan att styra klockan. Vi lägger
// därför speltiden strax innan anropet i stället för att låtsas om ett datum.
describe("GET /api/stats/month", () => {
  it("is public — no session required", async () => {
    await request(app).get("/api/stats/month").expect(200);
  });

  it("ranks members by score for the running month", async () => {
    addMember(MAG, "[BVS] #Mag");
    addMember(KUNGALV, "[BVS] Kungalv");
    // Räknat bakåt från nu i stället för ett fast kalenderdatum, så testet inte
    // beror på vilken dag i månaden det råkar köra.
    play(MAG, "Counter-Strike 2", Date.now() - 90 * MIN, 90);
    play(KUNGALV, "Counter-Strike 2", Date.now() - 20 * MIN, 20);

    const res = await request(app).get("/api/stats/month").expect(200);

    expect(res.body.standings[0]).toMatchObject({ steamid64: MAG, personaName: "[BVS] #Mag" });
    expect(res.body.standings[0].score).toBeGreaterThan(res.body.standings[1].score);
  });

  // Var och en ska se var hen ligger, även på noll — inte bara de aktiva.
  it("lists every member, including one with no activity yet", async () => {
    addMember(MAG, "[BVS] #Mag");

    const res = await request(app).get("/api/stats/month").expect(200);

    expect(res.body.standings).toEqual([
      { steamid64: MAG, personaName: "[BVS] #Mag", score: 0 },
    ]);
  });

  it("reports no last-month winner before any month has been decided", async () => {
    const res = await request(app).get("/api/stats/month").expect(200);
    expect(res.body.lastMonth).toBeNull();
  });

  it("reports last month's winner once one is crowned", async () => {
    addMember(MAG, "[BVS] #Mag");
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    crownBvsMonth({ month, steamid64: MAG, score: 17.5 });

    const res = await request(app).get("/api/stats/month").expect(200);

    expect(res.body.lastMonth).toEqual({
      month,
      steamid64: MAG,
      personaName: "[BVS] #Mag",
      score: 17.5,
    });
  });

  // En vinnare från förra veckan kan ha slutat sedan dess — historiken ska
  // ändå gå att visa.
  it("falls back to the steamid when the winner is no longer a member", async () => {
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    crownBvsMonth({ month, steamid64: KUNGALV, score: 4 });

    const res = await request(app).get("/api/stats/month").expect(200);
    expect(res.body.lastMonth).toMatchObject({ steamid64: KUNGALV, personaName: KUNGALV });
  });
});
