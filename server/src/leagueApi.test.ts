import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { db } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";
import { SQUAD_SIZE } from "./season.ts";

const app = createApp();
const MANAGERS = [
  ["76561198053832683", "[BVS] #Mag", "Mags Marodörer"],
  ["76561198060166361", "[BVS] Kungalv", "Kungälvs Kanoner"],
  ["76561198000000003", "[BVS] Tredje", "Tredje Trupp"],
] as const;

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

// Varje anrop måste få en egen Response — en kropp går bara att läsa en gång.
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

beforeEach(() => {
  resetRateLimits();
  db.exec(
    "DELETE FROM training_sessions; DELETE FROM transfers; DELETE FROM fixtures; DELETE FROM squads; DELETE FROM teams; DELETE FROM season_players; DELETE FROM seasons; DELETE FROM members; DELETE FROM allowlist; DELETE FROM cs2_stats;"
  );
  for (const [id, name] of MANAGERS) addMember(id, name);
  vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(steamStats()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// En hel liga: säsong, tre lag, alla med trupp.
async function league(withSquads = true) {
  const first = await authed(MANAGERS[0][0]);
  await first.post("/api/manager/season", { name: "Säsong 1" }).expect(201);

  const taken = new Set<string>();
  for (const [id, , teamName] of MANAGERS) {
    const manager = await authed(id);
    await manager.post("/api/manager/team", { name: teamName }).expect(201);
    if (!withSquads) continue;

    const view = await request(app).get("/api/manager").expect(200);
    const pool = view.body.pool as { key: string; value: number; takenBy: string | null }[];
    const picks = [...pool]
      .filter((p) => !p.takenBy && !taken.has(p.key))
      .sort((a, b) => a.value - b.value)
      .slice(0, SQUAD_SIZE);
    for (const p of picks) taken.add(p.key);
    await manager.put("/api/manager/squad", { players: picks.map((p) => p.key) }).expect(200);
  }
  // Uppsättningen kostar sju skrivningar av tio tillåtna per minut. Utan en
  // nollställning här slår taket mitt i testet i stället för i verkligheten.
  resetRateLimits();
  return first;
}

describe("the fixture list", () => {
  it("appears once the first matchday is played", async () => {
    const mag = await league();
    await mag.post("/api/manager/matchday").expect(201);

    const view = await request(app).get("/api/manager").expect(200);
    // Tre lag, dubbelmöte: sex matcher fördelade över omgångar.
    expect(view.body.fixtures).toHaveLength(6);
  });

  it("never has a team playing twice on the same matchday", async () => {
    const mag = await league();
    await mag.post("/api/manager/matchday").expect(201);

    const view = await request(app).get("/api/manager").expect(200);
    const byDay = new Map<number, number[]>();
    for (const f of view.body.fixtures as { matchday: number; home: { id: number }; away: { id: number } }[]) {
      const list = byDay.get(f.matchday) ?? [];
      list.push(f.home.id, f.away.id);
      byDay.set(f.matchday, list);
    }
    for (const played of byDay.values()) expect(new Set(played).size).toBe(played.length);
  });
});

describe("POST /api/manager/matchday", () => {
  it("plays the first matchday and records the results", async () => {
    const mag = await league();
    const res = await mag.post("/api/manager/matchday").expect(201);

    expect(res.body.matchday).toBe(1);
    expect(res.body.played).toBeGreaterThan(0);

    const view = await request(app).get("/api/manager").expect(200);
    const played = (view.body.fixtures as { played: boolean }[]).filter((f) => f.played);
    expect(played).toHaveLength(res.body.played);
  });

  it("moves on to the next matchday each time", async () => {
    const mag = await league();
    expect((await mag.post("/api/manager/matchday").expect(201)).body.matchday).toBe(1);
    expect((await mag.post("/api/manager/matchday").expect(201)).body.matchday).toBe(2);
    expect((await mag.post("/api/manager/matchday").expect(201)).body.matchday).toBe(3);
  });

  it("says the season is finished once every fixture is played", async () => {
    const mag = await league();

    // Tre lag möts dubbelt, och det udda antalet ger en frilottning per omgång
    // — hur många omgångar det blir är schemats sak, inte testets att gissa.
    let matchdays = 0;
    for (;;) {
      resetRateLimits();
      const res = await mag.post("/api/manager/matchday");
      if (res.status === 409) break;
      expect(res.status).toBe(201);
      matchdays++;
      expect(matchdays).toBeLessThan(20);
    }

    expect(matchdays).toBe(6);
    const view = await request(app).get("/api/manager").expect(200);
    expect((view.body.fixtures as { played: boolean }[]).every((f) => f.played)).toBe(true);
  });

  it("refuses an anonymous caller", async () => {
    await league();
    await request(app).post("/api/manager/matchday").expect(403);
  });

  // En ensam manager som testar spelet ska få veta vad som saknas — inte
  // "färdigspelad" om en serie som aldrig börjat.
  it("explains that the league needs at least two teams", async () => {
    const solo = await authed(MANAGERS[0][0]);
    await solo.post("/api/manager/season", { name: "Säsong 1" }).expect(201);
    await solo.post("/api/manager/team", { name: "Ensamma Gubben" }).expect(201);

    const res = await solo.post("/api/manager/matchday").expect(409);
    expect(res.body.error).toBe("too_few_teams");
    expect(res.body.message).toMatch(/minst två lag/);
  });

  it("gives a team with no squad a walkover loss instead of taking the round down", async () => {
    // Ett lag utan trupp får inte kunna stoppa hela omgången.
    const mag = await league(false);
    await mag.post("/api/manager/matchday").expect(201);

    const view = await request(app).get("/api/manager").expect(200);
    const played = (view.body.fixtures as { played: boolean; homeScore: number; awayScore: number }[]).filter(
      (f) => f.played
    );
    expect(played.length).toBeGreaterThan(0);
    for (const f of played) expect(Math.max(f.homeScore, f.awayScore)).toBe(13);
  });
});

describe("the table", () => {
  it("is empty but complete before anything is played", async () => {
    await league();
    const view = await request(app).get("/api/manager").expect(200);

    expect(view.body.table).toHaveLength(MANAGERS.length);
    for (const row of view.body.table) expect(row).toMatchObject({ played: 0, points: 0 });
  });

  it("hands out three points for a win and one each for a draw", async () => {
    const mag = await league();
    await mag.post("/api/manager/matchday").expect(201);

    const view = await request(app).get("/api/manager").expect(200);
    const table = view.body.table as { played: number; won: number; drawn: number; points: number }[];
    for (const row of table) {
      expect(row.points).toBe(row.won * 3 + row.drawn);
    }
  });

  it("adds up rounds won and conceded across the league", async () => {
    const mag = await league();
    await mag.post("/api/manager/matchday").expect(201);

    const table = (await request(app).get("/api/manager").expect(200)).body.table as {
      roundsFor: number;
      roundsAgainst: number;
    }[];
    // Varje vunnen runda är någon annans förlorade.
    const forSum = table.reduce((s, r) => s + r.roundsFor, 0);
    const againstSum = table.reduce((s, r) => s + r.roundsAgainst, 0);
    expect(forSum).toBe(againstSum);
  });

  it("puts the leader on top", async () => {
    const mag = await league();
    for (let i = 0; i < 6; i++) { resetRateLimits(); await mag.post("/api/manager/matchday").expect(201); }

    const table = (await request(app).get("/api/manager").expect(200)).body.table as { points: number }[];
    for (let i = 1; i < table.length; i++) {
      expect(table[i - 1]!.points).toBeGreaterThanOrEqual(table[i]!.points);
    }
  });
});

describe("GET /api/manager/match/:id", () => {
  async function firstPlayedId() {
    const view = await request(app).get("/api/manager").expect(200);
    return (view.body.fixtures as { id: number; played: boolean }[]).find((f) => f.played)!.id;
  }

  it("reads back the report that was stored when the match was played", async () => {
    const mag = await league();
    await mag.post("/api/manager/matchday").expect(201);

    const res = await request(app).get(`/api/manager/match/${await firstPlayedId()}`).expect(200);

    expect(res.body.report.rounds.length).toBeGreaterThan(0);
    expect(res.body.report.scoreboard.home).toHaveLength(SQUAD_SIZE);
    expect(res.body.report.mvp).not.toBeNull();
  });

  it("keeps the report in step with the score in the table", async () => {
    // Rapporten simuleras aldrig om, så den kan inte säga något annat.
    const mag = await league();
    await mag.post("/api/manager/matchday").expect(201);

    const id = await firstPlayedId();
    const res = await request(app).get(`/api/manager/match/${id}`).expect(200);
    expect(res.body.report.homeScore).toBe(res.body.homeScore);
    expect(res.body.report.awayScore).toBe(res.body.awayScore);
  });

  it("has nothing to show for a match that has not been played", async () => {
    const mag = await league();
    await mag.post("/api/manager/matchday").expect(201);

    const view = await request(app).get("/api/manager").expect(200);
    const unplayed = (view.body.fixtures as { id: number; played: boolean }[]).find((f) => !f.played)!;
    await request(app).get(`/api/manager/match/${unplayed.id}`).expect(404);
  });

  it("refuses an id that is not a number", async () => {
    await request(app).get("/api/manager/match/inte-ett-id").expect(404);
  });
});
