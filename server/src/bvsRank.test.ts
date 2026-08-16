import { describe, expect, it } from "vitest";
import { rankFor, RANK_LADDER } from "./bvsRank.ts";

describe("rankFor", () => {
  it("starts at the bottom of the ladder", () => {
    expect(rankFor(0)).toBe("MENIG");
    expect(rankFor(1)).toBe("MENIG");
  });

  it("climbs the ladder as the score rises", () => {
    expect(rankFor(20)).toBe("KORPRAL");
    expect(rankFor(35)).toBe("SERGEANT");
    expect(rankFor(50)).toBe("LÖJTNANT");
    expect(rankFor(65)).toBe("KAPTEN");
    expect(rankFor(80)).toBe("ÖVERSTE");
  });

  it("reaches the top only near the very best scores", () => {
    expect(rankFor(90)).toBe("GENERAL");
    expect(rankFor(99)).toBe("GENERAL");
  });

  it("never returns a rank the ladder doesn't have", () => {
    for (let overall = 0; overall <= 99; overall++) {
      expect(RANK_LADDER.map(([, name]) => name)).toContain(rankFor(overall));
    }
  });

  it("is non-decreasing as the score rises", () => {
    let lastIndex = 0;
    for (let overall = 0; overall <= 99; overall++) {
      const index = RANK_LADDER.findIndex(([, name]) => name === rankFor(overall));
      expect(index).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = index;
    }
  });
});
