import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { db } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";

const app = createApp();
const MAG = "76561198053832683";
const KUNGALV = "76561198060166361";
const OUTSIDER = "76561190000000000";

function sessionFor(steamid64: string) {
  return `${sessionCookie.name}=${createSessionCookieValue(steamid64)}`;
}

// Skrivningar går genom CSRF-skyddet, så varje anrop behöver både en giltig
// token och kakan den hör ihop med.
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

async function postQuote(steamid64: string, body: unknown) {
  const session = sessionFor(steamid64);
  const { token, cookie } = await csrfFor(session);
  return request(app)
    .post("/api/quotes")
    .set("Cookie", [session, cookie])
    .set("x-csrf-token", token)
    .send(body as object);
}

async function vote(steamid64: string, quoteId: number) {
  const session = sessionFor(steamid64);
  const { token, cookie } = await csrfFor(session);
  return request(app)
    .post(`/api/quotes/${quoteId}/vote`)
    .set("Cookie", [session, cookie])
    .set("x-csrf-token", token);
}

beforeEach(() => {
  db.exec("DELETE FROM quote_votes; DELETE FROM quotes; DELETE FROM members; DELETE FROM allowlist;");
  resetRateLimits();
  addMember(MAG, "[BVS] #Mag");
  addMember(KUNGALV, "[BVS] Kungalv");
});

describe("GET /api/quotes", () => {
  it("is empty to begin with", async () => {
    const res = await request(app).get("/api/quotes").expect(200);
    expect(res.body).toEqual({ quotes: [] });
  });

  // Publik, oautentiserad och slår mot databasen — den ska inte gå att hamra.
  it("is rate limited", async () => {
    const res = await request(app).get("/api/quotes").expect(200);
    expect(res.headers["ratelimit-limit"]).toBeDefined();
  });

  it("shows quotes with their vote counts, most voted first", async () => {
    const quiet = (await postQuote(MAG, { text: "Tyst citat", saidBy: "Gubbe" })).body.id;
    const loud = (await postQuote(MAG, { text: "Populärt citat", saidBy: "Gubbe" })).body.id;
    await vote(MAG, loud);
    await vote(KUNGALV, loud);

    const res = await request(app).get("/api/quotes").expect(200);
    expect(res.body.quotes.map((q: { id: number }) => q.id)).toEqual([loud, quiet]);
    expect(res.body.quotes[0]).toMatchObject({ text: "Populärt citat", votes: 2 });
    expect(res.body.quotes[1].votes).toBe(0);
  });

  it("never exposes who submitted or who voted", async () => {
    const id = (await postQuote(MAG, { text: "Ett citat", saidBy: "Gubbe" })).body.id;
    await vote(KUNGALV, id);

    const res = await request(app).get("/api/quotes").expect(200);
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain(MAG);
    expect(serialised).not.toContain(KUNGALV);
  });

  // `mine` är undantaget från regeln ovan: den berättar bara för dig vilka
  // citat som är dina, så raderingsknappen hamnar på rätt kort. Vem som
  // skrivit någon annans framgår fortfarande inte.
  describe("the mine flag", () => {
    it("is false for everything when nobody is logged in", async () => {
      await postQuote(MAG, { text: "Ett citat", saidBy: "Gubbe" });

      const res = await request(app).get("/api/quotes").expect(200);
      expect(res.body.quotes[0].mine).toBe(false);
    });

    it("marks only your own quotes", async () => {
      const mine = (await postQuote(MAG, { text: "Mitt citat", saidBy: "Gubbe" })).body.id;
      const theirs = (await postQuote(KUNGALV, { text: "Hans citat", saidBy: "Gubbe" })).body.id;

      const res = await request(app)
        .get("/api/quotes")
        .set("Cookie", sessionFor(MAG))
        .expect(200);

      const byId = new Map(
        (res.body.quotes as { id: number; mine: boolean }[]).map((q) => [q.id, q.mine])
      );
      expect(byId.get(mine)).toBe(true);
      expect(byId.get(theirs)).toBe(false);
    });

    it("still hides the submitter when the flag is set", async () => {
      await postQuote(MAG, { text: "Mitt citat", saidBy: "Gubbe" });

      const res = await request(app)
        .get("/api/quotes")
        .set("Cookie", sessionFor(MAG))
        .expect(200);

      expect(res.body.quotes[0].mine).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain(MAG);
    });

    it("comes back true on the quote you just posted", async () => {
      const res = await postQuote(MAG, { text: "Nytt citat", saidBy: "Gubbe" });
      expect(res.body.mine).toBe(true);
    });
  });
});

