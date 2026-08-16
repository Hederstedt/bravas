import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { MAX_APPLICATION_MESSAGE } from "./applications.ts";
import { db } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";
import * as steamAuth from "./steamAuth.ts";

const app = createApp();

// Speglar ADMIN_STEAMIDS i src/test/setup.ts. Admin är medvetet ingen av de
// vanliga gubbarna — annars kan "är medlem" och "är admin" glida ihop.
const ADMIN = "76561190000000009";
const MEMBER = "76561198053832683";
const APPLICANT = "76561190000000000";

function sessionFor(steamid64: string) {
  return `${sessionCookie.name}=${createSessionCookieValue(steamid64)}`;
}

async function csrfFor(session: string) {
  const res = await request(app).get("/api/auth/csrf-token").set("Cookie", session).expect(200);
  const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
    c.startsWith("bvs_csrf=")
  )!;
  return { token: res.body.csrfToken as string, cookie: cookie.split(";")[0]! };
}

async function post(steamid64: string, path: string, body?: object) {
  const session = sessionFor(steamid64);
  const { token, cookie } = await csrfFor(session);
  return request(app)
    .post(path)
    .set("Cookie", [session, cookie])
    .set("x-csrf-token", token)
    .send(body ?? {});
}

async function del(steamid64: string, path: string) {
  const session = sessionFor(steamid64);
  const { token, cookie } = await csrfFor(session);
  return request(app).delete(path).set("Cookie", [session, cookie]).set("x-csrf-token", token);
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

function stubSteam(personaName: string, avatar: string | null = null) {
  return vi.spyOn(steamAuth, "fetchPlayerSummaries").mockResolvedValue([
    { steamid: APPLICANT, personaname: personaName, avatarfull: avatar ?? "" },
  ]);
}

async function apply(steamid64: string, message: string) {
  return post(steamid64, "/api/members/apply", { message });
}

beforeEach(() => {
  resetRateLimits();
  db.exec(
    "DELETE FROM quote_votes; DELETE FROM quotes; DELETE FROM applications; DELETE FROM members; DELETE FROM allowlist;"
  );
  addMember(ADMIN, "[BVS] Chefen");
  addMember(MEMBER, "[BVS] #Mag");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Den som inte står i allowlisten får en session men ingen members-rad. Kakan
// duger till exakt två saker: hämta en CSRF-token och posta en ansökan.
describe("GET /api/auth/csrf-token for an applicant", () => {
  it("hands a token to a signed-in visitor who is not a member", async () => {
    const res = await request(app)
      .get("/api/auth/csrf-token")
      .set("Cookie", sessionFor(APPLICANT))
      .expect(200);
    expect(typeof res.body.csrfToken).toBe("string");
  });

  it("still refuses an anonymous visitor", async () => {
    await request(app).get("/api/auth/csrf-token").expect(401);
  });
});

describe("POST /api/members/apply", () => {
  it("stores an application for a signed-in visitor who is not a member", async () => {
    stubSteam("Ny Gubbe", "https://avatars.example/ny.jpg");

    expect((await apply(APPLICANT, "Hej! Jag lirar CS2 med Mag ibland.")).status).toBe(201);

    const row = db.prepare("SELECT * FROM applications WHERE steamid64 = ?").get(APPLICANT) as {
      persona_name: string;
      avatar_url: string | null;
      message: string;
      status: string;
    };
    expect(row).toMatchObject({
      persona_name: "Ny Gubbe",
      avatar_url: "https://avatars.example/ny.jpg",
      message: "Hej! Jag lirar CS2 med Mag ibland.",
      status: "pending",
    });
  });

  // Namn och avatar hämtas från Steam, aldrig från formuläret — annars kan vem
  // som helst ansöka i någon annans namn.
  it("takes the name from Steam and ignores what the form claims", async () => {
    stubSteam("Ny Gubbe");

    expect((await apply(APPLICANT, "Släpp in mig")).status).toBe(201);
    await post(APPLICANT, "/api/members/apply", {
      message: "Släpp in mig",
      personaName: "[BVS] #Mag",
    });

    const row = db
      .prepare("SELECT persona_name FROM applications WHERE steamid64 = ?")
      .get(APPLICANT) as { persona_name: string };
    expect(row.persona_name).toBe("Ny Gubbe");
  });

  // Steam kan vara nere just då. Ansökan är viktigare än ett snyggt namn.
  it("still records the application when Steam will not answer", async () => {
    vi.spyOn(steamAuth, "fetchPlayerSummaries").mockRejectedValue(new Error("steam is down"));

    expect((await apply(APPLICANT, "Släpp in mig")).status).toBe(201);

    const row = db
      .prepare("SELECT persona_name FROM applications WHERE steamid64 = ?")
      .get(APPLICANT) as { persona_name: string };
    expect(row.persona_name).toBe(APPLICANT);
  });

  it("refuses an anonymous caller", async () => {
    await request(app).post("/api/members/apply").send({ message: "Släpp in mig" }).expect(403);
  });

  it("refuses an empty message", async () => {
    stubSteam("Ny Gubbe");
    const res = await apply(APPLICANT, "   ");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "message_required" });
  });

  it("refuses a message longer than the limit", async () => {
    stubSteam("Ny Gubbe");
    const res = await apply(APPLICANT, "a".repeat(MAX_APPLICATION_MESSAGE + 1));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "message_too_long" });
  });

  // Den som redan är med har inget att ansöka om, och en ansökan från en
  // medlem skulle bara förvirra i admin-listan.
  it("refuses someone who is already a member", async () => {
    const res = await post(MEMBER, "/api/members/apply", { message: "Släpp in mig" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "already_member" });
  });

  it("replaces an earlier application rather than erroring on a second try", async () => {
    stubSteam("Ny Gubbe");
    expect((await apply(APPLICANT, "Första försöket")).status).toBe(201);
    expect((await apply(APPLICANT, "Andra försöket, tydligare")).status).toBe(201);

    const rows = db.prepare("SELECT message FROM applications").all() as { message: string }[];
    expect(rows).toEqual([{ message: "Andra försöket, tydligare" }]);
  });
});

