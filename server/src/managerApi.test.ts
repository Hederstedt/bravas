import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { db } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";
import { SQUAD_SIZE } from "./season.ts";

const app = createApp();
const MAG = "76561198053832683";
const KUNGALV = "76561198060166361";

function member(steamid64: string, name: string) {
  db.prepare("INSERT OR IGNORE INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
    steamid64,
    name,
    Date.now()
  );
  db.prepare(
    "INSERT OR IGNORE INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
  ).run(steamid64, name, null, Date.now(), Date.now());
}

// Skrivningarna går genom samma CSRF-skydd som resten av API:et, så testerna
// måste hämta ett token precis som frontenden gör.
async function authed(steamid64: string) {
  const agent = request.agent(app);
  const cookie = `${sessionCookie.name}=${createSessionCookieValue(steamid64)}`;
  const res = await agent.get("/api/auth/csrf-token").set("Cookie", cookie).expect(200);
  const setCookie = (res.headers["set-cookie"] as unknown as string[]) ?? [];
  const csrfCookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return {
    post: (path: string, body: unknown) =>
      agent.post(path).set("Cookie", `${cookie}; ${csrfCookie}`).set("x-csrf-token", res.body.csrfToken).send(body),
    put: (path: string, body: unknown) =>
      agent.put(path).set("Cookie", `${cookie}; ${csrfCookie}`).set("x-csrf-token", res.body.csrfToken).send(body),
    get: (path: string) => agent.get(path).set("Cookie", cookie),
  };
}

