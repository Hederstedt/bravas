import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { db } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";
import * as valheimQuery from "./valheimQuery.ts";
import { resetValheimSnapshot } from "./valheimPoller.ts";

const app = createApp();
const MAG = "76561198053832683";
const OUTSIDER = "76561190000000000";

function sessionFor(steamid64: string) {
  return `${sessionCookie.name}=${createSessionCookieValue(steamid64)}`;
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

beforeEach(() => {
  db.exec("DELETE FROM members; DELETE FROM allowlist;");
  resetRateLimits();
  resetValheimSnapshot();
  addMember(MAG, "[BVS] #Mag");
  config.valheimAddress = "valheim.bravas.se:2456";
  config.valheimServerName = "Bravas Valheim Server";
  config.valheimPassword = "hemligt123";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/valheim/status", () => {
  it("shows online status and player counts to anyone, no login required", async () => {
    vi.spyOn(valheimQuery, "queryValheimServer").mockResolvedValue({
      online: true,
      players: 2,
      maxPlayers: 10,
    });

    const res = await request(app).get("/api/valheim/status").expect(200);

    expect(res.body).toMatchObject({ online: true, players: 2, maxPlayers: 10 });
  });

  it("shows the address publicly", async () => {
    vi.spyOn(valheimQuery, "queryValheimServer").mockResolvedValue({
      online: true,
      players: 0,
      maxPlayers: 10,
    });

    const res = await request(app).get("/api/valheim/status").expect(200);

    expect(res.body.address).toBe("valheim.bravas.se:2456");
  });

  it("hides the server name and password from an anonymous visitor", async () => {
    vi.spyOn(valheimQuery, "queryValheimServer").mockResolvedValue({
      online: true,
      players: 0,
      maxPlayers: 10,
    });

    const res = await request(app).get("/api/valheim/status").expect(200);

    expect(res.body.serverName).toBeNull();
    expect(res.body.password).toBeNull();
    expect(res.body.signedIn).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("hemligt123");
  });

  it("hides the server name and password from a session outside the roster", async () => {
    vi.spyOn(valheimQuery, "queryValheimServer").mockResolvedValue({
      online: true,
      players: 0,
      maxPlayers: 10,
    });

    const res = await request(app)
      .get("/api/valheim/status")
      .set("Cookie", sessionFor(OUTSIDER))
      .expect(200);

    expect(res.body.serverName).toBeNull();
    expect(res.body.password).toBeNull();
  });

  it("reveals the server name and password to a signed-in member", async () => {
    vi.spyOn(valheimQuery, "queryValheimServer").mockResolvedValue({
      online: true,
      players: 0,
      maxPlayers: 10,
    });

    const res = await request(app)
      .get("/api/valheim/status")
      .set("Cookie", sessionFor(MAG))
      .expect(200);

    expect(res.body.serverName).toBe("Bravas Valheim Server");
    expect(res.body.password).toBe("hemligt123");
    // Flaggan låter kortet skilja "du är utloggad" från "servern saknar
    // uppgifterna i sin .env".
    expect(res.body.signedIn).toBe(true);
  });

  it("reports offline with null player counts when the server doesn't answer", async () => {
    vi.spyOn(valheimQuery, "queryValheimServer").mockResolvedValue({
      online: false,
      players: null,
      maxPlayers: null,
    });

    const res = await request(app).get("/api/valheim/status").expect(200);

    expect(res.body).toMatchObject({ online: false, players: null, maxPlayers: null });
  });

  it("is rate limited like other public read endpoints", async () => {
    vi.spyOn(valheimQuery, "queryValheimServer").mockResolvedValue({
      online: true,
      players: 0,
      maxPlayers: 10,
    });

    const res = await request(app).get("/api/valheim/status").expect(200);
    expect(res.headers["ratelimit-limit"]).toBeDefined();
  });
});
