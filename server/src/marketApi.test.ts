import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { applyTransfer, db, listPool, squadOf } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";
import { SQUAD_SIZE } from "./season.ts";
import { sellPrice } from "./market.ts";

const app = createApp();
const MAG = "76561198053832683";
const KUNGALV = "76561198060166361";
const BERRA = "76561198000000003";

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

async function authed(steamid64: string) {
  const agent = request.agent(app);
  const cookie = `${sessionCookie.name}=${createSessionCookieValue(steamid64)}`;
  const res = await agent.get("/api/auth/csrf-token").set("Cookie", cookie).expect(200);
  const setCookie = (res.headers["set-cookie"] as unknown as string[]) ?? [];
  const csrfCookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return {
    post: (path: string, body?: unknown) =>
      agent.post(path).set("Cookie", `${cookie}; ${csrfCookie}`).set("x-csrf-token", res.body.csrfToken).send(body),
    put: (path: string, body: unknown) =>
      agent.put(path).set("Cookie", `${cookie}; ${csrfCookie}`).set("x-csrf-token", res.body.csrfToken).send(body),
    get: (path: string) => agent.get(path).set("Cookie", cookie),
  };
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
    "DELETE FROM training_sessions; DELETE FROM transfers; DELETE FROM fixtures; DELETE FROM squads; DELETE FROM teams; DELETE FROM season_players; DELETE FROM seasons; DELETE FROM members; DELETE FROM allowlist; DELETE FROM cs2_stats;"
  );
  member(MAG, "[BVS] #Mag");
  member(KUNGALV, "[BVS] Kungalv");
  member(BERRA, "[BVS] Berra");
  vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(steamStats()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface ViewPlayer {
  key: string;
  value: number;
  takenBy: string | null;
}

async function view(agentOrNot?: Awaited<ReturnType<typeof authed>>) {
  const res = agentOrNot
    ? await agentOrNot.get("/api/manager").expect(200)
    : await request(app).get("/api/manager").expect(200);
  return res.body as {
    locked: boolean;
    sellRate: number;
    budget: number;
    pool: ViewPlayer[];
    myTeam: {
      name: string;
      funds: number;
      transfersLeft: number;
      spent: number;
      squad: ViewPlayer[];
    } | null;
  };
}

function cheapestFree(pool: ViewPlayer[], count: number, skip = 0): string[] {
  return [...pool]
    .filter((p) => !p.takenBy)
    .sort((a, b) => a.value - b.value)
    .slice(skip, skip + count)
    .map((p) => p.key);
}

// Full uppställning: säsong, lag och trupper för de som anges, så att serien
// kan spelas och trupperna låsas.
async function seasonInPlay(teamCount: 2 | 3) {
  const mag = await authed(MAG);
  await mag.post("/api/manager/season", { name: "Säsong 1" }).expect(201);
  await mag.post("/api/manager/team", { name: "Mags Marodörer" }).expect(201);

  const kungalv = await authed(KUNGALV);
  await kungalv.post("/api/manager/team", { name: "Kungälvs Kanoner" }).expect(201);

  let berra: Awaited<ReturnType<typeof authed>> | null = null;
  if (teamCount === 3) {
    berra = await authed(BERRA);
    await berra.post("/api/manager/team", { name: "Berras Bärsärkar" }).expect(201);
  }

  let v = await view();
  await mag.put("/api/manager/squad", { players: cheapestFree(v.pool, SQUAD_SIZE) }).expect(200);
  v = await view();
  await kungalv.put("/api/manager/squad", { players: cheapestFree(v.pool, SQUAD_SIZE) }).expect(200);
  if (berra) {
    v = await view();
    await berra.put("/api/manager/squad", { players: cheapestFree(v.pool, SQUAD_SIZE) }).expect(200);
  }

  return { mag, kungalv, berra };
}

describe("POST /api/manager/transfer", () => {
  it("refuses an anonymous caller", async () => {
    await request(app).post("/api/manager/transfer").send({ sell: "a", buy: "b" }).expect(403);
  });

  it("refuses without a season", async () => {
    const mag = await authed(MAG);
    const res = await mag.post("/api/manager/transfer", { sell: "a", buy: "b" }).expect(409);
    expect(res.body.error).toBe("no_active_season");
  });

  it("refuses during the build phase — the squad is still freely editable", async () => {
    const { mag } = await seasonInPlay(2);
    const res = await mag.post("/api/manager/transfer", { sell: "a", buy: "b" }).expect(409);
    expect(res.body.error).toBe("season_not_started");
  });

  it("refuses a member without a team", async () => {
    const { mag } = await seasonInPlay(2);
    await mag.post("/api/manager/matchday").expect(201);

    const berra = await authed(BERRA);
    const res = await berra.post("/api/manager/transfer", { sell: "a", buy: "b" }).expect(409);
    expect(res.body.error).toBe("no_team");
  });

  it("swaps a squad player for a free agent and moves the money", async () => {
    const { mag } = await seasonInPlay(2);
    await mag.post("/api/manager/matchday").expect(201);

    const before = await view(mag);
    const selling = [...before.myTeam!.squad].sort((a, b) => a.value - b.value)[0]!;
    const buyingKey = cheapestFree(before.pool, 1)[0]!;
    const buying = before.pool.find((p) => p.key === buyingKey)!;

    const res = await mag
      .post("/api/manager/transfer", { sell: selling.key, buy: buying.key })
      .expect(200);

    const after = res.body as Awaited<ReturnType<typeof view>>;
    expect(after.myTeam!.squad).toHaveLength(SQUAD_SIZE);
    expect(after.myTeam!.funds).toBe(before.myTeam!.funds + sellPrice(selling.value) - buying.value);
    expect(after.myTeam!.funds).toBeGreaterThanOrEqual(0);
    expect(after.myTeam!.transfersLeft).toBe(0);

    // Den sålda är fri för alla, den köpta har kontrakt.
    expect(after.pool.find((p) => p.key === selling.key)!.takenBy).toBeNull();
    expect(after.pool.find((p) => p.key === buying.key)!.takenBy).toBe("Mags Marodörer");
  });

  // Rabatten på försäljning gör varje affär till en förlustaffär räknat i
  // kassa plus truppvärde — annars hade marknaden varit en pengamaskin.
  it("never grows funds plus squad value", async () => {
    const { mag } = await seasonInPlay(2);
    await mag.post("/api/manager/matchday").expect(201);

    const before = await view(mag);
    const wealthBefore = before.myTeam!.funds + before.myTeam!.spent;

    const selling = [...before.myTeam!.squad].sort((a, b) => a.value - b.value)[0]!;
    const buyingKey = cheapestFree(before.pool, 1)[0]!;
    const res = await mag
      .post("/api/manager/transfer", { sell: selling.key, buy: buyingKey })
      .expect(200);

    const after = res.body as Awaited<ReturnType<typeof view>>;
    expect(after.myTeam!.funds + after.myTeam!.spent).toBeLessThan(wealthBefore);
  });

  it("explains when the funds do not stretch", async () => {
    const { mag } = await seasonInPlay(2);
    await mag.post("/api/manager/matchday").expect(201);

    // Kassan töms rakt i databasen: testet handlar om avslaget, inte om hur
    // laget hamnade där.
    db.prepare("UPDATE teams SET funds = 0 WHERE name = 'Mags Marodörer'").run();

    const v = await view(mag);
    const selling = [...v.myTeam!.squad].sort((a, b) => a.value - b.value)[0]!;
    const expensive = [...v.pool]
      .filter((p) => !p.takenBy)
      .sort((a, b) => b.value - a.value)[0]!;

    const res = await mag
      .post("/api/manager/transfer", { sell: selling.key, buy: expensive.key })
      .expect(400);
    expect(res.body.error).toBe("invalid_transfer");
    expect(res.body.message).toContain("Kassan räcker inte");
  });

  it("allows one transfer per matchday and opens again after the next", async () => {
    const { mag } = await seasonInPlay(3);
    await mag.post("/api/manager/matchday").expect(201);

    let v = await view(mag);
    expect(v.myTeam!.transfersLeft).toBe(1);

    const sell1 = [...v.myTeam!.squad].sort((a, b) => a.value - b.value)[0]!.key;
    await mag.post("/api/manager/transfer", { sell: sell1, buy: cheapestFree(v.pool, 1)[0]! }).expect(200);

    v = await view(mag);
    const sell2 = [...v.myTeam!.squad].sort((a, b) => a.value - b.value)[0]!.key;
    const res = await mag
      .post("/api/manager/transfer", { sell: sell2, buy: cheapestFree(v.pool, 1)[0]! })
      .expect(409);
    expect(res.body.error).toBe("no_transfers_left");

    // Nästa omgång spelas — fönstret öppnar igen. Uppställningen har ätit upp
    // mutationstaket, så räknaren nollställs; det är kvoten som provas här,
    // inte rate-limitern.
    resetRateLimits();
    await mag.post("/api/manager/matchday").expect(201);
    v = await view(mag);
    expect(v.myTeam!.transfersLeft).toBe(1);
    const sell3 = [...v.myTeam!.squad].sort((a, b) => a.value - b.value)[0]!.key;
    await mag.post("/api/manager/transfer", { sell: sell3, buy: cheapestFree(v.pool, 1)[0]! }).expect(200);
  });

  it("lets another team buy a player the first team sold", async () => {
    const { mag, kungalv } = await seasonInPlay(2);
    await mag.post("/api/manager/matchday").expect(201);

    let v = await view(mag);
    const sold = [...v.myTeam!.squad].sort((a, b) => a.value - b.value)[0]!;
    await mag.post("/api/manager/transfer", { sell: sold.key, buy: cheapestFree(v.pool, 1)[0]! }).expect(200);

    const kv = await view(kungalv);
    const kSell = [...kv.myTeam!.squad].sort((a, b) => a.value - b.value)[0]!;
    const res = await kungalv
      .post("/api/manager/transfer", { sell: kSell.key, buy: sold.key })
      .expect(200);
    expect(
      (res.body as Awaited<ReturnType<typeof view>>).pool.find((p) => p.key === sold.key)!.takenBy
    ).toBe("Kungälvs Kanoner");
  });

  // Sista omgången stänger säsongen, så det finns ingen aktiv säsong kvar att
  // handla i — svaret kommer från den kontrollen i stället för från kvoten.
  it("refuses once the season is finished", async () => {
    const { mag } = await seasonInPlay(2);
    await mag.post("/api/manager/matchday").expect(201);
    await mag.post("/api/manager/matchday").expect(201);

    const res = await mag.post("/api/manager/transfer", { sell: "a", buy: "b" }).expect(409);
    expect(res.body.error).toBe("no_active_season");
    expect(res.body.message).toMatch(/Ingen säsong är igång/);
  });

  // Primärnyckeln på spelaren är sista ordet: två lag som köper samma gubbe i
  // exakt samma ögonblick ger exakt en vinnare.
  it("gives a simultaneous purchase exactly one winner", async () => {
    const { mag } = await seasonInPlay(2);
    await mag.post("/api/manager/matchday").expect(201);

    const seasonId = (db.prepare("SELECT id FROM seasons").get() as { id: number }).id;
    const teams = db.prepare("SELECT id FROM teams ORDER BY id").all() as { id: number }[];
    const free = listPool(seasonId).find(
      (p) => !db.prepare("SELECT 1 FROM squads WHERE season_player_id = ?").get(p.id)
    )!;
    const squadA = squadOf(teams[0]!.id);
    const squadB = squadOf(teams[1]!.id);

    const buy = (teamId: number, soldPlayerId: number) =>
      applyTransfer({
        seasonId,
        teamId,
        matchday: 2,
        soldPlayerId,
        boughtPlayerId: free.id,
        soldFor: 100,
        boughtFor: 200,
        newFunds: 0,
      });

    buy(teams[0]!.id, squadA[0]!.id);
    expect(() => buy(teams[1]!.id, squadB[0]!.id)).toThrow();

    // Vinnaren har gubben, förloraren fick ingenting halvvägs gjort.
    const owner = db
      .prepare("SELECT team_id FROM squads WHERE season_player_id = ?")
      .get(free.id) as { team_id: number };
    expect(owner.team_id).toBe(teams[0]!.id);
    expect(squadOf(teams[1]!.id)).toHaveLength(SQUAD_SIZE);
  });
});

describe("PUT /api/manager/squad in the series phase", () => {
  it("is locked once the first matchday is played", async () => {
    const { mag } = await seasonInPlay(2);
    await mag.post("/api/manager/matchday").expect(201);

    const v = await view(mag);
    const res = await mag
      .put("/api/manager/squad", { players: v.myTeam!.squad.map((p) => p.key) })
      .expect(409);
    expect(res.body.error).toBe("squad_locked");
    expect(res.body.message).toContain("transfermarknaden");
  });
});

describe("GET /api/manager with a wallet", () => {
  it("reports funds, quota and phase", async () => {
    const { mag } = await seasonInPlay(2);

    let v = await view(mag);
    expect(v.locked).toBe(false);
    expect(v.sellRate).toBeCloseTo(0.7);
    expect(v.myTeam!.funds).toBe(v.budget - v.myTeam!.spent);
    // I byggfasen finns inget spelschema och därmed inget transferfönster.
    expect(v.myTeam!.transfersLeft).toBe(0);

    await mag.post("/api/manager/matchday").expect(201);
    v = await view(mag);
    expect(v.locked).toBe(true);
    expect(v.myTeam!.transfersLeft).toBe(1);
  });
});
