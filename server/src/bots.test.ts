import { describe, expect, it } from "vitest";
import { botBudget, BOT_TEAM_NAMES, draftSquad, pickBotNames } from "./bots.ts";
import { SEASON_BUDGET, SQUAD_SIZE, squadCost, type PoolPlayer } from "./season.ts";
import type { PlayerRatings } from "./matchSim.ts";

function ratings(base: number): PlayerRatings {
  return { SIK: base, SKA: base, FRA: base, TÅL: base, NYT: base, TID: base };
}

// En pool med jämnt stigande värden, så testerna kan resonera om priser.
function pool(count: number, from = 30, step = 2): PoolPlayer[] {
  return Array.from({ length: count }, (_, i) => {
    const overall = from + i * step;
    return {
      key: `generated:${i}`,
      source: "generated" as const,
      steamid64: null,
      name: `Gubbe ${i}`,
      ratings: ratings(overall),
      value: Math.max(1, Math.round(overall ** 3 / 100)),
    };
  });
}

describe("pickBotNames", () => {
  it("tar namnen i ordning", () => {
    expect(pickBotNames(3, new Set())).toEqual(BOT_TEAM_NAMES.slice(0, 3));
  });

  it("hoppar över namn som redan finns i serien", () => {
    const names = pickBotNames(2, new Set([BOT_TEAM_NAMES[0]]));
    expect(names).not.toContain(BOT_TEAM_NAMES[0]);
    expect(names).toHaveLength(2);
  });

  it("hittar på fler namn hellre än att lämna serien kort", () => {
    const names = pickBotNames(BOT_TEAM_NAMES.length + 2, new Set());
    expect(names).toHaveLength(BOT_TEAM_NAMES.length + 2);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("draftSquad", () => {
  it("skriver på exakt fem gubbar", () => {
    expect(draftSquad(pool(30), "a")).toHaveLength(SQUAD_SIZE);
  });

  it("håller sig inom budgeten", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const squad = draftSquad(pool(40), seed);
      expect(squadCost(squad)).toBeLessThanOrEqual(SEASON_BUDGET);
    }
  });

  it("väljer aldrig samma gubbe två gånger", () => {
    const squad = draftSquad(pool(40), "dubbletter");
    expect(new Set(squad.map((p) => p.key)).size).toBe(squad.length);
  });

  it("ger samma trupp för samma seed", () => {
    const a = draftSquad(pool(40), "samma");
    const b = draftSquad(pool(40), "samma");
    expect(a.map((p) => p.key)).toEqual(b.map((p) => p.key));
  });

  it("ger olika trupper för olika seeds", () => {
    const a = draftSquad(pool(60), "ett").map((p) => p.key).join();
    const b = draftSquad(pool(60), "två").map((p) => p.key).join();
    expect(a).not.toBe(b);
  });

  // Poängen med uppgraderingsvarven: en bot som bara tar de billigaste är
  // ingen motståndare.
  it("handlar för mer än bara de billigaste fem", () => {
    const available = pool(40);
    const cheapest = squadCost([...available].sort((a, b) => a.value - b.value).slice(0, SQUAD_SIZE));
    expect(squadCost(draftSquad(available, "uppgradera"))).toBeGreaterThan(cheapest);
  });

  it("lämnar tillbaka tomt när poolen är för liten", () => {
    expect(draftSquad(pool(3), "för-liten")).toEqual([]);
  });

  // Räcker inte budgeten ens till de billigaste fem finns ingen giltig trupp,
  // och då är tomt rätt svar — inte en trupp som spränger budgeten.
  it("lämnar tillbaka tomt när ens de billigaste är för dyra", () => {
    expect(draftSquad(pool(10, 80), "för-dyrt", 100)).toEqual([]);
  });

  it("respekterar en snålare budget", () => {
    const squad = draftSquad(pool(40), "snål", 6000);
    expect(squad).toHaveLength(SQUAD_SIZE);
    expect(squadCost(squad)).toBeLessThanOrEqual(6000);
  });
});

describe("botBudget", () => {
  it("ligger mellan 62 och 100 procent av budgeten", () => {
    for (let i = 0; i < 50; i++) {
      const budget = botBudget(`lag-${i}`);
      expect(budget).toBeGreaterThanOrEqual(Math.round(SEASON_BUDGET * 0.62));
      expect(budget).toBeLessThanOrEqual(SEASON_BUDGET);
    }
  });

  it("är samma för samma seed", () => {
    expect(botBudget("stabil")).toBe(botBudget("stabil"));
  });

  // Utan spridning blir serien en mur av maximalt optimerade lag.
  it("ger olika lag olika djupa fickor", () => {
    const budgets = new Set(["a", "b", "c", "d", "e"].map((s) => botBudget(s)));
    expect(budgets.size).toBeGreaterThan(1);
  });
});
