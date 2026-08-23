import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { API_ROUTERS, createApp } from "./app.ts";
import { db } from "./db.ts";
import { resetRateLimits } from "./middleware/rateLimit.ts";
import { createSessionCookieValue, sessionCookie } from "./session.ts";

// Det här är beviset för att CSRF-skyddet sitter.
//
// CodeQL:s js/missing-token-validation flaggade app.ts om och om igen: queryn
// modellerar den deprecerade `csurf`-modulen och kan bara känna igen ett skydd
// den *själv ser* verifiera token — vilket den aldrig gör när verifieringen bor
// inne i `csrf-csrf`. Den kunde alltså aldrig bli nöjd, hur rätt koden än var.
// Queryn är därför avstängd (se .github/codeql/codeql-config.yml), och då måste
// det som ersätter den vara starkare, inte svagare.
//
// Listan var förut handskriven, vilket betyder att den som la till en endpoint
// också måste komma ihåg att lägga till den här — och ingenting märktes om man
// glömde. Nu räknas rutterna upp ur appen själv, så en ny skrivande route provas
// automatiskt.

const app = createApp();
const MEMBER = "76561198053832683";

const session = () => `${sessionCookie.name}=${createSessionCookieValue(MEMBER)}`;

beforeEach(() => {
  resetRateLimits();
  db.exec(
    "DELETE FROM training_sessions; DELETE FROM transfers; DELETE FROM fixtures; DELETE FROM squads; DELETE FROM teams; DELETE FROM season_players; DELETE FROM seasons; DELETE FROM quote_votes; DELETE FROM quotes; DELETE FROM clip_votes; DELETE FROM clips; DELETE FROM applications; DELETE FROM members; DELETE FROM allowlist;"
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

// CSRF gäller inte läsningar, och en läsning kan inte ändra tillstånd.
const SAFE_METHODS = new Set(["get", "head", "options"]);

// Express typar inte routerns lagerstack — den är intern. `route.path` och
// `route.methods` har däremot legat stilla länge, och alternativet är en lista
// som glöms bort.
interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

// Vad parametern innehåller spelar ingen roll: doubleCsrfProtection ligger som
// global middleware och avvisar anropet långt innan någon route-handler får se
// den.
function concrete(path: string): string {
  return path.replace(/:[^/]+/g, "1");
}

type WriteMethod = "post" | "put" | "delete" | "patch";

function writeRoutes(): { method: WriteMethod; path: string }[] {
  const routes: { method: WriteMethod; path: string }[] = [];

  for (const [mount, router] of API_ROUTERS) {
    const { stack } = router as unknown as { stack: RouteLayer[] };
    for (const layer of stack) {
      if (!layer.route) continue;
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (!enabled || SAFE_METHODS.has(method)) continue;
        const path = layer.route.path === "/" ? mount : `${mount}${layer.route.path}`;
        routes.push({ method: method as WriteMethod, path: concrete(path) });
      }
    }
  }

  return routes;
}

const WRITES = writeRoutes();

describe("uppräkningen av rutter", () => {
  // Utan den här skulle en trasig genomgång göra hela sviten nedanför tom och
  // grön på samma gång — det värsta ett test kan göra.
  it("hittar faktiskt appens skrivande rutter", () => {
    expect(WRITES.length).toBeGreaterThanOrEqual(15);
  });

  it("tar med de rutter vi vet ska finnas", () => {
    const found = WRITES.map((w) => `${w.method} ${w.path}`);

    expect(found).toContain("post /api/quotes");
    expect(found).toContain("post /api/clips");
    expect(found).toContain("delete /api/clips/1");
    expect(found).toContain("put /api/manager/squad");
    expect(found).toContain("delete /api/admin/members/1");
  });

  it("tar inte med läsvägar", () => {
    expect(WRITES.map((w) => w.path)).not.toContain("/api/feed");
  });
});

describe("every state-changing endpoint demands a CSRF token", () => {
  for (const { method, path } of WRITES) {
    it(`${method.toUpperCase()} ${path} is refused without one`, async () => {
      await request(app)[method](path).set("Cookie", session()).send({}).expect(403);
    });

    it(`${method.toUpperCase()} ${path} is refused for an anonymous caller too`, async () => {
      await request(app)[method](path).send({}).expect(403);
    });
  }
});

describe("the protection does not block reading", () => {
  const READS = [
    "/api/config",
    "/api/members",
    "/api/presence",
    "/api/quotes",
    "/api/clips",
    "/api/feed",
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