describe("POST /api/quotes", () => {
  it("stores a quote from a signed-in member", async () => {
    const res = await postQuote(MAG, { text: "Jag hade ju träklubban", saidBy: "Gubbe" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ text: "Jag hade ju träklubban", saidBy: "Gubbe", votes: 0 });
  });

  it("turns down an anonymous visitor", async () => {
    await request(app).post("/api/quotes").send({ text: "Hej", saidBy: "Gubbe" }).expect(403);
  });

  // Någon utanför rostern kan inte ens hämta ut en CSRF-token — den endpointen
  // kräver medlemskap — så skrivningen stoppas redan av CSRF-skyddet.
  it("turns down a signed session for someone outside the roster", async () => {
    const session = sessionFor(OUTSIDER);
    await request(app).get("/api/auth/csrf-token").set("Cookie", session).expect(401);

    await request(app)
      .post("/api/quotes")
      .set("Cookie", session)
      .send({ text: "Hej", saidBy: "Gubbe" })
      .expect(403);

    expect((db.prepare("SELECT COUNT(*) c FROM quotes").get() as { c: number }).c).toBe(0);
  });

  it("rejects a write that carries a session but no CSRF token", async () => {
    await request(app)
      .post("/api/quotes")
      .set("Cookie", sessionFor(MAG))
      .send({ text: "Hej", saidBy: "Gubbe" })
      .expect(403);
  });

  it("rejects junk input", async () => {
    expect((await postQuote(MAG, { text: "   ", saidBy: "Gubbe" })).status).toBe(400);
    expect((await postQuote(MAG, { text: "Hej" })).status).toBe(400);
    expect((await postQuote(MAG, { text: "x".repeat(281), saidBy: "Gubbe" })).status).toBe(400);
  });

  // Vem som skickade in citatet tas från sessionen; en klient som påstår något
  // annat ska inte kunna skriva någon annan på näsan.
  it("ignores a submitted_by supplied by the client", async () => {
    const res = await postQuote(MAG, {
      text: "Ett citat",
      saidBy: "Gubbe",
      submitted_by: OUTSIDER,
      submittedBy: OUTSIDER,
    });
    expect(res.status).toBe(201);
    const stored = db.prepare("SELECT submitted_by FROM quotes WHERE id = ?").get(res.body.id) as {
      submitted_by: string;
    };
    expect(stored.submitted_by).toBe(MAG);
  });

  it("stores the raw text and leaves escaping to the view", async () => {
    const res = await postQuote(MAG, { text: "<img src=x onerror=alert(1)>", saidBy: "Gubbe" });
    expect(res.body.text).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("POST /api/quotes/:id/vote", () => {
  it("counts one vote per member and toggles it off again", async () => {
    const id = (await postQuote(MAG, { text: "Ett citat", saidBy: "Gubbe" })).body.id;

    expect((await vote(MAG, id)).body).toMatchObject({ votes: 1, voted: true });
    expect((await vote(MAG, id)).body).toMatchObject({ votes: 0, voted: false });
    expect((await vote(MAG, id)).body).toMatchObject({ votes: 1, voted: true });
  });

  it("counts separate members separately", async () => {
    const id = (await postQuote(MAG, { text: "Ett citat", saidBy: "Gubbe" })).body.id;
    await vote(MAG, id);
    const res = await vote(KUNGALV, id);
    expect(res.body.votes).toBe(2);
  });

  it("turns down an anonymous voter", async () => {
    const id = (await postQuote(MAG, { text: "Ett citat", saidBy: "Gubbe" })).body.id;
    await request(app).post(`/api/quotes/${id}/vote`).expect(403);
  });

  it("404s for a quote that does not exist", async () => {
    expect((await vote(MAG, 9999)).status).toBe(404);
  });

  it("404s for a nonsense id without touching the database", async () => {
    const session = sessionFor(MAG);
    const { token, cookie } = await csrfFor(session);
    await request(app)
      .post("/api/quotes/not-a-number/vote")
      .set("Cookie", [session, cookie])
      .set("x-csrf-token", token)
      .expect(404);
  });
});

describe("DELETE /api/quotes/:id", () => {
  async function remove(steamid64: string, quoteId: number) {
    const session = sessionFor(steamid64);
    const { token, cookie } = await csrfFor(session);
    return request(app)
      .delete(`/api/quotes/${quoteId}`)
      .set("Cookie", [session, cookie])
      .set("x-csrf-token", token);
  }

  it("lets a member remove their own submission", async () => {
    const id = (await postQuote(MAG, { text: "Ett citat", saidBy: "Gubbe" })).body.id;
    await remove(MAG, id).then((r) => expect(r.status).toBe(204));

    const res = await request(app).get("/api/quotes").expect(200);
    expect(res.body.quotes).toEqual([]);
  });

  it("does not let a member remove someone else's submission", async () => {
    const id = (await postQuote(MAG, { text: "Ett citat", saidBy: "Gubbe" })).body.id;
    expect((await remove(KUNGALV, id)).status).toBe(404);

    const res = await request(app).get("/api/quotes").expect(200);
    expect(res.body.quotes).toHaveLength(1);
  });

  it("takes the votes with it", async () => {
    const id = (await postQuote(MAG, { text: "Ett citat", saidBy: "Gubbe" })).body.id;
    await vote(KUNGALV, id);
    await remove(MAG, id);

    const left = db.prepare("SELECT COUNT(*) c FROM quote_votes").get() as { c: number };
    expect(left.c).toBe(0);
  });
});