// Sidan måste kunna visa vem man ansöker som — en sökande finns inte i
// /api/members, så identiteten får hämtas här.
describe("GET /api/members/apply", () => {
  it("tells an applicant which Steam account they would be applying as", async () => {
    stubSteam("Ny Gubbe", "https://avatars.example/ny.jpg");

    const res = await request(app)
      .get("/api/members/apply")
      .set("Cookie", sessionFor(APPLICANT))
      .expect(200);

    expect(res.body).toEqual({
      status: "none",
      personaName: "Ny Gubbe",
      avatarUrl: "https://avatars.example/ny.jpg",
    });
  });

  // Den som kommer tillbaka ska se att ansökan ligger inne, inte ett tomt
  // formulär som ser ut att ha slukat den.
  it("reports a pending application on a return visit, without calling Steam again", async () => {
    stubSteam("Ny Gubbe", "https://avatars.example/ny.jpg");
    expect((await apply(APPLICANT, "Släpp in mig")).status).toBe(201);

    // Samma spion som stubSteam satte, så räknaren bär med sig anropet från
    // ansökan om den inte nollställs.
    const steam = vi
      .spyOn(steamAuth, "fetchPlayerSummaries")
      .mockRejectedValue(new Error("should not be called"));
    steam.mockClear();

    const res = await request(app)
      .get("/api/members/apply")
      .set("Cookie", sessionFor(APPLICANT))
      .expect(200);

    expect(res.body).toMatchObject({ status: "pending", personaName: "Ny Gubbe" });
    expect(steam).not.toHaveBeenCalled();
  });

  it("reports a rejected application as such", async () => {
    stubSteam("Ny Gubbe");
    expect((await apply(APPLICANT, "Släpp in mig")).status).toBe(201);
    expect((await post(ADMIN, `/api/admin/applications/${APPLICANT}/reject`)).status).toBe(204);

    const res = await request(app)
      .get("/api/members/apply")
      .set("Cookie", sessionFor(APPLICANT))
      .expect(200);

    expect(res.body.status).toBe("rejected");
  });

  it("refuses an anonymous visitor", async () => {
    await request(app).get("/api/members/apply").expect(401);
  });
});

describe("GET /api/admin/applications", () => {
  async function seedApplication() {
    stubSteam("Ny Gubbe", "https://avatars.example/ny.jpg");
    expect((await apply(APPLICANT, "Släpp in mig")).status).toBe(201);
    vi.restoreAllMocks();
  }

  it("lists what is waiting, for an admin", async () => {
    await seedApplication();

    const res = await request(app)
      .get("/api/admin/applications")
      .set("Cookie", sessionFor(ADMIN))
      .expect(200);

    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0]).toMatchObject({
      steamid64: APPLICANT,
      personaName: "Ny Gubbe",
      avatarUrl: "https://avatars.example/ny.jpg",
      message: "Släpp in mig",
      status: "pending",
    });
  });

  // Ingen roll- eller behörighetsmodell fanns förut i kodbasen. Gaten är
  // steamid mot env, och den gäller oavsett vad frontenden råkar visa.
  it("refuses an ordinary member", async () => {
    await request(app)
      .get("/api/admin/applications")
      .set("Cookie", sessionFor(MEMBER))
      .expect(403);
  });

  it("refuses an anonymous visitor", async () => {
    await request(app).get("/api/admin/applications").expect(401);
  });

  it("refuses an admin steamid that never logged in", async () => {
    db.prepare("DELETE FROM members WHERE steamid64 = ?").run(ADMIN);
    await request(app).get("/api/admin/applications").set("Cookie", sessionFor(ADMIN)).expect(401);
  });
});

