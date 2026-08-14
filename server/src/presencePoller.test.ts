import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db.ts";
import { closeAllSubscribers, subscribe } from "./events.ts";
import {
  currentPresence,
  POLL_MS,
  pollOnce,
  presenceChanged,
  refreshPresence,
  resetPresenceSnapshot,
} from "./presencePoller.ts";

const A = "76561198053832683";
const B = "76561198060166361";

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

function steamSays(players: unknown[]) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ response: { players } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function listener() {
  const frames: string[] = [];
  subscribe({ ip: "1.2.3.4", write: (c) => (frames.push(c), true) });
  return frames;
}

beforeEach(() => {
  db.exec("DELETE FROM members; DELETE FROM allowlist;");
  resetPresenceSnapshot();
});

afterEach(() => {
  vi.restoreAllMocks();
  closeAllSubscribers();
});

describe("presenceChanged", () => {
  it("sees no change in an identical snapshot", () => {
    const snap = { [A]: { status: "online" as const, game: null } };
    expect(presenceChanged(snap, { ...snap })).toBe(false);
  });

  it("notices someone starting a game", () => {
    expect(
      presenceChanged(
        { [A]: { status: "online", game: null } },
        { [A]: { status: "in-game", game: "Counter-Strike 2" } }
      )
    ).toBe(true);
  });

  it("notices someone switching between games", () => {
    expect(
      presenceChanged(
        { [A]: { status: "in-game", game: "Valheim" } },
        { [A]: { status: "in-game", game: "Counter-Strike 2" } }
      )
    ).toBe(true);
  });

  it("notices someone appearing or disappearing entirely", () => {
    const one = { [A]: { status: "online" as const, game: null } };
    expect(presenceChanged({}, one)).toBe(true);
    expect(presenceChanged(one, {})).toBe(true);
  });
});

describe("refreshPresence", () => {
  it("keeps nothing when no one has logged in, without calling Steam", async () => {
    const spy = steamSays([]);
    await refreshPresence();
    expect(spy).not.toHaveBeenCalled();
    expect(currentPresence()).toEqual({});
  });

  it("stores what Steam reports for the roster", async () => {
    addMember(A, "[BVS] #Mag");
    steamSays([{ steamid: A, personastate: 1, gameextrainfo: "Counter-Strike 2" }]);

    await refreshPresence();

    expect(currentPresence()).toEqual({ [A]: { status: "in-game", game: "Counter-Strike 2" } });
  });

  it("ignores anyone Steam returns who is not on the roster", async () => {
    addMember(A, "[BVS] #Mag");
    steamSays([
      { steamid: A, personastate: 1 },
      { steamid: "76561190000000000", personastate: 1 },
    ]);

    await refreshPresence();

    expect(Object.keys(currentPresence())).toEqual([A]);
  });

  it("reports whether anything actually moved", async () => {
    addMember(A, "[BVS] #Mag");
    steamSays([{ steamid: A, personastate: 1 }]);

    expect(await refreshPresence()).toBe(true);
    expect(await refreshPresence()).toBe(false);
  });

  it("keeps the last known picture when Steam is unreachable", async () => {
    // Presence är dekoration — ett avbrott ska inte tömma rostern.
    addMember(A, "[BVS] #Mag");
    steamSays([{ steamid: A, personastate: 1 }]);
    await refreshPresence();

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("steam is down"));

    expect(await refreshPresence()).toBe(false);
    expect(currentPresence()).toEqual({ [A]: { status: "online", game: null } });
  });
});

describe("pollOnce", () => {
  it("tells every open stream when someone starts playing", async () => {
    addMember(A, "[BVS] #Mag");
    const frames = listener();
    steamSays([{ steamid: A, personastate: 1, gameextrainfo: "Valheim" }]);

    await pollOnce();

    expect(frames).toHaveLength(1);
    expect(frames[0]).toContain("event: presence");
    expect(frames[0]).toContain("Valheim");
  });

  it("stays quiet when nothing has changed", async () => {
    // Utan jämförelsen hade varje poll väckt alla öppna flikar var 45:e sekund.
    addMember(A, "[BVS] #Mag");
    steamSays([{ steamid: A, personastate: 1 }]);
    await pollOnce();

    const frames = listener();
    await pollOnce();

    expect(frames).toEqual([]);
  });

  it("tells everyone when a second member comes online", async () => {
    addMember(A, "[BVS] #Mag");
    steamSays([{ steamid: A, personastate: 1 }]);
    await pollOnce();

    addMember(B, "[BVS] Kungalv");
    const frames = listener();
    steamSays([
      { steamid: A, personastate: 1 },
      { steamid: B, personastate: 1 },
    ]);

    await pollOnce();

    expect(frames).toHaveLength(1);
    expect(frames[0]).toContain(B);
  });
});

describe("polling interval", () => {
  it("is slow enough not to hammer Steam but fast enough to feel live", () => {
    expect(POLL_MS).toBeGreaterThanOrEqual(30_000);
    expect(POLL_MS).toBeLessThanOrEqual(120_000);
  });
});
