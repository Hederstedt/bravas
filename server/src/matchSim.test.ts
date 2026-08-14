import { describe, expect, it } from "vitest";
import {
  MAX_ROUNDS,
  ROUNDS_TO_WIN,
  simulateMatch,
  type MatchTeam,
  type PlayerRatings,
} from "./matchSim.ts";

function ratings(level: number): PlayerRatings {
  return { SIK: level, SKA: level, FRA: level, TÅL: level, NYT: level, TID: level };
}

function team(id: string, name: string, level: number): MatchTeam {
  return {
    id,
    name,
    players: Array.from({ length: 5 }, (_, i) => ({
      id: `${id}-${i}`,
      name: `${name} ${i + 1}`,
      ratings: ratings(level),
    })),
  };
}

const EVEN_A = team("a", "BVS Alfa", 70);
const EVEN_B = team("b", "BVS Beta", 70);

describe("simulateMatch", () => {
  it("replays a match identically from the same seed", () => {
    // Utan det här blir all balansering gissningar och varje buggrapport
    // omöjlig att återskapa.
    const first = simulateMatch(EVEN_A, EVEN_B, "omgang-1");
    for (let i = 0; i < 5; i++) {
      expect(simulateMatch(EVEN_A, EVEN_B, "omgang-1")).toEqual(first);
    }
  });

  it("gives a different match on a different seed", () => {
    const a = simulateMatch(EVEN_A, EVEN_B, "omgang-1");
    const b = simulateMatch(EVEN_A, EVEN_B, "omgang-2");
    expect(a.rounds).not.toEqual(b.rounds);
  });

  it("stops as soon as someone reaches the target", () => {
    const result = simulateMatch(EVEN_A, EVEN_B, "kort");
    expect(Math.max(result.homeScore, result.awayScore)).toBeLessThanOrEqual(ROUNDS_TO_WIN);
    expect(result.rounds).toHaveLength(result.homeScore + result.awayScore);
  });

  it("never plays more rounds than a match can hold", () => {
    for (let i = 0; i < 50; i++) {
      const result = simulateMatch(EVEN_A, EVEN_B, `längd-${i}`);
      expect(result.rounds.length).toBeLessThanOrEqual(MAX_ROUNDS);
    }
  });

  it("declares the winner the side that reached the target", () => {
    for (let i = 0; i < 30; i++) {
      const r = simulateMatch(EVEN_A, EVEN_B, `vinnare-${i}`);
      if (r.winner === "home") expect(r.homeScore).toBe(ROUNDS_TO_WIN);
      else if (r.winner === "away") expect(r.awayScore).toBe(ROUNDS_TO_WIN);
      else expect(r.homeScore).toBe(r.awayScore);
    }
  });

  it("gives every round exactly one winner", () => {
    const r = simulateMatch(EVEN_A, EVEN_B, "rundor");
    const home = r.rounds.filter((x) => x.winner === "home").length;
    const away = r.rounds.filter((x) => x.winner === "away").length;
    expect(home).toBe(r.homeScore);
    expect(away).toBe(r.awayScore);
  });
});

describe("who wins", () => {
  // Modellen får inte vara ren slump — då säger betygen ingenting och hela
  // managerdelen är meningslös.
  function winRate(home: MatchTeam, away: MatchTeam, matches = 200): number {
    let wins = 0;
    for (let i = 0; i < matches; i++) {
      if (simulateMatch(home, away, `serie-${i}`).winner === "home") wins++;
    }
    return wins / matches;
  }

  it("lets a clearly better team win the large majority", () => {
    expect(winRate(team("a", "Bäst", 92), team("b", "Sämst", 45))).toBeGreaterThan(0.85);
  });

  it("keeps an even match close to a coin flip", () => {
    const rate = winRate(EVEN_A, EVEN_B);
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.65);
  });

  it("still lets the underdog steal one now and then", () => {
    // Ett spel där favoriten alltid vinner är inte värt att spela.
    expect(winRate(team("a", "Bra", 82), team("b", "Sämre", 62))).toBeLessThan(0.99);
  });

  it("gives a slight edge to the better side even when they are close", () => {
    expect(winRate(team("a", "Snäppet vassare", 76), team("b", "Nästan lika", 68))).toBeGreaterThan(
      0.5
    );
  });
});

