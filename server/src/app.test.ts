import http from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { broadcast, closeAllSubscribers, subscriberCount } from "./events.ts";
import { resetPresenceSnapshot } from "./presencePoller.ts";
import { crownBvsMonth, db, getMember } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue } from "./session.ts";
import { sessionCookie } from "./session.ts";
import * as steamAuth from "./steamAuth.ts";
import * as wotAuth from "./wotAuth.ts";

const app = createApp();
const ALLOWED = "76561198053832683";
const NOT_ALLOWED = "76561190000000000";
const DAY = 24 * 60 * 60 * 1000;

function sessionFor(steamid64: string) {
  return `${sessionCookie.name}=${createSessionCookieValue(steamid64)}`;
}

beforeEach(() => {
  // Pollerns ögonblicksbild, de öppna strömmarna och räknarna i rate-limitern
  // är modultillstånd som annars läcker mellan fall.
  resetPresenceSnapshot();
  closeAllSubscribers();
  resetRateLimits();
  db.exec(
    "DELETE FROM members; DELETE FROM allowlist; DELETE FROM cs2_stats; DELETE FROM bvs_month; DELETE FROM valheim_playtime; DELETE FROM wot_stats;"
  );
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
  // "Och inget mer" är hela poängen med det här testet: configen går till alla
  // besökare, så varje nytt fält ska vara ett medvetet beslut. wowLinkEnabled
  // är en ren på/av-flagga — den säger att kopplingen finns att använda, aldrig
  // vilka nycklar den använder.
  it("hands out the invite and the feature flag, and nothing else", async () => {
    const res = await request(app).get("/api/config").expect(200);
    expect(res.body).toEqual({
      discordInviteUrl: "https://discord.gg/testinvite",
      wowLinkEnabled: expect.any(Boolean),
    });
  });

  // Server-ID:t skickades hit förr men lästes aldrig av någon komponent, och
  // nu hämtar BFF:en widgeten själv — då hör det inte hemma i klientens config.
  it("keeps the Discord server id in the backend", async () => {
    const res = await request(app).get("/api/config").expect(200);
    expect(JSON.stringify(res.body)).not.toContain("323523542312419348");
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

  // steamid64 är ett stabilt, skrapbart id kopplat till besökarens riktiga
  // Steam-konto — publika svar visar ett opakt id i stället, se db.ts.
  it("lists members with an opaque id, never the real steamid64", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, public_id, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(ALLOWED, "test-public-id-mag", "[BVS] #Mag", "https://avatars.example/mag.jpg", Date.now(), Date.now());

    const res = await request(app).get("/api/members").expect(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0]).toMatchObject({ id: "test-public-id-mag", personaName: "[BVS] #Mag" });
    expect(JSON.stringify(res.body)).not.toContain(ALLOWED);
  });

  // "mine" berättar för den inloggade vilken rad som är hens egen — utan att
  // klienten någonsin behöver jämföra id mot sin egen steamid64.
  it("marks the signed-in visitor's own row mine, and nobody else's", async () => {
    const OTHER = "76561198060166361";
    db.prepare(
      "INSERT INTO members (steamid64, public_id, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(ALLOWED, "test-public-id-mag", "[BVS] #Mag", null, Date.now(), Date.now());
    // members.steamid64 refererar allowlist(steamid64) — den andra raden
    // behöver alltså stå i allowlisten precis som ALLOWED redan gör.
    db.prepare("INSERT INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
      OTHER,
      "[BVS] Kungalv",
      Date.now(),
    );
    db.prepare(
      "INSERT INTO members (steamid64, public_id, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(OTHER, "test-public-id-other", "[BVS] Kungalv", null, Date.now(), Date.now());

    const res = await request(app)
      .get("/api/members")
      .set("Cookie", sessionFor(ALLOWED))
      .expect(200);

    const mine = res.body.members.find((m: { id: string }) => m.id === "test-public-id-mag");
    const other = res.body.members.find((m: { id: string }) => m.id === "test-public-id-other");
    expect(mine.mine).toBe(true);
    expect(other.mine).toBe(false);
  });

  it("marks nothing mine for an anonymous visitor", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, public_id, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(ALLOWED, "test-public-id-mag", "[BVS] #Mag", null, Date.now(), Date.now());

    const res = await request(app).get("/api/members").expect(200);
    expect(res.body.members[0].mine).toBe(false);
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

function ownedGames(minutes: number) {
  return new Response(
    JSON.stringify({ response: { games: [{ appid: 892970, playtime_forever: minutes }] } }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// getHighlights slår mot både CS2- och Valheim-speltidsvägen, som har varsin
// Steam-endpoint. Ett enda mockat svar för alla anrop skulle göra
// GetOwnedGames-frågan ogiltig och få den att räknas som stale i all evighet.
function steamCallsFor(stats: Record<string, number>, minutes = 0) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("GetOwnedGames")) return ownedGames(minutes);
    return steamStats(stats);
  });
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
    const fetchSpy = steamCallsFor({ total_kills: 47821 }, 600);

    await request(app).get("/api/stats/highlights").expect(200);
    const callsAfterFirst = fetchSpy.mock.calls.length;
    const res = await request(app).get("/api/stats/highlights").expect(200);

    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
    expect(res.body.withStats).toBe(1);
  });

  it("keeps serving the cached numbers when Steam goes down", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    steamCallsFor({ total_kills: 47821 }, 600);
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

  it("builds a rated card from a member's Steam stats, with an opaque id instead of the real steamid64", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(steamStats(FULL_STATS));

    const res = await request(app).get("/api/stats/cards").expect(200);

    expect(res.body).toMatchObject({ memberCount: 1, withStats: 1 });
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0]).toMatchObject({
      id: getMember(ALLOWED)?.public_id,
      personaName: "[BVS] #Mag",
      hasStats: true,
      overall: 74,
      tier: "silver",
      position: "KAPTEN",
    });
    expect(res.body.cards[0].attributes).toHaveLength(6);
    expect(res.body.cards[0].comments.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain(ALLOWED);
  });

  it("still returns a card for a member whose profile Steam won't share", async () => {
    // Sektionen får inte tappa en gubbe bara för att profilen är stängd — nu
    // med ett riktigt "okänd"-kort i stället för att helt saknas ur listan,
    // eftersom samma gubbe ändå kan ha länkat World of Tanks.
    addMember(ALLOWED, "[BVS] #Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 403, headers: { "Content-Type": "application/json" } })
    );

    const res = await request(app).get("/api/stats/cards").expect(200);
    expect(res.body).toMatchObject({ memberCount: 1, withStats: 0 });
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0]).toMatchObject({
      id: getMember(ALLOWED)?.public_id,
      hasStats: false,
      tier: "okänd",
      position: "OKÄND",
    });
  });

  it("shares the cache with the highlights endpoint instead of refetching", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    // steamCallsFor besvarar GetOwnedGames rätt (till skillnad från den blanka
    // steamStats-mocken) så Valheim-speltiden faktiskt cachas i stället för
    // att räknas som misslyckad och försökas igen vid varje anrop.
    const fetchSpy = steamCallsFor(FULL_STATS, 600);

    await request(app).get("/api/stats/highlights").expect(200);
    const callsAfterHighlights = fetchSpy.mock.calls.length;
    const res = await request(app).get("/api/stats/cards").expect(200);

    expect(fetchSpy.mock.calls.length).toBe(callsAfterHighlights);
    expect(res.body.withStats).toBe(1);
  });

  // Stjärnan sätts inte i cs2Cards.ts/playerCards.ts — den är inte
  // betygshärledd — utan dekoreras på här, mot den regerande vinnaren.
  it("marks the reigning member of the month on their card", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(steamStats(FULL_STATS));
    crownBvsMonth({ month: "2026-07", steamid64: ALLOWED, score: 12.5 });

    const res = await request(app).get("/api/stats/cards").expect(200);
    expect(res.body.cards[0]).toMatchObject({ id: getMember(ALLOWED)?.public_id, memberOfMonth: true });
  });

  it("marks nobody when there is no reigning winner yet", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(steamStats(FULL_STATS));

    const res = await request(app).get("/api/stats/cards").expect(200);
    expect(res.body.cards[0]).toMatchObject({ memberOfMonth: false });
  });

  it("does not mark someone who won an earlier month but not the most recent one", async () => {
    addMember(ALLOWED, "[BVS] #Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(steamStats(FULL_STATS));
    crownBvsMonth({ month: "2026-06", steamid64: ALLOWED, score: 9 });
    crownBvsMonth({ month: "2026-07", steamid64: "76561198060166361", score: 11 });

    const res = await request(app).get("/api/stats/cards").expect(200);
    expect(res.body.cards[0]).toMatchObject({ id: getMember(ALLOWED)?.public_id, memberOfMonth: false });
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

  const MAG_PUBLIC_ID = "test-public-id-mag";

  function insertMag() {
    db.prepare(
      "INSERT INTO members (steamid64, public_id, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(ALLOWED, MAG_PUBLIC_ID, "[BVS] #Mag", null, Date.now(), Date.now());
  }

  // Presence-kartan är nyckla på det opaka id:t GET /api/members redan visar
  // — aldrig den riktiga steamid64:an, se publicPresence() i presencePoller.ts.
  it("reports presence for members that have logged in", async () => {
    insertMag();
    stubSteam([{ steamid: ALLOWED, personastate: 1, gameextrainfo: "Counter-Strike 2" }]);

    const res = await request(app).get("/api/presence").expect(200);
    expect(res.body.presence[MAG_PUBLIC_ID]).toEqual({ status: "in-game", game: "Counter-Strike 2" });
    expect(JSON.stringify(res.body)).not.toContain(ALLOWED);
  });

  // Presence is decoration: if Steam is down the roster must still render.
  it("degrades to an empty map when Steam fails and nothing was known yet", async () => {
    insertMag();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("steam is down"));

    const res = await request(app).get("/api/presence").expect(200);
    expect(res.body).toEqual({ presence: {} });
  });

  it("keeps serving the last known presence when Steam goes down mid-session", async () => {
    // Pollern äger ögonblicksbilden nu, så ett avbrott mot Steam behöver inte
    // längre tömma rostern — den blir bara en stund gammal.
    insertMag();
    stubSteam([{ steamid: ALLOWED, personastate: 1, gameextrainfo: "Valheim" }]);
    await request(app).get("/api/presence").expect(200);

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("steam is down"));

    const res = await request(app).get("/api/presence").expect(200);
    expect(res.body.presence[MAG_PUBLIC_ID]).toEqual({ status: "in-game", game: "Valheim" });
  });

  it("never reports presence for someone who is not a member", async () => {
    insertMag();
    stubSteam([
      { steamid: ALLOWED, personastate: 1 },
      { steamid: NOT_ALLOWED, personastate: 1 },
    ]);

    const res = await request(app).get("/api/presence").expect(200);
    expect(Object.keys(res.body.presence)).toEqual([MAG_PUBLIC_ID]);
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

describe("GET /api/auth/steam/callback", () => {
  const claimedId = (steamid64: string) => ({
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${steamid64}`,
  });

  function stubSteamIdentity(steamid64: string) {
    vi.spyOn(steamAuth, "verifyCallback").mockResolvedValue(steamid64);
    vi.spyOn(steamAuth, "fetchPlayerSummaries").mockResolvedValue([
      { steamid: steamid64, personaname: "[BVS] #Mag", avatarfull: "https://avatars.example/mag.jpg" },
    ]);
  }

  // Den som precis loggat in för första gången har ett tomt kort och vet inte
  // om att det går att länka fler spel. Kontosidan är där det görs, så dit
  // skickas hen — resten av gänget vill hem till startsidan som förut.
  it("sends a first-time member to the account page", async () => {
    stubSteamIdentity(ALLOWED);

    const res = await request(app)
      .get("/api/auth/steam/callback")
      .query(claimedId(ALLOWED))
      .expect(302);

    expect(res.headers.location).toBe("https://bravas.test/mitt-konto?ny=1");
  });

  it("sends a returning member to the start page", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());
    stubSteamIdentity(ALLOWED);

    const res = await request(app)
      .get("/api/auth/steam/callback")
      .query(claimedId(ALLOWED))
      .expect(302);

    expect(res.headers.location).toBe("https://bravas.test/");
  });

  // Den som inte står i allowlisten kastades förut ut till en query-parameter
  // frontenden aldrig läste. Nu får hen en session och skickas till ansökan —
  // men fortfarande ingen members-rad, och därmed ingenting bakom requireAuth.
  it("sends someone outside the allowlist to the application form", async () => {
    stubSteamIdentity(NOT_ALLOWED);

    const res = await request(app)
      .get("/api/auth/steam/callback")
      .query(claimedId(NOT_ALLOWED))
      .expect(302);

    expect(res.headers.location).toBe("https://bravas.test/ansok");
    expect(db.prepare("SELECT 1 FROM members WHERE steamid64 = ?").get(NOT_ALLOWED)).toBeUndefined();
  });

  it("gives the applicant a session to post the form with", async () => {
    stubSteamIdentity(NOT_ALLOWED);

    const res = await request(app)
      .get("/api/auth/steam/callback")
      .query(claimedId(NOT_ALLOWED))
      .expect(302);

    const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
    expect(setCookie?.some((c) => c.startsWith(`${sessionCookie.name}=`))).toBe(true);
  });

  it("does not put the applicant on the allowlist by letting them in", async () => {
    stubSteamIdentity(NOT_ALLOWED);
    await request(app).get("/api/auth/steam/callback").query(claimedId(NOT_ALLOWED)).expect(302);

    expect(
      db.prepare("SELECT 1 FROM allowlist WHERE steamid64 = ?").get(NOT_ALLOWED)
    ).toBeUndefined();
  });
});

describe("POST /api/auth/logout", () => {
  // Utloggningen behöver en giltig CSRF-token som alla andra skrivningar, så
  // testet går hela vägen: hämta token, posta, läs kakorna som kom tillbaka.
  async function logOut() {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());

    const agent = request.agent(app);
    const session = sessionFor(ALLOWED);
    const tokenRes = await agent.get("/api/auth/csrf-token").set("Cookie", session).expect(200);
    const csrfCookie = (tokenRes.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("bvs_csrf="))!
      .split(";")[0]!;

    const res = await agent
      .post("/api/auth/logout")
      .set("Cookie", [session, csrfCookie])
      .set("x-csrf-token", tokenRes.body.csrfToken as string)
      .expect(204);

    const cleared = (res.headers["set-cookie"] as unknown as string[]) ?? [];
    return {
      session: cleared.find((c) => c.startsWith(`${sessionCookie.name}=`)),
      csrf: cleared.find((c) => c.startsWith("bvs_csrf=")),
    };
  }

  it("clears the session cookie", async () => {
    const { session } = await logOut();
    expect(session).toBeDefined();
    expect(session).toContain("Expires=Thu, 01 Jan 1970");
  });

  // Lämnas CSRF-kakan kvar ligger en token från förra inloggningen bunden till
  // ett steamid som webbläsaren inte längre har någon session för.
  it("clears the CSRF cookie too", async () => {
    const { csrf } = await logOut();
    expect(csrf).toBeDefined();
    expect(csrf).toContain("Expires=Thu, 01 Jan 1970");
  });

  // En kaka satt med andra flaggor ersätter inte den gamla utan lägger sig
  // bredvid — raderingen måste bära samma inställningar som inloggningen.
  it("clears them with the same flags they were set with", async () => {
    const { session, csrf } = await logOut();
    for (const cookie of [session, csrf]) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/");
    }
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
    expect(res.body).toEqual({
      authenticated: true,
      steamid64: ALLOWED,
      isMember: true,
      isAdmin: false,
    });
  });

  // Sökande och medlemmar har båda en giltig kaka. Bara den ena har en
  // members-rad, och frontenden måste kunna se skillnaden för att veta om den
  // ska visa kontosidan eller ansökningsformuläret.
  it("tells an applicant apart from a member", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", sessionFor(NOT_ALLOWED))
      .expect(200);
    expect(res.body).toMatchObject({ authenticated: true, isMember: false, isAdmin: false });
  });

  // Sidan frågar den här vid varje sidladdning, från flera komponenter
  // samtidigt. Låg den kvar bakom inloggningstaket (30 per kvart) räckte ett
  // vanligt klickande runt för att bli utlåst och plötsligt se utloggad ut.
  it("survives more page loads than the login limit allows", async () => {
    for (let i = 0; i < 40; i++) {
      await request(app).get("/api/auth/me").set("Cookie", sessionFor(ALLOWED)).expect(200);
    }
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
    expect(res.body).toMatchObject({ authenticated: true, steamid64: ALLOWED });
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

  // En sökande kan hämta en CSRF-token — annars går ansökan inte att posta.
  // Det ger honom ändå ingen väg in här: requireAuth kräver en members-rad, och
  // en giltig token tar honom bara fram till 401 i stället för 403.
  it("rejects a non-member even when the CSRF token is valid", async () => {
    const agent = request.agent(app);
    const session = sessionFor(NOT_ALLOWED);

    const tokenRes = await agent.get("/api/auth/csrf-token").set("Cookie", session).expect(200);
    const csrfCookie = (tokenRes.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("bvs_csrf="))!
      .split(";")[0]!;

    const res = await agent
      .post("/api/members/link")
      .set("Cookie", [session, csrfCookie])
      .set("x-csrf-token", tokenRes.body.csrfToken as string)
      .send({ discordName: "mag" })
      .expect(401);
    expect(res.body).toEqual({ error: "not_authenticated" });
  });
});

// GET-baserat precis som Steam-inloggningen: en redirect ut och en tillbaka,
// ingen CSRF-token inblandad — samma resonemang som för /api/auth/steam/*.
describe("GET /api/members/wot/login", () => {
  it("rejects an anonymous caller", async () => {
    await request(app).get("/api/members/wot/login").expect(401);
  });

  it("sends a signed-in member to Wargaming", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());

    const res = await request(app)
      .get("/api/members/wot/login")
      .set("Cookie", sessionFor(ALLOWED))
      .expect(302);

    expect(res.headers.location).toContain("api.worldoftanks.eu/wot/auth/login/");
  });
});

describe("GET /api/members/wot/callback", () => {
  it("rejects an anonymous caller", async () => {
    await request(app).get("/api/members/wot/callback").expect(401);
  });

  it("links the account when Wargaming confirms it, then sends the browser home", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());
    vi.spyOn(wotAuth, "verifyCallback").mockResolvedValue({ accountId: "500123456", nickname: "GubbeIRL" });

    const res = await request(app)
      .get("/api/members/wot/callback")
      .set("Cookie", sessionFor(ALLOWED))
      .query({ status: "ok", account_id: "500123456", access_token: "tok" })
      .expect(302);

    expect(res.headers.location).toBe("https://bravas.test/?wot=linked");
    const stored = db.prepare("SELECT wot_account_id, wot_nickname FROM members WHERE steamid64 = ?").get(ALLOWED);
    expect(stored).toEqual({ wot_account_id: "500123456", wot_nickname: "GubbeIRL" });
  });

  it("sends the browser home with a failure flag instead of linking a forged callback", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());
    vi.spyOn(wotAuth, "verifyCallback").mockResolvedValue(null);

    const res = await request(app)
      .get("/api/members/wot/callback")
      .set("Cookie", sessionFor(ALLOWED))
      .query({ status: "ok", account_id: "500123456", access_token: "forged" })
      .expect(302);

    expect(res.headers.location).toBe("https://bravas.test/?wot=failed");
    const stored = db.prepare("SELECT wot_account_id FROM members WHERE steamid64 = ?").get(ALLOWED) as {
      wot_account_id: string | null;
    };
    expect(stored.wot_account_id).toBeNull();
  });
});

// Hjälpfunktion delad av båda unlink-testerna nedan — hämtar en giltig
// CSRF-kaka+token åt en redan inloggad medlem.
async function csrfFor(agent: ReturnType<typeof request.agent>, steamid64: string) {
  const session = sessionFor(steamid64);
  const tokenRes = await agent.get("/api/auth/csrf-token").set("Cookie", session).expect(200);
  const csrfCookie = (tokenRes.headers["set-cookie"] as unknown as string[])
    .find((c) => c.startsWith("bvs_csrf="))!
    .split(";")[0]!;
  return { session, csrfCookie, csrfToken: tokenRes.body.csrfToken as string };
}

describe("POST /api/members/discord/unlink", () => {
  it("rejects an anonymous caller", async () => {
    await request(app).post("/api/members/discord/unlink").expect(403);
  });

  it("clears the Discord name for a signed-in member", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, discord_name, first_login, last_login) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, "mag#1234", Date.now(), Date.now());

    const agent = request.agent(app);
    const { session, csrfCookie, csrfToken } = await csrfFor(agent, ALLOWED);

    await agent
      .post("/api/members/discord/unlink")
      .set("Cookie", [session, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .expect(204);

    const stored = db.prepare("SELECT discord_name FROM members WHERE steamid64 = ?").get(ALLOWED) as {
      discord_name: string | null;
    };
    expect(stored.discord_name).toBeNull();
  });
});

describe("POST /api/members/wot/unlink", () => {
  it("rejects an anonymous caller", async () => {
    await request(app).post("/api/members/wot/unlink").expect(403);
  });

  // Kopplingen och den cachade statistiken hör ihop — en föräldralös
  // wot_stats-rad för ett konto ingen längre pekar på är bara skräp.
  it("clears the World of Tanks account and its cached stats for a signed-in member", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, wot_account_id, wot_nickname, first_login, last_login) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, "500123456", "GubbeIRL", Date.now(), Date.now());
    db.prepare(
      "INSERT INTO wot_stats (wot_account_id, stats_json, fetched_at) VALUES (?, ?, ?)"
    ).run("500123456", "{}", Date.now());

    const agent = request.agent(app);
    const { session, csrfCookie, csrfToken } = await csrfFor(agent, ALLOWED);

    await agent
      .post("/api/members/wot/unlink")
      .set("Cookie", [session, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .expect(204);

    const stored = db.prepare("SELECT wot_account_id, wot_nickname FROM members WHERE steamid64 = ?").get(
      ALLOWED
    ) as { wot_account_id: string | null; wot_nickname: string | null };
    expect(stored).toEqual({ wot_account_id: null, wot_nickname: null });

    const cached = db.prepare("SELECT 1 FROM wot_stats WHERE wot_account_id = ?").get("500123456");
    expect(cached).toBeUndefined();
  });

  it("does nothing harmful when nothing was linked", async () => {
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(ALLOWED, "[BVS] #Mag", null, Date.now(), Date.now());

    const agent = request.agent(app);
    const { session, csrfCookie, csrfToken } = await csrfFor(agent, ALLOWED);

    await agent
      .post("/api/members/wot/unlink")
      .set("Cookie", [session, csrfCookie])
      .set("x-csrf-token", csrfToken)
      .expect(204);
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
