import { beforeEach, describe, expect, it } from "vitest";
import { crownBvsMonth, db, getBvsMonthWinner } from "./db.ts";
import { closeAllSubscribers, subscribe } from "./events.ts";
import { crownPreviousMonthIfMissing, POLL_MS, previousMonth } from "./monthlyPoller.ts";

const MAG = "76561198053832683";
const KUNGALV = "76561198060166361";
const MIN = 60_000;
const HOUR = 60 * MIN;

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

// Samma pulsrad-form som poller/db skriver.
function play(steamid64: string, game: string, from: number, minutes: number) {
  let at = from;
  for (let left = minutes; left >= 0; left -= 5) {
    db.prepare(
      "INSERT INTO presence_samples (at, steamid64, game) VALUES (?, ?, ?) ON CONFLICT(at, steamid64) DO NOTHING"
    ).run(at, steamid64, game);
    at += 5 * MIN;
  }
}

function listener() {
  const frames: string[] = [];
  subscribe({ ip: "1.2.3.4", write: (c) => (frames.push(c), true) });
  return frames;
}

beforeEach(() => {
  db.exec("DELETE FROM members; DELETE FROM allowlist; DELETE FROM presence_samples; DELETE FROM bvs_month;");
});

describe("previousMonth", () => {
  it("gives the previous calendar month in local time", () => {
    const { month, from, to } = previousMonth(new Date(2026, 7, 16));
    expect(month).toBe("2026-07");
    expect(new Date(from)).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(new Date(to)).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });

  it("rolls back across a year boundary", () => {
    const { month, from, to } = previousMonth(new Date(2027, 0, 5));
    expect(month).toBe("2026-12");
    expect(new Date(from)).toEqual(new Date(2026, 11, 1, 0, 0, 0, 0));
    expect(new Date(to)).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0));
  });
});

describe("crownPreviousMonthIfMissing", () => {
  const now = new Date(2026, 7, 16); // ser tillbaka på juli 2026
  const julyStart = new Date(2026, 6, 1, 19, 0, 0).getTime();

  it("crowns whoever scored highest in the completed month", () => {
    addMember(MAG, "[BVS] #Mag");
    addMember(KUNGALV, "[BVS] Kungalv");
    play(MAG, "Counter-Strike 2", julyStart, 6 * 60);
    play(KUNGALV, "Counter-Strike 2", julyStart, 2 * 60);

    crownPreviousMonthIfMissing(now);

    const winner = getBvsMonthWinner("2026-07");
    expect(winner?.steamid64).toBe(MAG);
    expect(winner?.score).toBeGreaterThan(0);
  });

  // Varje spel bidrar upp till taket — bredd slår att grinda ett enda spel.
  it("lets a member who spread across two games beat one who only grinds one", () => {
    addMember(MAG, "[BVS] #Mag");
    addMember(KUNGALV, "[BVS] Kungalv");
    play(MAG, "Counter-Strike 2", julyStart, 6 * 60);
    play(KUNGALV, "Counter-Strike 2", julyStart, 3 * 60);
    play(KUNGALV, "Valheim", julyStart + 4 * HOUR, 3 * 60);

    crownPreviousMonthIfMissing(now);

    expect(getBvsMonthWinner("2026-07")?.steamid64).toBe(KUNGALV);
  });

  it("does not touch a month that is already decided", () => {
    crownBvsMonth({ month: "2026-07", steamid64: KUNGALV, score: 1 });
    addMember(MAG, "[BVS] #Mag");
    play(MAG, "Counter-Strike 2", julyStart, 20 * 60);

    crownPreviousMonthIfMissing(now);

    expect(getBvsMonthWinner("2026-07")?.steamid64).toBe(KUNGALV);
  });

  // Ingen har spelat något den månaden — hellre ingen vinnare än en påhittad.
  it("crowns nobody when the month has no activity at all", () => {
    addMember(MAG, "[BVS] #Mag");

    crownPreviousMonthIfMissing(now);

    expect(getBvsMonthWinner("2026-07")).toBeUndefined();
  });

  it("ignores presence outside the completed month's window", () => {
    addMember(MAG, "[BVS] #Mag");
    // I augusti, inte i juli.
    play(MAG, "Counter-Strike 2", new Date(2026, 7, 10, 19, 0, 0).getTime(), 6 * 60);

    crownPreviousMonthIfMissing(now);

    expect(getBvsMonthWinner("2026-07")).toBeUndefined();
  });

  it("broadcasts once a winner is crowned", () => {
    addMember(MAG, "[BVS] #Mag");
    play(MAG, "Counter-Strike 2", julyStart, 6 * 60);
    const frames = listener();

    crownPreviousMonthIfMissing(now);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toContain("event: bvs-month");
    expect(frames[0]).toContain(MAG);

    closeAllSubscribers();
  });

  it("stays quiet on a month that was already decided", () => {
    crownBvsMonth({ month: "2026-07", steamid64: KUNGALV, score: 1 });
    const frames = listener();

    crownPreviousMonthIfMissing(now);

    expect(frames).toEqual([]);
    closeAllSubscribers();
  });
});

describe("polling interval", () => {
  // En gång i timmen räcker — svaret för en månad ändras bara vid skiftet.
  it("is measured in hours, not seconds", () => {
    expect(POLL_MS).toBeGreaterThanOrEqual(30 * 60 * 1000);
  });
});