// Riktig CS2-statistik för poolen: utan den blir de riktiga gubbarna
// utelämnade och poolen består bara av fria agenter.
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
          total_planted_bombs: 250,
          total_defused_bombs: 150,
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
    "DELETE FROM squads; DELETE FROM teams; DELETE FROM season_players; DELETE FROM seasons; DELETE FROM members; DELETE FROM allowlist; DELETE FROM cs2_stats;"
  );
  member(MAG, "[BVS] #Mag");
  member(KUNGALV, "[BVS] Kungalv");
  // mockResolvedValue hade gett samma Response-instans till varje anrop, och en
  // Response-kropp går bara att läsa en gång — andra medlemmen hade tyst blivit
  // utan statistik. Varje anrop måste få ett eget svar.
  vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(steamStats()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function startSeason() {
  const mag = await authed(MAG);
  await mag.post("/api/manager/season", { name: "Säsong 1" }).expect(201);
  return mag;
}

describe("GET /api/manager", () => {
  it("says there is no season before anyone starts one", async () => {
    const res = await request(app).get("/api/manager").expect(200);
    expect(res.body.season).toBeNull();
    expect(res.body.pool).toEqual([]);
  });

  it("lets an anonymous visitor look at the season without a team of his own", async () => {
    await startSeason();
    const res = await request(app).get("/api/manager").expect(200);

    expect(res.body.season.name).toBe("Säsong 1");
    expect(res.body.myTeam).toBeNull();
    expect(res.body.pool.length).toBeGreaterThan(SQUAD_SIZE);
  });

  it("freezes the real gubbar into the pool alongside the free agents", async () => {
    await startSeason();
    const res = await request(app).get("/api/manager").expect(200);

    const members = res.body.pool.filter((p: { source: string }) => p.source === "member");
    const generated = res.body.pool.filter((p: { source: string }) => p.source === "generated");
    expect(members).toHaveLength(2);
    expect(generated.length).toBeGreaterThan(0);
  });
});

describe("POST /api/manager/season", () => {
  it("refuses an anonymous caller", async () => {
    await request(app).post("/api/manager/season").send({ name: "Säsong 1" }).expect(403);
  });

  it("hands back the running season instead of starting a second", async () => {
    const mag = await startSeason();
    const again = await mag.post("/api/manager/season", { name: "Säsong 2" }).expect(201);

    expect(again.body.season.name).toBe("Säsong 1");
    const all = db.prepare("SELECT COUNT(*) AS n FROM seasons").get() as { n: number };
    expect(all.n).toBe(1);
  });
});

describe("POST /api/manager/team", () => {
  it("gives a manager one team", async () => {
    const mag = await startSeason();
    const res = await mag.post("/api/manager/team", { name: "Mags Marodörer" }).expect(201);
    expect(res.body.team.name).toBe("Mags Marodörer");
  });

  it("refuses a second team for the same manager", async () => {
    const mag = await startSeason();
    await mag.post("/api/manager/team", { name: "Första" }).expect(201);
    await mag.post("/api/manager/team", { name: "Andra" }).expect(409);
  });

  it("refuses a blank name", async () => {
    const mag = await startSeason();
    await mag.post("/api/manager/team", { name: "   " }).expect(400);
  });
});

describe("PUT /api/manager/squad", () => {
  async function cheapestKeys(count: number): Promise<string[]> {
    const res = await request(app).get("/api/manager").expect(200);
    const pool = res.body.pool as { key: string; value: number; takenBy: string | null }[];
    return [...pool]
      .filter((p) => !p.takenBy)
      .sort((a, b) => a.value - b.value)
      .slice(0, count)
      .map((p) => p.key);
  }

  it("signs a legal squad and reports what it cost", async () => {
    const mag = await startSeason();
    await mag.post("/api/manager/team", { name: "Mags Marodörer" }).expect(201);

    const res = await mag.put("/api/manager/squad", { players: await cheapestKeys(SQUAD_SIZE) }).expect(200);

    expect(res.body.myTeam.squad).toHaveLength(SQUAD_SIZE);
    expect(res.body.myTeam.spent).toBeGreaterThan(0);
    expect(res.body.myTeam.spent).toBeLessThanOrEqual(res.body.budget);
  });

  it("refuses a manager without a team", async () => {
    const mag = await startSeason();
    await mag.put("/api/manager/squad", { players: await cheapestKeys(SQUAD_SIZE) }).expect(409);
  });

  it("explains in Swedish why a squad was rejected", async () => {
    const mag = await startSeason();
    await mag.post("/api/manager/team", { name: "Mags Marodörer" }).expect(201);

    const res = await mag.put("/api/manager/squad", { players: await cheapestKeys(2) }).expect(400);
    expect(res.body.message).toMatch(/gubbar/i);
  });

  it("will not let two teams sign the same gubbe", async () => {
    // Knappheten är hela poängen med marknaden.
    const mag = await startSeason();
    await mag.post("/api/manager/team", { name: "Mags Marodörer" }).expect(201);
    const wanted = await cheapestKeys(SQUAD_SIZE);
    await mag.put("/api/manager/squad", { players: wanted }).expect(200);

    const kungalv = await authed(KUNGALV);
    await kungalv.post("/api/manager/team", { name: "Kungälvs Kanoner" }).expect(201);
    const res = await kungalv.put("/api/manager/squad", { players: wanted }).expect(400);

    expect(res.body.message).toContain("annat lag");
  });

  it("lets a manager rebuild his own squad from scratch", async () => {
    // Att byta ut hela truppen får inte krocka med unikhetskravet mitt i.
    const mag = await startSeason();
    await mag.post("/api/manager/team", { name: "Mags Marodörer" }).expect(201);
    const first = await cheapestKeys(SQUAD_SIZE);
    await mag.put("/api/manager/squad", { players: first }).expect(200);

    const res = await request(app).get("/api/manager").expect(200);
    const pool = res.body.pool as { key: string; value: number; takenBy: string | null }[];
    const replacement = [...pool]
      .filter((p) => !p.takenBy)
      .sort((a, b) => a.value - b.value)
      .slice(0, SQUAD_SIZE)
      .map((p) => p.key);

    const saved = await mag.put("/api/manager/squad", { players: replacement }).expect(200);
    expect(saved.body.myTeam.squad.map((p: { key: string }) => p.key).sort()).toEqual(
      [...replacement].sort()
    );
  });

  it("shows the rest of the clan who is already signed", async () => {
    const mag = await startSeason();
    await mag.post("/api/manager/team", { name: "Mags Marodörer" }).expect(201);
    const wanted = await cheapestKeys(SQUAD_SIZE);
    await mag.put("/api/manager/squad", { players: wanted }).expect(200);

    const res = await request(app).get("/api/manager").expect(200);
    const taken = (res.body.pool as { key: string; takenBy: string | null }[]).filter((p) => p.takenBy);
    expect(taken).toHaveLength(SQUAD_SIZE);
    expect(taken[0]!.takenBy).toBe("Mags Marodörer");
  });

  it("rejects a body that is not a list of keys", async () => {
    const mag = await startSeason();
    await mag.post("/api/manager/team", { name: "Mags Marodörer" }).expect(201);
    await mag.put("/api/manager/squad", { players: "inte-en-lista" }).expect(400);
    await mag.put("/api/manager/squad", { players: [1, 2, 3] }).expect(400);
  });
});
