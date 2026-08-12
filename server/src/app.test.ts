import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { db } from "./db.ts";
import { createSessionCookieValue } from "./session.ts";
import { sessionCookie } from "./session.ts";

const app = createApp();
const ALLOWED = "76561198053832683";
const NOT_ALLOWED = "76561190000000000";

function sessionFor(steamid64: string) {
  return `${sessionCookie.name}=${createSessionCookieValue(steamid64)}`;
}

beforeEach(() => {
  db.exec("DELETE FROM members; DELETE FROM allowlist;");
  db.prepare("INSERT INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(ALLOWED, "[BVS] #Mag", Date.now());
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
