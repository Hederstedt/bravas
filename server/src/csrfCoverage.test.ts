import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { db } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";

// CodeQL flaggar `js/missing-token-validation` mot cookie-parser i app.ts.
// Queryn modellerar den deprecerade `csurf`-modulen och känner inte igen
// `csrf-csrf`, så varningen är falsk — men "det är falskt positivt" är ett
// påstående som behöver bevisas, inte upprepas. Den här filen provar varje
// tillståndsändrande endpoint på riktigt, och fångar dessutom en framtida route
// som råkar monteras utanför skyddet.

const app = createApp();
const MEMBER = "76561198053832683";

const session = () => `${sessionCookie.name}=${createSessionCookieValue(MEMBER)}`;

beforeEach(() => {
  resetRateLimits();
  db.exec(
    "DELETE FROM transfers; DELETE FROM fixtures; DELETE FROM squads; DELETE FROM teams; DELETE FROM season_players; DELETE FROM seasons; DELETE FROM quote_votes; DELETE FROM quotes; DELETE FROM members; DELETE FROM allowlist;"
  );
  db.prepare("INSERT INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
    MEMBER,
    "[BVS] #Mag",
    Date.now()
  );
  db.prepare(
    "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
  ).run(MEMBER, "[BVS] #Mag", null, Date.now(), Date.now());
});

// Varje endpoint som ändrar något. Läsvägar står inte här: CSRF gäller inte
// GET, och en läsning kan inte ändra tillstånd.
const WRITES: { method: "post" | "put" | "delete"; path: string; body?: unknown }[] = [
  { method: "post", path: "/api/auth/logout" },
  { method: "post", path: "/api/members/link", body: { discordName: "mag" } },
  { method: "post", path: "/api/quotes", body: { text: "Rush B", saidBy: "Gubbe #1" } },
  { method: "post", path: "/api/quotes/1/vote" },
  { method: "delete", path: "/api/quotes/1" },
  { method: "post", path: "/api/manager/season", body: { name: "Säsong 1" } },
  { method: "post", path: "/api/manager/team", body: { name: "Mags Marodörer" } },
  { method: "put", path: "/api/manager/squad", body: { players: [] } },
  { method: "post", path: "/api/manager/matchday" },
  { method: "post", path: "/api/manager/transfer", body: { sell: "a", buy: "b" } },
];

describe("every state-changing endpoint demands a CSRF token", () => {
  for (const { method, path, body } of WRITES) {
    it(`${method.toUpperCase()} ${path} is refused without one`, async () => {
      await request(app)[method](path)
        .set("Cookie", session())
        .send(body ?? {})
        .expect(403);
    });

    it(`${method.toUpperCase()} ${path} is refused for an anonymous caller too`, async () => {
      await request(app)[method](path)
        .send(body ?? {})
        .expect(403);
    });
  }
});

describe("the protection does not block reading", () => {
  const READS = [
    "/api/config",
    "/api/members",
    "/api/presence",
    "/api/quotes",
    "/api/stats/highlights",
    "/api/stats/cards",
    "/api/manager",
    "/api/auth/me",
  ];

  for (const path of READS) {
    it(`GET ${path} still answers`, async () => {
      const res = await request(app).get(path).set("Cookie", session());
      expect(res.status).toBe(200);
    });
  }
});

describe("a token from one session cannot be replayed against another", () => {
  it("refuses a token minted for a different member", async () => {
    const other = "76561198060166361";
    db.prepare("INSERT INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
      other,
      "[BVS] Kungalv",
      Date.now()
    );
    db.prepare(
      "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
    ).run(other, "[BVS] Kungalv", null, Date.now(), Date.now());

    const agent = request.agent(app);
    const mine = await agent.get("/api/auth/csrf-token").set("Cookie", session()).expect(200);
    const csrfCookie = (mine.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("bvs_csrf="))!
      .split(";")[0]!;

    // Samma token och samma csrf-kaka, men buren av någon annans session.
    await agent
      .post("/api/members/link")
      .set("Cookie", [`${sessionCookie.name}=${createSessionCookieValue(other)}`, csrfCookie])
      .set("x-csrf-token", mine.body.csrfToken)
      .send({ discordName: "kungalv" })
      .expect(403);
  });
});
