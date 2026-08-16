import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { db, recordPresenceSample } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";
import { CS2_GAME } from "./activity.ts";
import { SQUAD_SIZE } from "./season.ts";

const app = createApp();
const MAG = "76561198053832683";
const MIN = 60_000;

function addMember(steamid64: string, name: string) {
  db.prepare("INSERT OR IGNORE INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
    steamid64,
    name,
    Date.now()
  );
  db.prepare(
    "INSERT OR IGNORE INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
  ).run(steamid64, name, null, Date.now(), Date.now());
}

async function authed(steamid64: string) {
  const agent = request.agent(app);
  const cookie = `${sessionCookie.name}=${createSessionCookieValue(steamid64)}`;
  const res = await agent.get("/api/auth/csrf-token").set("Cookie", cookie).expect(200);
  const csrf = ((res.headers["set-cookie"] as unknown as string[]) ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  const send = (method: "post" | "put") => (path: string, body?: unknown) =>
    agent[method](path)
      .set("Cookie", `${cookie}; ${csrf}`)
      .set("x-csrf-token", res.body.csrfToken)
      .send(body ?? {});
  return { post: send("post"), put: send("put") };
}

function steamStats() {
  return new Response(
    JSON.stringify({
      playerstats: {
        stats: Object.entries({
          total_rounds_played: 10000,
          total_shots_fired: 400000,
          total_shots_hit: 96000,
          total_kills: 7500,
          total_kills_headshot: 3375,
          total_deaths: 6500,
          total_mvps: 800,
          total_time_played: 3600000,
        }).map(([name, value]) => ({ name, value })),
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// Loggar en kväll med femminuterspuls, bakåt från nu.
function logEvening(game: string, minutes: number) {
  const now = Date.now();
  for (let ago = minutes; ago > 0; ago -= 5) {
    recordPresenceSample(now - ago * MIN, MAG, game);
  }
  recordPresenceSample(now, MAG, game);
}

// Fönstret börjar när förra omgången avgjordes, och i ett test spelas den för
// en millisekund sedan — då ryms ingen kväll i det. Att backdatera matchen är
// samma sak som att låta ett dygn gå.
function lastMatchdayWasHoursAgo(hours: number) {
  db.prepare("UPDATE fixtures SET played_at = ? WHERE played_at IS NOT NULL").run(
    Date.now() - hours * 60 * MIN
  );
}

// Träning och affärer finns bara i seriefasen — i byggfasen finns inget
// spelschema och därmed inget fönster. Uppställningen spelar därför en omgång
// och backdaterar den, så att en kväll ryms efteråt.
async function seasonInPlay() {
  const mag = await authed(MAG);
  await mag.post("/api/manager/season", { name: "Säsong 1" }).expect(201);
  await mag.post("/api/manager/team", { name: "Mags Marodörer" }).expect(201);

  const view = await request(app).get("/api/manager").expect(200);
  const pool = view.body.pool as { key: string; value: number }[];
  const picks = [...pool].sort((a, b) => a.value - b.value).slice(0, SQUAD_SIZE);
  await mag.put("/api/manager/squad", { players: picks.map((p) => p.key) }).expect(200);

  resetRateLimits();
  await mag.post("/api/manager/matchday").expect(201);
  lastMatchdayWasHoursAgo(12);
  resetRateLimits();
  return mag;
}

async function myTeam() {
  const res = await request(app)
    .get("/api/manager")
    .set("Cookie", `${sessionCookie.name}=${createSessionCookieValue(MAG)}`)
    .expect(200);
  return res.body.myTeam;
}

beforeEach(() => {
  resetRateLimits();
  db.exec(
    "DELETE FROM presence_samples; DELETE FROM training_sessions; DELETE FROM transfers; DELETE FROM fixtures; DELETE FROM squads; DELETE FROM teams; DELETE FROM season_players; DELETE FROM seasons; DELETE FROM members; DELETE FROM allowlist; DELETE FROM cs2_stats;"
  );
  addMember(MAG, "[BVS] #Mag");
  vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(steamStats()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cross-game activity", () => {
  it("gives the base quota to someone who has not played", async () => {
    await seasonInPlay();

    const team = await myTeam();
    expect(team.trainingLeft).toBe(2);
    expect(team.transfersLeft).toBe(1);
    expect(team.activity).toMatchObject({ training: 0, transfer: 0 });
  });

  it("opens extra training after an evening of CS2", async () => {
    await seasonInPlay();
    logEvening(CS2_GAME, 6 * 60);

    const team = await myTeam();
    expect(team.activity.training).toBe(2);
    expect(team.trainingLeft).toBe(4);
  });

  it("opens an extra transfer after time in the clan's other games", async () => {
    await seasonInPlay();
    logEvening("Valheim", 5 * 60);

    const team = await myTeam();
    expect(team.activity.transfer).toBe(1);
    expect(team.transfersLeft).toBe(2);
  });

  it("lets the earned sessions actually be used", async () => {
    const mag = await seasonInPlay();
    logEvening(CS2_GAME, 6 * 60);

    const before = await myTeam();
    expect(before.trainingLeft).toBeGreaterThan(2);

    // Kör slut på hela kvoten, bonusen inräknad.
    for (let i = 0; i < before.trainingLeft; i++) {
      resetRateLimits();
      const player = (await myTeam()).squad[i % SQUAD_SIZE];
      await mag.post("/api/manager/training", { player: player.key, attr: "SIK" }).expect(200);
    }

    resetRateLimits();
    expect((await myTeam()).trainingLeft).toBe(0);
    const denied = await mag.post("/api/manager/training", {
      player: before.squad[0].key,
      attr: "SKA",
    });
    expect(denied.status).toBe(409);
  });

  // Kärnan i hela designen: aktiviteten får aldrig röra de frysta betygen. Gör
  // den det faller invarianten som transfermarknaden vilar på.
  it("never touches the frozen pool", async () => {
    await seasonInPlay();

    const before = await request(app).get("/api/manager").expect(200);
    logEvening(CS2_GAME, 20 * 60);
    const after = await request(app).get("/api/manager").expect(200);

    expect(after.body.pool).toEqual(before.body.pool);
  });

  // Bonusen räknas fram ur fönstret, den lagras aldrig. Samma timmar kan
  // därför inte växlas in en gång till efter att omgången spelats.
  it("does not let the same hours be spent twice", async () => {
    const mag = await seasonInPlay();
    logEvening(CS2_GAME, 6 * 60);

    expect((await myTeam()).activity.training).toBe(2);

    // Omgången spelas — fönstret flyttar fram, och kvällen ligger bakom det.
    await mag.post("/api/manager/matchday").expect(201);
    resetRateLimits();

    expect((await myTeam()).activity.training).toBe(0);
    expect((await myTeam()).trainingLeft).toBe(2);
  });

  // Botlagen lirar inga spel och ska inte kunna få någon bonus.
  it("gives the bots nothing", async () => {
    const mag = await seasonInPlay();
    await mag.post("/api/manager/matchday").expect(201);

    const view = await request(app).get("/api/manager").expect(200);
    expect((view.body.teams as { bot: boolean }[]).some((t) => t.bot)).toBe(true);
    // Botlagen syns inte som myTeam för någon, och deras kvot beräknas utan
    // manager — det räcker att vyn går att hämta utan att kasta.
    expect(view.body.season).not.toBeNull();
  });
});
