import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { db } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";
import { SQUAD_SIZE } from "./season.ts";
import { trainingGain } from "./training.ts";

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
  vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(steamStats()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface ViewPlayer {
  key: string;
  value: number;
  takenBy: string | null;
  ratings: Record<string, number>;
}

async function view(agent: Awaited<ReturnType<typeof authed>>) {
  const res = await agent.get("/api/manager").expect(200);
  return res.body as {
    pool: ViewPlayer[];
    myTeam: { squad: ViewPlayer[]; trainingLeft: number; funds: number } | null;
  };
}

// Säsong i seriefas: lag med trupper och första omgången spelad. Tre lag när
// testet behöver fler omgångar än två.
async function seasonInPlay(teamCount: 2 | 3 = 2) {
  const mag = await authed(MAG);
  await mag.post("/api/manager/season", { name: "Säsong 1" }).expect(201);
  await mag.post("/api/manager/team", { name: "Mags Marodörer" }).expect(201);
  const kungalv = await authed(KUNGALV);
  await kungalv.post("/api/manager/team", { name: "Kungälvs Kanoner" }).expect(201);

  let berra: Awaited<ReturnType<typeof authed>> | null = null;
  if (teamCount === 3) {
    member("76561198000000003", "[BVS] Berra");
    berra = await authed("76561198000000003");
    await berra.post("/api/manager/team", { name: "Berras Bärsärkar" }).expect(201);
  }

  const cheapest = async () => {
    const v = await view(mag);
    return [...v.pool]
      .filter((p) => !p.takenBy)
      .sort((a, b) => a.value - b.value)
      .slice(0, SQUAD_SIZE)
      .map((p) => p.key);
  };
  await mag.put("/api/manager/squad", { players: await cheapest() }).expect(200);
  await kungalv.put("/api/manager/squad", { players: await cheapest() }).expect(200);
  if (berra) await berra.put("/api/manager/squad", { players: await cheapest() }).expect(200);
  await mag.post("/api/manager/matchday").expect(201);
  return { mag, kungalv };
}

describe("POST /api/manager/training", () => {
  it("refuses an anonymous caller", async () => {
    await request(app).post("/api/manager/training").send({ player: "a", attr: "SIK" }).expect(403);
  });

  it("refuses without a season", async () => {
    const mag = await authed(MAG);
    const res = await mag.post("/api/manager/training", { player: "a", attr: "SIK" }).expect(409);
    expect(res.body.error).toBe("no_active_season");
  });

  it("refuses during the build phase", async () => {
    const mag = await authed(MAG);
    await mag.post("/api/manager/season", { name: "Säsong 1" }).expect(201);
    const res = await mag.post("/api/manager/training", { player: "a", attr: "SIK" }).expect(409);
    expect(res.body.error).toBe("season_not_started");
  });

  it("refuses a member without a team", async () => {
    await seasonInPlay();
    const berra = "76561198000000003";
    member(berra, "[BVS] Berra");
    const anon = await authed(berra);
    const res = await anon.post("/api/manager/training", { player: "a", attr: "SIK" }).expect(409);
    expect(res.body.error).toBe("no_team");
  });

  it("trains one attribute, raises the value and logs the gain", async () => {
    const { mag } = await seasonInPlay();

    const before = await view(mag);
    const player = before.myTeam!.squad[0]!;
    const oldRating = player.ratings.SIK!;
    const expectedGain = trainingGain(oldRating);

    const res = await mag
      .post("/api/manager/training", { player: player.key, attr: "SIK" })
      .expect(200);

    const after = res.body as Awaited<ReturnType<typeof view>>;
    const trained = after.pool.find((p) => p.key === player.key)!;
    expect(trained.ratings.SIK).toBe(oldRating + expectedGain);
    expect(trained.value).toBeGreaterThan(player.value);
    expect(after.myTeam!.trainingLeft).toBe(1);
  });

  it("refuses to train someone else's player", async () => {
    const { mag, kungalv } = await seasonInPlay();
    const kv = await view(kungalv);
    const theirs = kv.myTeam!.squad[0]!;

    const res = await mag
      .post("/api/manager/training", { player: theirs.key, attr: "SIK" })
      .expect(400);
    expect(res.body.message).toContain("inte i din trupp");
  });

  it("refuses an unknown attribute", async () => {
    const { mag } = await seasonInPlay();
    const v = await view(mag);
    const res = await mag
      .post("/api/manager/training", { player: v.myTeam!.squad[0]!.key, attr: "TUR" })
      .expect(400);
    expect(res.body.message).toContain("inget attribut");
  });

  it("refuses a player who is already at the cap", async () => {
    const { mag } = await seasonInPlay();
    const v = await view(mag);
    const player = v.myTeam!.squad[0]!;

    // Betyget skruvas upp rakt i databasen: testet handlar om avslaget, inte
    // om hur gubben blev färdigtränad.
    const ratings = { ...player.ratings, SIK: 90 };
    db.prepare("UPDATE season_players SET ratings_json = ? WHERE player_key = ?").run(
      JSON.stringify(ratings),
      player.key
    );

    const res = await mag
      .post("/api/manager/training", { player: player.key, attr: "SIK" })
      .expect(400);
    expect(res.body.message).toContain("färdigtränad");
  });

  it("allows two sessions per matchday and opens again after the next", async () => {
    // Tre lag ger sex omgångar — serien får inte ta slut mitt i testet.
    // Uppställningen äter av mutationstaket, så räknaren nollställs; det är
    // träningskvoten som provas här, inte rate-limitern.
    const { mag } = await seasonInPlay(3);
    resetRateLimits();
    let v = await view(mag);
    const [a, b] = v.myTeam!.squad;

    await mag.post("/api/manager/training", { player: a!.key, attr: "SIK" }).expect(200);
    await mag.post("/api/manager/training", { player: b!.key, attr: "SKA" }).expect(200);

    const third = await mag
      .post("/api/manager/training", { player: a!.key, attr: "SKA" })
      .expect(409);
    expect(third.body.error).toBe("no_sessions_left");

    // Nästa omgång spelas — passen kommer tillbaka. Uppställningen har ätit av
    // mutationstaket, så räknaren nollställs; det är kvoten som provas.
    resetRateLimits();
    await mag.post("/api/manager/matchday").expect(201);
    v = await view(mag);
    expect(v.myTeam!.trainingLeft).toBe(2);
    await mag.post("/api/manager/training", { player: a!.key, attr: "SKA" }).expect(200);
  });

  // Sista omgången stänger säsongen, så det finns ingen aktiv säsong kvar att
  // träna i — svaret kommer från den kontrollen i stället för från kvoten.
  it("refuses once the season is finished", async () => {
    const { mag } = await seasonInPlay();
    await mag.post("/api/manager/matchday").expect(201);

    const res = await mag.post("/api/manager/training", { player: "a", attr: "SIK" }).expect(409);
    expect(res.body.error).toBe("no_active_season");
    expect(res.body.message).toMatch(/Ingen säsong är igång/);
  });

  // Träningen möter marknaden: den tränade gubben säljs för 70 % av sitt NYA
  // värde — utvecklingsstrategin köp billigt, träna, sälj dyrare är avsiktlig.
  it("sells a trained player at the trained value", async () => {
    const { mag } = await seasonInPlay();

    let v = await view(mag);
    const player = v.myTeam!.squad[0]!;
    const res = await mag
      .post("/api/manager/training", { player: player.key, attr: "SIK" })
      .expect(200);
    const after = res.body as Awaited<ReturnType<typeof view>>;
    const trainedValue = after.pool.find((p) => p.key === player.key)!.value;

    const fundsBefore = after.myTeam!.funds;
    const buy = [...after.pool].filter((p) => !p.takenBy).sort((a, b) => a.value - b.value)[0]!;
    const deal = await mag
      .post("/api/manager/transfer", { sell: player.key, buy: buy.key })
      .expect(200);

    const final = (deal.body as Awaited<ReturnType<typeof view>>).myTeam!;
    expect(final.funds).toBe(fundsBefore + Math.floor(trainedValue * 0.7) - buy.value);
  });
});
