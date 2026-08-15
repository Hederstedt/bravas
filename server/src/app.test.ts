import http from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { broadcast, closeAllSubscribers, subscriberCount } from "./events.ts";
import { resetPresenceSnapshot } from "./presencePoller.ts";
import { db } from "./db.ts";
import { createSessionCookieValue } from "./session.ts";
import { sessionCookie } from "./session.ts";

const app = createApp();
const ALLOWED = "76561198053832683";
const NOT_ALLOWED = "76561190000000000";
const DAY = 24 * 60 * 60 * 1000;

function sessionFor(steamid64: string) {
  return `${sessionCookie.name}=${createSessionCookieValue(steamid64)}`;
}

beforeEach(() => {
  // Pollerns ögonblicksbild och de öppna strömmarna är modultillstånd som
  // annars läcker mellan fall.
  resetPresenceSnapshot();
  closeAllSubscribers();
  db.exec("DELETE FROM members; DELETE FROM allowlist; DELETE FROM cs2_stats;");
  db.prepare("INSERT INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(ALLOWED, "[BVS] #Mag", Date.now());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Processen kan leva medan databasen är låst eller Steam-nyckeln utgången —
// Restart=on-failure i systemd fångar bara krasch.
describe("GET /api/health", () => {
  it("answers without a session", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.uptime).toBe("number");
  });
});

describe("GET /api/config", () => {
  it("exposes only the public Discord fields", async () => {
    const res = await request(app).get("/api/config").expect(200);
    expect(res.body).toEqual({
      discordServerId: "323523542312419348",
      discordInviteUrl: "https://discord.gg/testinvite",
    });
  });

  it("never leaks the Steam API key or session secret", async () => {
    const res = await request(app).get("/api/config").expect(200);
    expect(JSON.stringify(res.body)).not.toContain("test-steam-key");
    expect(JSON.stringify(res.body)).not.toContain("test-session-secret");
  });
});

describe("GET /api/members", () => {
  it("returns an empty roster before anyone has logged in", async () => {
    const res = await request(app).get("/api/members").expect(200);
    expect(res.body).toEqual({ members: [] });
  });

  it("lists members that have logged in", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", "https://avatars.example/mag.jpg", Date.now(), Date.now());

    const res = await request(app).get("/api/members").expect(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0]).toMatchObject({ steamid64: ALLOWED, personaName: "[BVS] #Mag" });
  });
});

// Delas av highlights- och cards-testerna: båda hänger på samma cache och
// samma Steam-svar.
function steamStats(stats: Record<string, number>) {
  return new Response(
    JSON.stringify({
      playerstats: { stats: Object.entries(stats).map(([name, value]) => ({ name, value })) },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function addMember(steamid64: string, personaName: string) {
  db.prepare("INSERT OR IGNORE INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
    steamid64,
    personaName,
    Date.now()
  );
  db.prepare(
    "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
  ).run(steamid64, personaName, null, Date.now(), Date.now());
}

describe("GET /api/stats/highlights", () => {
  it("returns no highlights before anyone has logged in", async () => {
    const res = await request(app).get("/api/stats/highlights").expect(200);
    expect(res.body).toEqual({ highlights: [], memberCount: 0, withStats: 0 });
  });

  it("builds highlights from members' Steam stats", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      steamStats({ total_kills: 47821, total_wins: 21379, total_time_played: 3410035 })
    );

    const res = await request(app).get("/api/stats/highlights").expect(200);
    const kills = res.body.highlights.find((h: { label: string }) => h.label === "Flest kills");
    expect(kills.holder).toBe("[BVS] #Mag");
    expect(res.body).toMatchObject({ memberCount: 1, withStats: 1 });
  });

  // Six of ten profiles are closed; those members simply don't contribute.
  it("counts members whose stats Steam refuses to share", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 403, headers: { "Content-Type": "application/json" } })
    );

    const res = await request(app).get("/api/stats/highlights").expect(200);
    expect(res.body).toMatchObject({ memberCount: 1, withStats: 0, highlights: [] });
  });

  it("serves cached stats instead of calling Steam again", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(steamStats({ total_kills: 47821 }));

    await request(app).get("/api/stats/highlights").expect(200);
    const callsAfterFirst = fetchSpy.mock.calls.length;
    const res = await request(app).get("/api/stats/highlights").expect(200);

    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
    expect(res.body.withStats).toBe(1);
  });

  it("keeps serving the cached numbers when Steam goes down", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(steamStats({ total_kills: 47821 }));
    await request(app).get("/api/stats/highlights").expect(200);

    db.prepare("UPDATE cs2_stats SET fetched_at = 0").run();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("steam is down"));

    const res = await request(app).get("/api/stats/highlights").expect(200);
    expect(res.body.withStats).toBe(1);
  });
});

