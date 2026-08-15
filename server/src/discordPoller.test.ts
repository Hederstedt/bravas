import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app.ts";
import {
  currentDiscordStatus,
  discordStatusChanged,
  refreshDiscordStatus,
  resetDiscordSnapshot,
  startDiscordPolling,
  stopDiscordPolling,
} from "./discordPoller.ts";
import { DISCORD_UNAVAILABLE, type DiscordStatus } from "./discordWidget.ts";
import { config } from "./config.ts";

const app = createApp();

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
