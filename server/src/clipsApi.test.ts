import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { db } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";

const app = createApp();
const MAG = "76561198053832683";
const KUNGALV = "76561198060166361";

const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const TWITCH = "https://clips.twitch.tv/SpicyCrunchyOtterKappa";

function sessionFor(steamid64: string) {
  return `${sessionCookie.name}=${createSessionCookieValue(steamid64)}`;
}

async function csrfFor(session: string) {
  const res = await request(app).get("/api/auth/csrf-token").set("Cookie", session).expect(200);
  const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
    c.startsWith("bvs_csrf=")
  )!;
  return { token: res.body.csrfToken as string, cookie: cookie.split(";")[0] };
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

async function postClip(steamid64: string, body: unknown) {
  const session = sessionFor(steamid64);
  const { token, cookie } = await csrfFor(session);
  return request(app)
    .post("/api/clips")
    .set("Cookie", [session, cookie])
    .set("x-csrf-token", token)
    .send(body as object);
}

async function vote(steamid64: string, clipId: number) {
  const session = sessionFor(steamid64);
  const { token, cookie } = await csrfFor(session);
  return request(app)
    .post(`/api/clips/${clipId}/vote`)
    .set("Cookie", [session, cookie])
    .set("x-csrf-token", token);
}

async function remove(steamid64: string, clipId: number) {
  const session = sessionFor(steamid64);
  const { token, cookie } = await csrfFor(session);
  return request(app)
    .delete(`/api/clips/${clipId}`)
    .set("Cookie", [session, cookie])
    .set("x-csrf-token", token);
}

beforeEach(() => {
  db.exec("DELETE FROM clip_votes; DELETE FROM clips; DELETE FROM members; DELETE FROM allowlist;");
  resetRateLimits();
  addMember(MAG, "[BVS] #Mag");
  addMember(KUNGALV, "[BVS] Kungalv");
});

describe("GET /api/clips", () => {
  it("är publik och tom från början", async () => {
    const res = await request(app).get("/api/clips").expect(200);
    expect(res.body).toEqual({ clips: [] });
  });

  // Adressen som klistrades in sparas aldrig — bara leverantören och id:t, så
  // att vyn bygger sin embed ur en fast mall i stället för ur något någon
  // skrivit in.
  it("lämnar ut leverantör och id, aldrig den inklistrade adressen", async () => {
    expect((await postClip(MAG, { url: YOUTUBE, title: "Lasse ess" })).status).toBe(201);

    const res = await request(app).get("/api/clips").expect(200);

    expect(res.body.clips).toHaveLength(1);
    expect(res.body.clips[0]).toMatchObject({
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
      title: "Lasse ess",
      votes: 0,
    });
    expect(JSON.stringify(res.body)).not.toContain("youtube.com/watch");
  });

  // Samma regel som citatväggen: vem som lagt upp något visas aldrig, utom
  // för en själv, så att raderingsknappen hamnar rätt.
  it("avslöjar inte vem som lagt upp klippet", async () => {
    expect((await postClip(MAG, { url: YOUTUBE, title: "Lasse ess" })).status).toBe(201);

    const anonymous = await request(app).get("/api/clips").expect(200);
    expect(JSON.stringify(anonymous.body)).not.toContain(MAG);
    expect(anonymous.body.clips[0].mine).toBe(false);

    const mine = await request(app)
      .get("/api/clips")
      .set("Cookie", sessionFor(MAG))
      .expect(200);
    expect(mine.body.clips[0].mine).toBe(true);
  });

  it("lägger de mest omröstade först", async () => {
    const a = (await postClip(MAG, { url: YOUTUBE, title: "Ett" })).body;
    const b = (await postClip(MAG, { url: TWITCH, title: "Två" })).body;

    await vote(KUNGALV, b.id);

    const res = await request(app).get("/api/clips").expect(200);
    expect(res.body.clips.map((c: { id: number }) => c.id)).toEqual([b.id, a.id]);
  });
});

describe("POST /api/clips", () => {
  it("kräver inloggning", async () => {
    await request(app).post("/api/clips").send({ url: YOUTUBE, title: "Lasse" }).expect(403);
  });

  it("avvisar en adress från en tjänst vi inte bäddar in", async () => {
    const res = await postClip(MAG, { url: "https://gubbar.se/klipp.mp4", title: "Lasse" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "url_unsupported" });
  });

  it("avvisar en rubrik som saknas", async () => {
    const res = await postClip(MAG, { url: YOUTUBE, title: "  " });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "title_required" });
  });

  // Samma klipp två gånger är ingen nyhet, och två identiska kort i galleriet
  // ser ut som ett fel.
  it("tar inte emot samma klipp två gånger", async () => {
    expect((await postClip(MAG, { url: YOUTUBE, title: "Lasse ess" })).status).toBe(201);
    const again = await postClip(KUNGALV, {
      url: "https://youtu.be/dQw4w9WgXcQ",
      title: "Samma klipp igen",
    });

    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: "already_added" });
    expect((await request(app).get("/api/clips")).body.clips).toHaveLength(1);
  });

  it("ger tillbaka klippet direkt, märkt som ditt eget", async () => {
    const res = await postClip(MAG, { url: TWITCH, title: "Kungalv wallbang" });

    expect(res.status).toBe(201);

    expect(res.body).toMatchObject({
      provider: "twitch",
      videoId: "SpicyCrunchyOtterKappa",
      title: "Kungalv wallbang",
      votes: 0,
      mine: true,
    });
  });
});

describe("POST /api/clips/:id/vote", () => {
  it("växlar rösten i stället för att räkna upp", async () => {
    const clip = (await postClip(MAG, { url: YOUTUBE, title: "Ett" })).body;

    expect((await vote(KUNGALV, clip.id)).body).toEqual({
      id: clip.id,
      votes: 1,
      voted: true,
    });
    expect((await vote(KUNGALV, clip.id)).body).toEqual({
      id: clip.id,
      votes: 0,
      voted: false,
    });
  });

  it("svarar 404 på ett klipp som inte finns", async () => {
    expect((await vote(MAG, 9999)).status).toBe(404);
  });
});

describe("DELETE /api/clips/:id", () => {
  it("tar bort ditt eget klipp", async () => {
    const clip = (await postClip(MAG, { url: YOUTUBE, title: "Ett" })).body;

    expect((await remove(MAG, clip.id)).status).toBe(204);
    expect((await request(app).get("/api/clips")).body.clips).toEqual([]);
  });

  // Någon annans klipp ska vara omöjligt att skilja från ett som inte finns.
  it("låter inte någon annan ta bort det", async () => {
    const clip = (await postClip(MAG, { url: YOUTUBE, title: "Ett" })).body;

    expect((await remove(KUNGALV, clip.id)).status).toBe(404);
    expect((await request(app).get("/api/clips")).body.clips).toHaveLength(1);
  });

  it("städar bort rösterna med klippet", async () => {
    const clip = (await postClip(MAG, { url: YOUTUBE, title: "Ett" })).body;
    await vote(KUNGALV, clip.id);

    expect((await remove(MAG, clip.id)).status).toBe(204);

    const left = db.prepare("SELECT COUNT(*) AS n FROM clip_votes").get() as { n: number };
    expect(left.n).toBe(0);
  });
});