describe("GET /api/stats/cards", () => {
  // En full uppsättning räknare så kortet får riktiga attribut att visa.
  const FULL_STATS = {
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
  };

  it("is not swallowed by the /:steamId route", async () => {
    // "cards" är ingen steamid — utan den egna routen först hade den här
    // förfrågan svarat 404 från allowlist-kontrollen.
    const res = await request(app).get("/api/stats/cards").expect(200);
    expect(res.body).toHaveProperty("cards");
  });

  it("returns no cards before anyone has logged in", async () => {
    const res = await request(app).get("/api/stats/cards").expect(200);
    expect(res.body).toEqual({ cards: [], memberCount: 0, withStats: 0 });
  });

  it("builds a rated card from a member's Steam stats", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(steamStats(FULL_STATS));

    const res = await request(app).get("/api/stats/cards").expect(200);

    expect(res.body).toMatchObject({ memberCount: 1, withStats: 1 });
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0]).toMatchObject({
      steamid64: ALLOWED,
      personaName: "[BVS] #Mag",
      hasStats: true,
      overall: 74,
      tier: "silver",
      position: "AWP",
    });
    expect(res.body.cards[0].attributes).toHaveLength(6);
    expect(res.body.cards[0].comments.length).toBeGreaterThan(0);
  });

  it("still returns a card for a member whose profile Steam won't share", async () => {
    // Sektionen får inte tappa en gubbe bara för att profilen är stängd.
    addMember(ALLOWED, "[BVS] #Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 403, headers: { "Content-Type": "application/json" } })
    );

    const res = await request(app).get("/api/stats/cards").expect(200);
    expect(res.body).toMatchObject({ memberCount: 1, withStats: 0, cards: [] });
  });

  it("shares the cache with the highlights endpoint instead of refetching", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(steamStats(FULL_STATS));

    await request(app).get("/api/stats/highlights").expect(200);
    const callsAfterHighlights = fetchSpy.mock.calls.length;
    const res = await request(app).get("/api/stats/cards").expect(200);

    expect(fetchSpy.mock.calls.length).toBe(callsAfterHighlights);
    expect(res.body.withStats).toBe(1);
  });
});

describe("GET /api/presence", () => {
  function stubSteam(players: unknown[]) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ response: { players } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  it("returns an empty map before anyone has logged in, without calling Steam", async () => {
    const fetchSpy = stubSteam([]);
    const res = await request(app).get("/api/presence").expect(200);
    expect(res.body).toEqual({ presence: {} });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports presence for members that have logged in", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());
    stubSteam([{ steamid: ALLOWED, personastate: 1, gameextrainfo: "Counter-Strike 2" }]);

    const res = await request(app).get("/api/presence").expect(200);
    expect(res.body.presence[ALLOWED]).toEqual({ status: "in-game", game: "Counter-Strike 2" });
  });

  // Presence is decoration: if Steam is down the roster must still render.
  it("degrades to an empty map when Steam fails and nothing was known yet", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("steam is down"));

    const res = await request(app).get("/api/presence").expect(200);
    expect(res.body).toEqual({ presence: {} });
  });

  it("keeps serving the last known presence when Steam goes down mid-session", async () => {
    // Pollern äger ögonblicksbilden nu, så ett avbrott mot Steam behöver inte
    // längre tömma rostern — den blir bara en stund gammal.
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());
    stubSteam([{ steamid: ALLOWED, personastate: 1, gameextrainfo: "Valheim" }]);
    await request(app).get("/api/presence").expect(200);

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("steam is down"));

    const res = await request(app).get("/api/presence").expect(200);
    expect(res.body.presence[ALLOWED]).toEqual({ status: "in-game", game: "Valheim" });
  });

  it("never reports presence for someone who is not a member", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());
    stubSteam([
      { steamid: ALLOWED, personastate: 1 },
      { steamid: NOT_ALLOWED, personastate: 1 },
    ]);

    const res = await request(app).get("/api/presence").expect(200);
    expect(Object.keys(res.body.presence)).toEqual([ALLOWED]);
  });
});

