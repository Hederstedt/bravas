import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { crownBvsMonth, db, getMember, saveMonthAwards } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";

const app = createApp();
const MAG = "76561198053832683";
const KUNGALV = "76561198060166361";
const GONE = "76561198060166999";

function sessionFor(steamid64: string) {
  return `${sessionCookie.name}=${createSessionCookieValue(steamid64)}`;
}

function addMember(steamid64: string, name: string) {
  db.prepare("INSERT OR IGNORE INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
    steamid64,
    name,
    Date.now()
  );
  db.prepare(
    "INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login) VALUES (?, ?, ?, ?, ?)"
  ).run(steamid64, name, null, Date.now(), Date.now());
}

// Utmärkelserna hänger på den senast avgjorda månaden, så en krönt månad
// måste finnas för att det ska finnas något att hämta.
function decided(month: string) {
  crownBvsMonth({ month, steamid64: MAG, score: 21 });
  return month;
}

beforeEach(() => {
  resetRateLimits();
  db.exec(
    "DELETE FROM members; DELETE FROM allowlist; DELETE FROM presence_samples; DELETE FROM discord_samples; DELETE FROM bvs_month; DELETE FROM bvs_month_awards;"
  );
});

describe("GET /api/stats/awards", () => {
  // Hela poängen med en egen endpoint. Sajten är publik och indexerad, och
  // någons namn kopplat till en bottenplacering på öppna nätet är en annan
  // sak än samma skämt i Discorden.
  it("turns away a visitor who is not signed in", async () => {
    await request(app).get("/api/stats/awards").expect(401);
  });

  it("turns away a signed-in applicant who is not a member yet", async () => {
    await request(app).get("/api/stats/awards").set("Cookie", sessionFor(GONE)).expect(401);
  });

  it("serves the awards to a signed-in member", async () => {
    addMember(MAG, "[BVS] #Mag");
    addMember(KUNGALV, "[BVS] Kungalv");
    const month = decided("2026-07");
    saveMonthAwards(month, [{ award: "jumbo", steamid64: KUNGALV, value: 1.5 }]);

    const res = await request(app)
      .get("/api/stats/awards")
      .set("Cookie", sessionFor(MAG))
      .expect(200);

    expect(res.body).toEqual({
      month,
      awards: [
        { award: "jumbo", id: getMember(KUNGALV)?.public_id, personaName: "[BVS] Kungalv", value: 1.5 },
      ],
    });
  });

  it("never leaks a steamid64", async () => {
    addMember(MAG, "[BVS] #Mag");
    addMember(KUNGALV, "[BVS] Kungalv");
    const month = decided("2026-07");
    saveMonthAwards(month, [
      { award: "jumbo", steamid64: KUNGALV, value: 1.5 },
      { award: "sofflocket", steamid64: MAG, value: 6.25 },
    ]);

    const res = await request(app)
      .get("/api/stats/awards")
      .set("Cookie", sessionFor(MAG))
      .expect(200);

    expect(JSON.stringify(res.body)).not.toContain(KUNGALV);
    expect(JSON.stringify(res.body)).not.toContain(MAG);
  });

  // Samma regel som vinnaren redan följer: den som lämnat BVS har ingen
  // medlemsrad kvar att slå upp ett opakt id mot.
  it("anonymizes someone who has left the clan since", async () => {
    addMember(MAG, "[BVS] #Mag");
    const month = decided("2026-07");
    saveMonthAwards(month, [{ award: "jumbo", steamid64: GONE, value: 2 }]);

    const res = await request(app)
      .get("/api/stats/awards")
      .set("Cookie", sessionFor(MAG))
      .expect(200);

    expect(res.body.awards[0]).toMatchObject({ id: null, personaName: "Tidigare medlem" });
    expect(JSON.stringify(res.body)).not.toContain(GONE);
  });

  it("reports an empty month before anything has been decided", async () => {
    addMember(MAG, "[BVS] #Mag");

    const res = await request(app)
      .get("/api/stats/awards")
      .set("Cookie", sessionFor(MAG))
      .expect(200);

    expect(res.body).toEqual({ month: null, awards: [] });
  });

  // Utmärkelserna följer den regerande månaden, inte hela historiken — annars
  // hade förra årets träsked hängt kvar på ett kort för alltid.
  it("serves only the most recently decided month's awards", async () => {
    addMember(MAG, "[BVS] #Mag");
    addMember(KUNGALV, "[BVS] Kungalv");
    crownBvsMonth({ month: "2026-06", steamid64: MAG, score: 9 });
    crownBvsMonth({ month: "2026-07", steamid64: MAG, score: 21 });
    saveMonthAwards("2026-06", [{ award: "jumbo", steamid64: MAG, value: 1 }]);
    saveMonthAwards("2026-07", [{ award: "jumbo", steamid64: KUNGALV, value: 2 }]);

    const res = await request(app)
      .get("/api/stats/awards")
      .set("Cookie", sessionFor(MAG))
      .expect(200);

    expect(res.body.month).toBe("2026-07");
    expect(res.body.awards).toHaveLength(1);
    expect(res.body.awards[0].personaName).toBe("[BVS] Kungalv");
  });
});

// Det publika kortsvaret får aldrig börja bära utmärkelserna. Regressionen
// vore tyst: kortet hade sett rätt ut inloggad och läckt en bottenplacering
// till vem som helst med adressen.
describe("GET /api/stats/cards", () => {
  it("says nothing about the wooden spoon to anyone", async () => {
    addMember(MAG, "[BVS] #Mag");
    addMember(KUNGALV, "[BVS] Kungalv");
    const month = decided("2026-07");
    saveMonthAwards(month, [{ award: "jumbo", steamid64: KUNGALV, value: 1.5 }]);

    for (const cookie of [undefined, sessionFor(MAG)]) {
      const req = request(app).get("/api/stats/cards");
      if (cookie) req.set("Cookie", cookie);
      const res = await req.expect(200);

      expect(JSON.stringify(res.body)).not.toContain("jumbo");
      expect(JSON.stringify(res.body)).not.toContain("sofflocket");
    }
  });
});
