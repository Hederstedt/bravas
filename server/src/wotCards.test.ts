import { describe, expect, it } from "vitest";
import { rateWotCard } from "./wotCards.ts";
import type { WotMemberStats } from "./wotStats.ts";

function member(stats: Record<string, number>): WotMemberStats {
  return { wotAccountId: "1", personaName: "Gubbe", steamid64: "1", stats };
}

describe("rateWotCard", () => {
  it("has no rating below the battle threshold — a handful of battles proves nothing", () => {
    const { card } = rateWotCard(member({ battles: 5, wins: 5, damage_dealt: 5000, survived_battles: 5 }));
    expect(card.hasStats).toBe(false);
    expect(card.rating).toBe(0);
    expect(card.attributes).toEqual([]);
  });

  it("rates a real account on win rate, damage per battle and survival rate", () => {
    const { card } = rateWotCard(
      member({ battles: 2000, wins: 1100, damage_dealt: 2_000_000, survived_battles: 800 })
    );

    expect(card.hasStats).toBe(true);
    expect(card.rating).toBeGreaterThan(1);
    expect(card.rating).toBeLessThanOrEqual(99);
    expect(card.attributes.map((a) => a.key)).toEqual(["SEG", "SKD", "ÖVL"]);
    for (const a of card.attributes) {
      expect(a.rating).toBeGreaterThanOrEqual(1);
      expect(a.rating).toBeLessThanOrEqual(99);
    }
  });

  it("picks the strongest attribute as the role, ties broken by SEG > SKD > ÖVL", () => {
    // Extremt hög skadesnitt, medioker på allt annat.
    const { card } = rateWotCard(
      member({ battles: 2000, wins: 900, damage_dealt: 5_000_000, survived_battles: 500 })
    );
    expect(card.topAttr).toBe("SKD");
  });

  it("treats missing fields as zero instead of throwing", () => {
    const { card } = rateWotCard(member({ battles: 500 }));
    expect(card.hasStats).toBe(true);
    expect(card.rating).toBeGreaterThanOrEqual(1);
  });
});