describe("POST /api/admin/applications/:steamid64/approve", () => {
  beforeEach(async () => {
    stubSteam("Ny Gubbe");
    expect((await apply(APPLICANT, "Släpp in mig")).status).toBe(201);
    vi.restoreAllMocks();
  });

  // Godkännande skriver bara allowlisten. Members-raden skapas av callbacken
  // nästa gång de loggar in, precis som för alla andra.
  it("puts the applicant on the allowlist and marks the application approved", async () => {
    expect((await post(ADMIN, `/api/admin/applications/${APPLICANT}/approve`)).status).toBe(204);

    expect(db.prepare("SELECT 1 FROM allowlist WHERE steamid64 = ?").get(APPLICANT)).toBeDefined();
    const row = db.prepare("SELECT status FROM applications WHERE steamid64 = ?").get(APPLICANT);
    expect(row).toEqual({ status: "approved" });
  });

  it("creates no member row — that happens at their next login", async () => {
    expect((await post(ADMIN, `/api/admin/applications/${APPLICANT}/approve`)).status).toBe(204);
    expect(db.prepare("SELECT 1 FROM members WHERE steamid64 = ?").get(APPLICANT)).toBeUndefined();
  });

  it("refuses an ordinary member", async () => {
    expect((await post(MEMBER, `/api/admin/applications/${APPLICANT}/approve`)).status).toBe(403);
    expect(db.prepare("SELECT 1 FROM allowlist WHERE steamid64 = ?").get(APPLICANT)).toBeUndefined();
  });

  it("404s for an application that does not exist", async () => {
    expect((await post(ADMIN, "/api/admin/applications/76561190000000123/approve")).status).toBe(404);
  });
});

describe("POST /api/admin/applications/:steamid64/reject", () => {
  beforeEach(async () => {
    stubSteam("Ny Gubbe");
    expect((await apply(APPLICANT, "Släpp in mig")).status).toBe(201);
    vi.restoreAllMocks();
  });

  // Ansökningar raderas aldrig, bara statusmärks, så historiken finns kvar.
  it("marks the application rejected without touching the allowlist", async () => {
    expect((await post(ADMIN, `/api/admin/applications/${APPLICANT}/reject`)).status).toBe(204);

    const row = db.prepare("SELECT status FROM applications WHERE steamid64 = ?").get(APPLICANT);
    expect(row).toEqual({ status: "rejected" });
    expect(db.prepare("SELECT 1 FROM allowlist WHERE steamid64 = ?").get(APPLICANT)).toBeUndefined();
  });

  it("refuses an ordinary member", async () => {
    expect((await post(MEMBER, `/api/admin/applications/${APPLICANT}/reject`)).status).toBe(403);
  });
});

describe("DELETE /api/admin/members/:steamid64", () => {
  it("removes the member and the allowlist row", async () => {
    addMember(APPLICANT, "[BVS] Slutade");

    expect((await del(ADMIN, `/api/admin/members/${APPLICANT}`)).status).toBe(204);

    expect(db.prepare("SELECT 1 FROM members WHERE steamid64 = ?").get(APPLICANT)).toBeUndefined();
    expect(db.prepare("SELECT 1 FROM allowlist WHERE steamid64 = ?").get(APPLICANT)).toBeUndefined();
  });

  // members.steamid64 är en främmande nyckel in i allowlist, så ordningen är
  // tvingande — allowlisten först ger ett constraint-fel och en halv radering.
  it("leaves nothing behind when the foreign key is enforced", async () => {
    addMember(APPLICANT, "[BVS] Slutade");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);

    expect((await del(ADMIN, `/api/admin/members/${APPLICANT}`)).status).toBe(204);

    const left = db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM members) AS members, (SELECT COUNT(*) FROM allowlist) AS allowed"
      )
      .get() as { members: number; allowed: number };
    expect(left).toEqual({ members: 2, allowed: 2 });
  });

  // Citatväggen ska inte tappa historik för att någon slutat, och citaten har
  // ingen främmande nyckel som skulle kaskadradera dem.
  it("keeps the quotes the departing member submitted", async () => {
    addMember(APPLICANT, "[BVS] Slutade");
    db.prepare(
      "INSERT INTO quotes (text, said_by, submitted_by, created_at) VALUES (?, ?, ?, ?)"
    ).run("Jag hade ju träklubban", "Gubbe", APPLICANT, Date.now());

    expect((await del(ADMIN, `/api/admin/members/${APPLICANT}`)).status).toBe(204);

    const { count } = db.prepare("SELECT COUNT(*) AS count FROM quotes").get() as { count: number };
    expect(count).toBe(1);
  });

  // Annars räcker ett felklick för att låsa ut sig själv ur sin egen adminsida.
  it("refuses to let an admin remove themselves", async () => {
    const res = await del(ADMIN, `/api/admin/members/${ADMIN}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "cannot_remove_self" });
    expect(db.prepare("SELECT 1 FROM members WHERE steamid64 = ?").get(ADMIN)).toBeDefined();
  });

  it("refuses an ordinary member", async () => {
    expect((await del(MEMBER, `/api/admin/members/${ADMIN}`)).status).toBe(403);
    expect(db.prepare("SELECT 1 FROM members WHERE steamid64 = ?").get(ADMIN)).toBeDefined();
  });

  it("404s for someone who is not a member", async () => {
    expect((await del(ADMIN, "/api/admin/members/76561190000000123")).status).toBe(404);
  });
});
