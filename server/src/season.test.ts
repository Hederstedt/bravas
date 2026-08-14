import { describe, expect, it } from "vitest";
import type { PlayerCard } from "./cs2Cards.ts";
import {
  buildPool,
  overallOf,
  playerValue,
  SEASON_BUDGET,
  SQUAD_SIZE,
  squadCost,
  validateSquad,
  type PoolPlayer,
} from "./season.ts";

function ratings(level: number) {
  return { SIK: level, SKA: level, FRA: level, TÅL: level, NYT: level, TID: level };
}

function card(steamid64: string, name: string, level: number, hasStats = true): PlayerCard {
  return {
    steamid64,
    personaName: name,
    hasStats,
    overall: level,
    tier: "silver",
    position: "AWP",
    attributes: hasStats
      ? Object.entries(ratings(level)).map(([key, rating]) => ({
          key: key as never,
          label: key,
          description: key,
          rating,
        }))
      : [],
    comments: ["nåt"],
  };
}

function poolPlayer(key: string, level: number): PoolPlayer {
  return {
    key,
    source: "generated",
    steamid64: null,
    name: key,
    ratings: ratings(level),
    value: playerValue(ratings(level)),
  };
}

describe("playerValue", () => {
  it("costs more the better he is", () => {
    expect(playerValue(ratings(80))).toBeGreaterThan(playerValue(ratings(70)));
    expect(playerValue(ratings(70))).toBeGreaterThan(playerValue(ratings(60)));
  });

  it("climbs steeply enough that a star is a real sacrifice", () => {
    // Vore kurvan linjär skulle man alltid köpa fem medelgubbar och valet
    // mellan bredd och en stjärna vore inget val.
    const star = playerValue(ratings(90));
    const average = playerValue(ratings(70));
    expect(star / average).toBeGreaterThan(1.8);
  });

  it("never goes below zero or returns a fraction", () => {
    for (const level of [1, 30, 55, 99]) {
      const v = playerValue(ratings(level));
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe("the budget", () => {
  it("affords a squad of solid players but not a squad of stars", () => {
    // Hela poängen med en budget: den ska tvinga fram ett val.
    const solid = Array.from({ length: SQUAD_SIZE }, (_, i) => poolPlayer(`s${i}`, 70));
    const stars = Array.from({ length: SQUAD_SIZE }, (_, i) => poolPlayer(`x${i}`, 88));

    expect(squadCost(solid)).toBeLessThanOrEqual(SEASON_BUDGET);
    expect(squadCost(stars)).toBeGreaterThan(SEASON_BUDGET);
  });

  it("affords one star carried by cheaper team-mates", () => {
    const squad = [poolPlayer("stjärna", 90), ...Array.from({ length: 4 }, (_, i) => poolPlayer(`b${i}`, 62))];
    expect(squadCost(squad)).toBeLessThanOrEqual(SEASON_BUDGET);
  });
});

describe("buildPool", () => {
  const members = [card("1", "[BVS] ⛟", 84), card("2", "[BVS] #Mag", 71)];

  it("puts the real gubbar in the pool with their frozen ratings", () => {
    const pool = buildPool({ members, historical: [], generatedCount: 0, seed: "s1" });

    expect(pool).toHaveLength(2);
    expect(pool[0]).toMatchObject({ source: "member", steamid64: "1", name: "[BVS] ⛟" });
    expect(overallOf(pool[0]!.ratings)).toBe(84);
  });

  it("leaves out anyone Steam gave us nothing for", () => {
    // En låst profil har inga attribut att frysa — han kan inte prissättas.
    const pool = buildPool({
      members: [...members, card("3", "[BVS] Hemlig", 0, false)],
      historical: [],
      generatedCount: 0,
      seed: "s1",
    });
    expect(pool.map((p) => p.steamid64)).toEqual(["1", "2"]);
  });

  it("adds historical versions as separate, buyable players", () => {
    const pool = buildPool({
      members,
      historical: [{ steamid64: "1", label: "mars 2026", name: "[BVS] ⛟", ratings: ratings(60) }],
      generatedCount: 0,
      seed: "s1",
    });

    const old = pool.find((p) => p.source === "historical")!;
    expect(old.name).toContain("mars 2026");
    expect(overallOf(old.ratings)).toBe(60);
    // Nuvarande och historisk version är två olika spelare i poolen.
    expect(old.key).not.toBe(pool.find((p) => p.source === "member" && p.steamid64 === "1")!.key);
  });

  it("fills up with generated free agents", () => {
    const pool = buildPool({ members, historical: [], generatedCount: 8, seed: "s1" });
    expect(pool.filter((p) => p.source === "generated")).toHaveLength(8);
  });

  it("gives every player in the pool a unique key", () => {
    const pool = buildPool({
      members,
      historical: [{ steamid64: "1", label: "mars", name: "[BVS] ⛟", ratings: ratings(60) }],
      generatedCount: 20,
      seed: "s1",
    });
    expect(new Set(pool.map((p) => p.key)).size).toBe(pool.length);
  });

  it("builds the same pool from the same seed", () => {
    // Poolen fryses en gång per säsong och får inte ändra sig mellan anrop.
    const a = buildPool({ members, historical: [], generatedCount: 12, seed: "säsong-1" });
    const b = buildPool({ members, historical: [], generatedCount: 12, seed: "säsong-1" });
    expect(b).toEqual(a);
  });

  it("builds a different pool for a different season", () => {
    const a = buildPool({ members, historical: [], generatedCount: 12, seed: "säsong-1" });
    const b = buildPool({ members, historical: [], generatedCount: 12, seed: "säsong-2" });
    expect(b.filter((p) => p.source === "generated")).not.toEqual(
      a.filter((p) => p.source === "generated")
    );
  });

  it("keeps generated players within a believable range", () => {
    const pool = buildPool({ members: [], historical: [], generatedCount: 100, seed: "spann" });
    for (const p of pool) {
      const overall = overallOf(p.ratings);
      expect(overall).toBeGreaterThanOrEqual(35);
      expect(overall).toBeLessThanOrEqual(85);
    }
  });

  it("gives generated players names that cannot be mistaken for a member", () => {
    const pool = buildPool({ members, historical: [], generatedCount: 20, seed: "namn" });
    for (const p of pool.filter((x) => x.source === "generated")) {
      expect(p.name).not.toContain("[BVS]");
      expect(p.steamid64).toBeNull();
    }
  });
});

describe("validateSquad", () => {
  const pool = Array.from({ length: 10 }, (_, i) => poolPlayer(`p${i}`, 65));
  const full = pool.slice(0, SQUAD_SIZE).map((p) => p.key);

  function check(keys: string[], taken: string[] = []) {
    return validateSquad(keys, pool, new Set(taken));
  }

  it("accepts a legal squad", () => {
    expect(check(full)).toEqual({ ok: true });
  });

  it("insists on a full squad", () => {
    expect(check(full.slice(0, 3)).ok).toBe(false);
    expect(check([...full, pool[5]!.key]).ok).toBe(false);
  });

  it("refuses the same player twice", () => {
    const twice = [pool[0]!.key, pool[0]!.key, pool[1]!.key, pool[2]!.key, pool[3]!.key];
    expect(check(twice)).toEqual({ ok: false, error: "Samma gubbe kan inte väljas två gånger." });
  });

  it("refuses someone who is not in the pool", () => {
    expect(check([...full.slice(0, 4), "finns-inte"]).ok).toBe(false);
  });

  it("refuses someone another team already signed", () => {
    // Knappheten är det som gör transfermarknaden meningsfull — samma gubbe
    // kan inte spela för två lag.
    const result = check(full, [full[2]!]);
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("annat lag");
  });

  it("refuses a squad the budget does not cover", () => {
    const rich = Array.from({ length: SQUAD_SIZE }, (_, i) => poolPlayer(`r${i}`, 95));
    const result = validateSquad(
      rich.map((p) => p.key),
      rich,
      new Set()
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("budget");
  });

  it("explains itself in Swedish, since the message reaches the manager", () => {
    const result = check(full.slice(0, 2));
    expect((result as { error: string }).error).toMatch(/gubbar/i);
  });
});
