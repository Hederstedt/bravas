import { describe, expect, it } from "vitest";
import { buildFixtures, buildTable, POINTS_DRAW, POINTS_WIN, type PlayedFixture } from "./league.ts";

const FOUR = [1, 2, 3, 4];
const FIVE = [1, 2, 3, 4, 5];

function pairKey(a: number, b: number) {
  return [a, b].sort((x, y) => x - y).join("-");
}

describe("buildFixtures", () => {
  it("has everyone meet everyone twice", () => {
    const fixtures = buildFixtures(FOUR);
    const counts = new Map<string, number>();
    for (const f of fixtures) {
      const k = pairKey(f.home, f.away);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    expect(counts.size).toBe(6); // fyra lag ger sex möten
    for (const n of counts.values()) expect(n).toBe(2);
  });

  it("gives everyone a home match against everyone", () => {
    // Annars spelar samma lag borta båda gångerna mot en viss motståndare.
    const fixtures = buildFixtures(FOUR);
    for (const home of FOUR) {
      for (const away of FOUR) {
        if (home === away) continue;
        expect(fixtures.some((f) => f.home === home && f.away === away)).toBe(true);
      }
    }
  });

  it("never lets a team play twice on the same matchday", () => {
    for (const teams of [FOUR, FIVE, [1, 2], [1, 2, 3, 4, 5, 6, 7]]) {
      const byDay = new Map<number, number[]>();
      for (const f of buildFixtures(teams)) {
        const day = byDay.get(f.matchday) ?? [];
        day.push(f.home, f.away);
        byDay.set(f.matchday, day);
      }
      for (const [day, played] of byDay) {
        expect(new Set(played).size, `omgång ${day} med ${teams.length} lag`).toBe(played.length);
      }
    }
  });

  it("gives an odd number of teams a bye each round instead of a phantom opponent", () => {
    const fixtures = buildFixtures(FIVE);
    const byDay = new Map<number, Set<number>>();
    for (const f of fixtures) {
      const day = byDay.get(f.matchday) ?? new Set<number>();
      day.add(f.home).add(f.away);
      byDay.set(f.matchday, day);
    }

    // Fem lag betyder att exakt ett lag står över varje omgång.
    for (const played of byDay.values()) expect(played.size).toBe(4);
    // Ingen möter en påhittad motståndare.
    for (const f of fixtures) {
      expect(FIVE).toContain(f.home);
      expect(FIVE).toContain(f.away);
    }
  });

  it("numbers matchdays from one without gaps", () => {
    const days = [...new Set(buildFixtures(FIVE).map((f) => f.matchday))].sort((a, b) => a - b);
    expect(days[0]).toBe(1);
    expect(days).toEqual(Array.from({ length: days.length }, (_, i) => i + 1));
  });

  it("builds the same schedule every time", () => {
    expect(buildFixtures(FIVE)).toEqual(buildFixtures(FIVE));
  });

  it("has nothing to schedule for fewer than two teams", () => {
    expect(buildFixtures([])).toEqual([]);
    expect(buildFixtures([1])).toEqual([]);
  });

  it("can play a single round when asked", () => {
    const fixtures = buildFixtures(FOUR, 1);
    expect(fixtures).toHaveLength(6);
  });
});

describe("buildTable", () => {
  const teams = [
    { id: 1, name: "Alfa" },
    { id: 2, name: "Beta" },
    { id: 3, name: "Gamma" },
  ];

  function played(home: number, away: number, hs: number, as: number): PlayedFixture {
    return { homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as };
  }

  it("starts everyone on zero before a ball is kicked", () => {
    const table = buildTable(teams, []);
    expect(table).toHaveLength(3);
    for (const row of table) {
      expect(row).toMatchObject({ played: 0, won: 0, drawn: 0, lost: 0, points: 0, diff: 0 });
    }
  });

  it("pays for a win, a draw and a loss", () => {
    const table = buildTable(teams, [played(1, 2, 13, 7), played(2, 3, 12, 12)]);
    const row = (id: number) => table.find((r) => r.teamId === id)!;

    expect(row(1)).toMatchObject({ won: 1, drawn: 0, lost: 0, points: POINTS_WIN });
    expect(row(2)).toMatchObject({ won: 0, drawn: 1, lost: 1, points: POINTS_DRAW });
    expect(row(3)).toMatchObject({ won: 0, drawn: 1, lost: 0, points: POINTS_DRAW });
  });

  it("counts rounds won and conceded from both sides of the fixture", () => {
    const table = buildTable(teams, [played(1, 2, 13, 7)]);
    const row = (id: number) => table.find((r) => r.teamId === id)!;

    expect(row(1)).toMatchObject({ roundsFor: 13, roundsAgainst: 7, diff: 6 });
    expect(row(2)).toMatchObject({ roundsFor: 7, roundsAgainst: 13, diff: -6 });
  });

  it("puts the most points on top", () => {
    const table = buildTable(teams, [played(1, 2, 13, 5), played(3, 1, 13, 11)]);
    expect(table[0]!.points).toBeGreaterThanOrEqual(table[1]!.points);
    expect(table[1]!.points).toBeGreaterThanOrEqual(table[2]!.points);
  });

  it("separates equal points on round difference", () => {
    // Båda vinner en match; den som vann tyngre står över.
    const table = buildTable(teams, [played(1, 3, 13, 2), played(2, 3, 13, 11)]);
    expect(table[0]!.teamId).toBe(1);
    expect(table[1]!.teamId).toBe(2);
  });

  it("separates equal difference on rounds won", () => {
    const four = [...teams, { id: 4, name: "Delta" }];
    const table = buildTable(four, [played(1, 2, 13, 8), played(3, 4, 8, 3)]);
    // Samma differens (+5), men lag 1 vann fler rundor.
    expect(table[0]!.teamId).toBe(1);
    expect(table[1]!.teamId).toBe(3);
  });

  it("falls back to the name so the order never wobbles between loads", () => {
    const table = buildTable(
      [
        { id: 2, name: "Ö-laget" },
        { id: 1, name: "A-laget" },
      ],
      []
    );
    expect(table.map((r) => r.name)).toEqual(["A-laget", "Ö-laget"]);
  });

  it("ignores a fixture involving a team that is not in the league", () => {
    const table = buildTable(teams, [played(1, 99, 13, 0)]);
    expect(table.find((r) => r.teamId === 1)!.played).toBe(0);
    expect(table.some((r) => r.teamId === 99)).toBe(false);
  });
});
