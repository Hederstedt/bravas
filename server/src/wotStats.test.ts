import { describe, expect, it } from "vitest";
import { computeWotHighlights, type WotMemberStats } from "./wotStats.ts";

function member(personaName: string, stats: Record<string, number>): WotMemberStats {
  return { wotAccountId: personaName, steamid64: personaName, personaName, stats };
}

describe("computeWotHighlights", () => {
  it("returns nothing when nobody has linked their account yet", () => {
    expect(computeWotHighlights([])).toEqual([]);
  });

  it("crowns the member with the most battles", () => {
    const highlights = computeWotHighlights([
      member("Gubbe #1", { battles: 2000, wins: 1000, damage_dealt: 1_000_000 }),
      member("Gubbe #2", { battles: 5000, wins: 2500, damage_dealt: 2_000_000 }),
    ]);

    const battles = highlights.find((h) => h.label === "Flest strider");
    expect(battles).toMatchObject({ gameId: "wot", gameTitle: "World of Tanks", holder: "Gubbe #2" });
    expect(battles?.value).toBe("5 000");
    expect(battles?.value).toBe(`5${" "}000`);
  });

  it("ranks win rate only among members with enough battles to mean something", () => {
    const highlights = computeWotHighlights([
      // 3 strider, 100 % vinst — för lite underlag för att räknas.
      member("Tursam", { battles: 3, wins: 3, damage_dealt: 3000 }),
      member("Van", { battles: 2000, wins: 1200, damage_dealt: 1_000_000 }),
    ]);

    const rate = highlights.find((h) => h.label === "Bästa vinstprocent");
    expect(rate?.holder).toBe("Van");
    expect(rate?.value).toBe("60,0 %");
  });

  it("crowns the member with the most total damage dealt", () => {
    const highlights = computeWotHighlights([
      member("Gubbe #1", { battles: 1000, wins: 500, damage_dealt: 900_000 }),
      member("Gubbe #2", { battles: 1000, wins: 500, damage_dealt: 1_500_000 }),
    ]);

    const damage = highlights.find((h) => h.label === "Mest skada tillfogad");
    expect(damage?.holder).toBe("Gubbe #2");
  });

  it("leaves out a highlight nobody qualifies for instead of showing zero", () => {
    const highlights = computeWotHighlights([member("Gubbe #1", { battles: 0, wins: 0, damage_dealt: 0 })]);
    expect(highlights).toEqual([]);
  });
});