describe("the scoreboard", () => {
  it("lists every player on both sides", () => {
    const r = simulateMatch(EVEN_A, EVEN_B, "protokoll");
    expect(r.scoreboard.home.map((p) => p.id)).toEqual(EVEN_A.players.map((p) => p.id));
    expect(r.scoreboard.away.map((p) => p.id)).toEqual(EVEN_B.players.map((p) => p.id));
  });

  it("balances kills against deaths", () => {
    // Varje kill dödar exakt en spelare, så summorna måste gå ihop.
    const r = simulateMatch(EVEN_A, EVEN_B, "balans");
    const all = [...r.scoreboard.home, ...r.scoreboard.away];
    const kills = all.reduce((s, p) => s + p.kills, 0);
    const deaths = all.reduce((s, p) => s + p.deaths, 0);
    expect(kills).toBe(deaths);
  });

  it("matches the scoreboard against the round events", () => {
    const r = simulateMatch(EVEN_A, EVEN_B, "hopräkning");
    const killsInRounds = r.rounds.reduce((s, round) => s + round.kills.length, 0);
    const killsOnBoard = [...r.scoreboard.home, ...r.scoreboard.away].reduce(
      (s, p) => s + p.kills,
      0
    );
    expect(killsOnBoard).toBe(killsInRounds);
  });

  it("never lets anyone die more times than there were rounds", () => {
    const r = simulateMatch(EVEN_A, EVEN_B, "dödsfall");
    for (const p of [...r.scoreboard.home, ...r.scoreboard.away]) {
      expect(p.deaths).toBeLessThanOrEqual(r.rounds.length);
    }
  });

  it("names an MVP from the side that won", () => {
    for (let i = 0; i < 20; i++) {
      const r = simulateMatch(EVEN_A, EVEN_B, `mvp-${i}`);
      if (r.winner === "draw") continue;
      const side = r.winner === "home" ? r.scoreboard.home : r.scoreboard.away;
      expect(side.some((p) => p.id === r.mvp!.id)).toBe(true);
    }
  });

  it("gives the MVP the most kills on his side", () => {
    const r = simulateMatch(EVEN_A, EVEN_B, "bästgubben");
    const side = r.winner === "away" ? r.scoreboard.away : r.scoreboard.home;
    const best = Math.max(...side.map((p) => p.kills));
    expect(r.mvp!.kills).toBe(best);
  });
});

describe("lineups that are not five strong", () => {
  it("refuses an empty lineup rather than inventing a result", () => {
    const empty: MatchTeam = { id: "c", name: "Tomt", players: [] };
    expect(() => simulateMatch(EVEN_A, empty, "tom")).toThrow();
  });

  it("plays a short-handed side without crashing", () => {
    // Fyra mot fem ska gå att simulera — laget är bara sämre.
    const short: MatchTeam = { ...EVEN_B, players: EVEN_B.players.slice(0, 4) };
    const r = simulateMatch(EVEN_A, short, "underläge");
    expect(r.rounds.length).toBeGreaterThan(0);
    expect(r.scoreboard.away).toHaveLength(4);
  });

  it("puts a short-handed side at a disadvantage", () => {
    const short: MatchTeam = { ...EVEN_B, players: EVEN_B.players.slice(0, 3) };
    let wins = 0;
    for (let i = 0; i < 100; i++) {
      if (simulateMatch(EVEN_A, short, `underläge-${i}`).winner === "home") wins++;
    }
    expect(wins).toBeGreaterThan(70);
  });
});
