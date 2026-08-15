import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeAllSubscribers, subscribe } from "./events.ts";
import { db, listValheimSamples } from "./db.ts";
import { HEARTBEAT_MS } from "./valheimHistory.ts";
import * as valheimQuery from "./valheimQuery.ts";

// Fast startpunkt, så raderna går att jämföra rakt av.
const START = new Date(2026, 7, 10, 20, 0, 0).getTime();
import {
  currentValheimStatus,
  hasPolledOnce,
  pollOnce,
  POLL_MS,
  refreshValheimStatus,
  resetValheimSnapshot,
  valheimStatusChanged,
} from "./valheimPoller.ts";

function serverSays(status: { online: boolean; players: number | null; maxPlayers: number | null }) {
  return vi.spyOn(valheimQuery, "queryValheimServer").mockResolvedValue(status);
}

function listener() {
  const frames: string[] = [];
  subscribe({ ip: "1.2.3.4", write: (c) => (frames.push(c), true) });
  return frames;
}

beforeEach(() => {
  resetValheimSnapshot();
  db.exec("DELETE FROM valheim_samples;");
});

afterEach(() => {
  vi.restoreAllMocks();
  closeAllSubscribers();
  vi.useRealTimers();
});

// Historiken vilar på att avläsningarna faktiskt hamnar i databasen: en rad
// när något ändras, och en pulsrad då och då även när inget händer. Utan
// pulsen går tiden inte att mäta — se valheimHistory.
describe("recording samples for the history", () => {
  async function pollAt(when: number, status: Parameters<typeof serverSays>[0]) {
    vi.setSystemTime(when);
    serverSays(status);
    await refreshValheimStatus();
  }

  it("writes the first reading", async () => {
    vi.useFakeTimers();
    await pollAt(START, { online: true, players: 3, maxPlayers: 10 });

    expect(listValheimSamples()).toEqual([{ at: START, online: 1, players: 3 }]);
  });

  it("writes a row when the player count moves", async () => {
    vi.useFakeTimers();
    await pollAt(START, { online: true, players: 3, maxPlayers: 10 });
    await pollAt(START + 45_000, { online: true, players: 5, maxPlayers: 10 });

    expect(listValheimSamples().map((s) => s.players)).toEqual([3, 5]);
  });

  it("writes a row when the server goes down", async () => {
    vi.useFakeTimers();
    await pollAt(START, { online: true, players: 1, maxPlayers: 10 });
    await pollAt(START + 45_000, { online: false, players: null, maxPlayers: null });

    expect(listValheimSamples().map((s) => s.online)).toEqual([1, 0]);
  });

  // Annars hade en lugn kväll skrivit tusen identiska rader.
  it("stays quiet while nothing changes", async () => {
    vi.useFakeTimers();
    await pollAt(START, { online: true, players: 2, maxPlayers: 10 });
    await pollAt(START + 45_000, { online: true, players: 2, maxPlayers: 10 });
    await pollAt(START + 90_000, { online: true, players: 2, maxPlayers: 10 });

    expect(listValheimSamples()).toHaveLength(1);
  });

  // ...men helt tyst går inte heller: utan pulsrader vet vi inte om servern
  // stod uppe hela natten eller om API:et låg nere.
  it("still writes a heartbeat row once the interval has passed", async () => {
    vi.useFakeTimers();
    await pollAt(START, { online: true, players: 2, maxPlayers: 10 });
    await pollAt(START + HEARTBEAT_MS, { online: true, players: 2, maxPlayers: 10 });

    expect(listValheimSamples().map((s) => s.at)).toEqual([START, START + HEARTBEAT_MS]);
  });
});

describe("valheimStatusChanged", () => {
  it("sees no change in an identical snapshot", () => {
    const snap = { online: true, players: 2, maxPlayers: 10 };
    expect(valheimStatusChanged(snap, { ...snap })).toBe(false);
  });

  it("notices the server going offline", () => {
    expect(
      valheimStatusChanged(
        { online: true, players: 0, maxPlayers: 10 },
        { online: false, players: null, maxPlayers: null }
      )
    ).toBe(true);
  });

  it("notices a player count change", () => {
    expect(
      valheimStatusChanged(
        { online: true, players: 1, maxPlayers: 10 },
        { online: true, players: 2, maxPlayers: 10 }
      )
    ).toBe(true);
  });
});

describe("refreshValheimStatus", () => {
  it("stores what the server reports", async () => {
    serverSays({ online: true, players: 3, maxPlayers: 10 });

    await refreshValheimStatus();

    expect(currentValheimStatus()).toEqual({ online: true, players: 3, maxPlayers: 10 });
  });

  it("marks that a poll has happened even when the server is offline", async () => {
    serverSays({ online: false, players: null, maxPlayers: null });

    expect(hasPolledOnce()).toBe(false);
    await refreshValheimStatus();
    expect(hasPolledOnce()).toBe(true);
  });

  it("reports whether anything actually moved", async () => {
    serverSays({ online: true, players: 1, maxPlayers: 10 });
    expect(await refreshValheimStatus()).toBe(true);
    expect(await refreshValheimStatus()).toBe(false);
  });
});

describe("pollOnce", () => {
  it("tells every open stream when the server comes online", async () => {
    const frames = listener();
    serverSays({ online: true, players: 1, maxPlayers: 10 });

    await pollOnce();

    expect(frames).toHaveLength(1);
    expect(frames[0]).toContain("event: valheim");
    expect(frames[0]).toContain('"online":true');
  });

  it("stays quiet when nothing has changed", async () => {
    serverSays({ online: true, players: 1, maxPlayers: 10 });
    await pollOnce();

    const frames = listener();
    await pollOnce();

    expect(frames).toEqual([]);
  });
});

describe("polling interval", () => {
  it("is slow enough not to hammer the game server but fast enough to feel live", () => {
    expect(POLL_MS).toBeGreaterThanOrEqual(30_000);
    expect(POLL_MS).toBeLessThanOrEqual(120_000);
  });
});
