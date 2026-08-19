import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app.ts";
import {
  currentDiscordStatus,
  discordNameMatches,
  discordStatusChanged,
  pollOnce,
  refreshDiscordStatus,
  resetDiscordSnapshot,
  startDiscordPolling,
  stopDiscordPolling,
} from "./discordPoller.ts";
import { DISCORD_UNAVAILABLE, type DiscordStatus } from "./discordWidget.ts";
import { config } from "./config.ts";
import { db, listDiscordSamples } from "./db.ts";

const app = createApp();

function addMember(steamid64: string, personaName: string, discordName: string | null) {
  db.prepare("INSERT OR IGNORE INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)").run(
    steamid64,
    personaName,
    Date.now()
  );
  db.prepare(
    "INSERT INTO members (steamid64, persona_name, avatar_url, discord_name, first_login, last_login) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(steamid64, personaName, null, discordName, Date.now(), Date.now());
}

beforeEach(() => {
  db.exec("DELETE FROM members; DELETE FROM allowlist; DELETE FROM discord_samples;");
});

const ONLINE: DiscordStatus = {
  available: true,
  online: 2,
  members: [
    { name: "Mag", status: "online", game: "Counter-Strike 2" },
    { name: "Kungalv", status: "idle", game: null },
  ],
};

afterEach(() => {
  stopDiscordPolling();
  resetDiscordSnapshot();
  vi.restoreAllMocks();
});

function widgetResponse(status: DiscordStatus) {
  return new Response(
    JSON.stringify({
      presence_count: status.online,
      members: status.members.map((m) => ({
        username: m.name,
        status: m.status,
        game: m.game ? { name: m.game } : undefined,
      })),
    }),
    { status: 200 }
  );
}

describe("discordStatusChanged", () => {
  it("sees nothing in an identical snapshot", () => {
    expect(discordStatusChanged(ONLINE, structuredClone(ONLINE))).toBe(false);
  });

  it("sees the count move", () => {
    expect(discordStatusChanged(ONLINE, { ...ONLINE, online: 3 })).toBe(true);
  });

  it("sees the widget going away", () => {
    expect(discordStatusChanged(ONLINE, DISCORD_UNAVAILABLE)).toBe(true);
  });

  // En gubbe som startar ett spel är precis den sortens förändring som gör
  // listan värd att titta på.
  it("sees someone starting a game", () => {
    const after = structuredClone(ONLINE);
    after.members[1]!.game = "Valheim";
    expect(discordStatusChanged(ONLINE, after)).toBe(true);
  });

  it("sees someone going idle", () => {
    const after = structuredClone(ONLINE);
    after.members[0]!.status = "dnd";
    expect(discordStatusChanged(ONLINE, after)).toBe(true);
  });

  it("sees a swap that keeps the count", () => {
    const after = structuredClone(ONLINE);
    after.members[0]!.name = "BrunKalle";
    expect(discordStatusChanged(ONLINE, after)).toBe(true);
  });
});

describe("the snapshot", () => {
  it("starts out unavailable so the page falls back to the plain button", () => {
    expect(currentDiscordStatus()).toEqual(DISCORD_UNAVAILABLE);
  });

  it("holds what Discord last answered", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(widgetResponse(ONLINE));

    await refreshDiscordStatus();

    expect(currentDiscordStatus()).toEqual(ONLINE);
  });

  it("reports whether anything moved", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValue(widgetResponse(ONLINE));
    expect(await refreshDiscordStatus()).toBe(true);

    fetchSpy.mockResolvedValue(widgetResponse(ONLINE));
    expect(await refreshDiscordStatus()).toBe(false);
  });
});

// Utan server-ID finns ingen widget att fråga efter — då ska pollern inte ens
// vakna, och absolut inte ringa Discord.
describe("startDiscordPolling", () => {
  it("stays asleep when no server id is configured", () => {
    const configured = config.discordServerId;
    config.discordServerId = "";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(widgetResponse(ONLINE));

    try {
      startDiscordPolling(50);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      config.discordServerId = configured;
    }
  });

  it("polls straight away when there is one", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(widgetResponse(ONLINE));
    startDiscordPolling(50);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/discord", () => {
  it("is open, like the rest of the read views", async () => {
    const res = await request(app).get("/api/discord").expect(200);
    expect(res.body).toEqual(DISCORD_UNAVAILABLE);
  });

  it("is rate limited", async () => {
    const res = await request(app).get("/api/discord").expect(200);
    expect(res.headers["ratelimit-limit"]).toBeDefined();
  });

  it("serves the cached snapshot instead of calling Discord per visitor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(widgetResponse(ONLINE));
    await refreshDiscordStatus();
    // Pollerns eget anrop räknas inte — det är besökarnas som ska vara noll.
    fetchSpy.mockClear();

    const first = await request(app).get("/api/discord").expect(200);
    const second = await request(app).get("/api/discord").expect(200);

    expect(first.body).toEqual(ONLINE);
    expect(second.body).toEqual(ONLINE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Server-ID:t hör hemma i backend. Det ska inte gå att läsa ut ur svaret.
  it("never leaks the server id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(widgetResponse(ONLINE));
    await refreshDiscordStatus();

    const res = await request(app).get("/api/discord").expect(200);
    expect(JSON.stringify(res.body)).not.toContain("323523542312419348");
  });
});

describe("discordNameMatches", () => {
  it("matches regardless of case and surrounding whitespace", () => {
    expect(discordNameMatches("  Mag  ", "mag")).toBe(true);
  });

  // Gubbar som skrev in sitt namn innan Discord slopade diskriminatorer ska
  // inte behöva gå in och ändra det för att matchningen ska ta.
  it("ignores a legacy #1234 discriminator on either side", () => {
    expect(discordNameMatches("mag#1234", "Mag")).toBe(true);
    expect(discordNameMatches("Mag", "mag#1234")).toBe(true);
  });

  it("does not match a different name", () => {
    expect(discordNameMatches("Mag", "Kungalv")).toBe(false);
  });

  it("never matches an empty discord name", () => {
    expect(discordNameMatches("", "")).toBe(false);
  });
});

// Widgeten har ingen stabil id-koppling till Steam — matchningen sker på det
// handskrivna discord_name-fältet, se motiveringen i discordPoller.ts.
describe("pollOnce — Discord presence sampling", () => {
  const ALLOWED = "76561198053832683";

  it("records a sample for a member whose linked Discord name shows up in the widget", async () => {
    addMember(ALLOWED, "[BVS] #Mag", "Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(widgetResponse(ONLINE));

    await pollOnce();

    expect(listDiscordSamples(ALLOWED)).toHaveLength(1);
  });

  it("records nothing for a member who has not linked a Discord name", async () => {
    addMember(ALLOWED, "[BVS] #Mag", null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(widgetResponse(ONLINE));

    await pollOnce();

    expect(listDiscordSamples(ALLOWED)).toHaveLength(0);
  });

  it("skips a member whose linked name is not in the widget", async () => {
    addMember(ALLOWED, "[BVS] #Mag", "NågonAnnan");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(widgetResponse(ONLINE));

    await pollOnce();

    expect(listDiscordSamples(ALLOWED)).toHaveLength(0);
  });

  it("writes nothing when the widget is unavailable", async () => {
    addMember(ALLOWED, "[BVS] #Mag", "Mag");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 403 }));

    await pollOnce();

    expect(listDiscordSamples(ALLOWED)).toHaveLength(0);
  });
});