// The frontend probes this on every page load to decide whether to show the
// login button. Anonymous visitors are the normal case, not an error — a 401
// here would put a red entry in every visitor's console.
describe("GET /api/auth/steam/login", () => {
  // Steam skickar tillbaka besökaren till den här adressen, så den måste peka
  // dit webbläsaren faktiskt står. Är den hårdkodad till driften kan man aldrig
  // bli inloggad lokalt — kakan hamnar på fel värd.
  it("sends the visitor back to the origin they came from", async () => {
    const res = await request(app).get("/api/auth/steam/login").expect(302);
    const target = new URL(res.headers.location as string);

    expect(target.searchParams.get("openid.return_to")).toBe(
      "https://bravas.test/api/auth/steam/callback"
    );
    expect(target.searchParams.get("openid.realm")).toBe("https://bravas.test");
  });
});

describe("GET /api/auth/me", () => {
  it("reports an anonymous visitor without erroring", async () => {
    const res = await request(app).get("/api/auth/me").expect(200);
    expect(res.body).toEqual({ authenticated: false });
  });

  it("reports a signed-in member", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", sessionFor(ALLOWED))
      .expect(200);
    expect(res.body).toEqual({ authenticated: true, steamid64: ALLOWED });
  });

  it("treats a tampered session cookie as anonymous", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${sessionCookie.name}=not-a-valid-signed-value`)
      .expect(200);
    expect(res.body).toEqual({ authenticated: false });
  });

  // Glidande session: så länge man tittar förbi då och då ska man aldrig
  // behöva logga in igen.
  it("extends a session that is past halfway to expiry", async () => {
    const issuedAt = Date.now() - 20 * DAY;
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${sessionCookie.name}=${createSessionCookieValue(ALLOWED, issuedAt)}`)
      .expect(200);

    const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
    const renewed = setCookie?.find((c) => c.startsWith(`${sessionCookie.name}=`));
    expect(renewed).toBeDefined();
    expect(renewed).toContain("HttpOnly");
    expect(renewed).toContain("Max-Age=2592000");
    expect(res.body).toEqual({ authenticated: true, steamid64: ALLOWED });
  });

  it("leaves a fresh session alone instead of setting a cookie every page load", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", sessionFor(ALLOWED))
      .expect(200);

    const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
    expect(setCookie?.some((c) => c.startsWith(`${sessionCookie.name}=`))).not.toBe(true);
  });

  it("does not revive a session that already ran out", async () => {
    const issuedAt = Date.now() - 40 * DAY;
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${sessionCookie.name}=${createSessionCookieValue(ALLOWED, issuedAt)}`)
      .expect(200);

    expect(res.body).toEqual({ authenticated: false });
    const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
    expect(setCookie?.some((c) => c.startsWith(`${sessionCookie.name}=`))).not.toBe(true);
  });
});

// CSRF protection is mounted globally, so it answers before requireAuth ever
// runs: a token-less write is 403 whether or not the caller has a session.
describe("POST /api/members/link", () => {
  it("rejects an anonymous caller", async () => {
    await request(app).post("/api/members/link").send({ discordName: "mag" }).expect(403);
  });

  it("rejects a signed session for someone who never logged in", async () => {
    await request(app)
      .post("/api/members/link")
      .set("Cookie", sessionFor(NOT_ALLOWED))
      .send({ discordName: "mag" })
      .expect(403);
  });

  it("rejects a non-member even when the CSRF token is valid", async () => {
    const agent = request.agent(app);
    const session = sessionFor(NOT_ALLOWED);

    const tokenRes = await agent.get("/api/auth/csrf-token").set("Cookie", session).expect(401);
    expect(tokenRes.body).toEqual({ error: "not_authenticated" });
  });
});

describe("CSRF protection", () => {
  it("blocks a state-changing request that carries a session but no CSRF token", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());

    await request(app)
      .post("/api/members/link")
      .set("Cookie", sessionFor(ALLOWED))
      .send({ discordName: "mag" })
      .expect(403);
  });

  it("allows a state-changing request once a matching CSRF token is supplied", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());

    const agent = request.agent(app);
    const session = sessionFor(ALLOWED);

    const tokenRes = await agent.get("/api/auth/csrf-token").set("Cookie", session).expect(200);
    const csrfToken = tokenRes.body.csrfToken as string;
    const csrfCookie = (tokenRes.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("bvs_csrf="))!;

    await agent
      .post("/api/members/link")
      .set("Cookie", [session, csrfCookie.split(";")[0]])
      .set("x-csrf-token", csrfToken)
      .send({ discordName: "mag#1234" })
      .expect(204);

    const stored = db.prepare("SELECT discord_name FROM members WHERE steamid64 = ?").get(ALLOWED) as {
      discord_name: string;
    };
    expect(stored.discord_name).toBe("mag#1234");
  });
});

describe("GET /api/stats/:steamId", () => {
  it("404s for a steamid that is not on the allowlist", async () => {
    await request(app).get(`/api/stats/${NOT_ALLOWED}`).expect(404);
  });

  it("404s for a malformed steamid without calling Steam", async () => {
    await request(app).get("/api/stats/not-a-steamid").expect(404);
  });
});

describe("GET /api/events", () => {
  // Supertest väntar på att svaret ska ta slut, vilket en ström aldrig gör.
  // Därför öppnas den mot en riktig lyssnande server och läses bit för bit.
  function openStream(server: import("node:http").Server) {
    const { port } = server.address() as import("node:net").AddressInfo;
    return new Promise<{
      status: number;
      headers: Record<string, string | string[] | undefined>;
      chunks: string[];
      close: () => void;
    }>((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/events" }, (res) => {
        const chunks: string[] = [];
        res.setEncoding("utf8");
        res.on("data", (c: string) => chunks.push(c));
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          chunks,
          close: () => req.destroy(),
        });
      });
      req.on("error", reject);
    });
  }

  const tick = () => new Promise((r) => setTimeout(r, 30));

  let server: import("node:http").Server;

  beforeEach(async () => {
    server = await new Promise<import("node:http").Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
  });

  afterEach(async () => {
    closeAllSubscribers();
    await new Promise((r) => server.close(r));
  });

  it("answers as an event stream that proxies must not buffer", async () => {
    const stream = await openStream(server);
    await tick();

    expect(stream.status).toBe(200);
    expect(stream.headers["content-type"]).toContain("text/event-stream");
    // Utan de här två buffrar nginx och Cloudflare strömmen till tystnad.
    expect(stream.headers["cache-control"]).toContain("no-transform");
    expect(stream.headers["x-accel-buffering"]).toBe("no");

    stream.close();
  });

  it("delivers a broadcast to a connected client", async () => {
    const stream = await openStream(server);
    await tick();

    broadcast("quote", { reason: "added" });
    await tick();

    const body = stream.chunks.join("");
    expect(body).toContain("event: quote");
    expect(body).toContain('"reason":"added"');

    stream.close();
  });

  it("forgets the client once it disconnects", async () => {
    const stream = await openStream(server);
    await tick();
    expect(subscriberCount()).toBe(1);

    stream.close();
    await tick();

    expect(subscriberCount()).toBe(0);
  });
});
