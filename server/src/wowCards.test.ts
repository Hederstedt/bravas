import { describe, expect, it } from "vitest";
import { MAX_LEVEL, MIN_LEVEL, WOW_ATTR_ORDER, rateWowCard } from "./wowCards.ts";
import type { WowCharacterStats } from "./wowStats.ts";

function char(over: Partial<WowCharacterStats> = {}): WowCharacterStats {
  return {
    name: "Bravasdruid",
    realmSlug: "stormscale",
    level: MAX_LEVEL,
    achievementPoints: 12000,
    equippedItemLevel: 600,
    lastLogin: 0,
    ...over,
  };
}

describe("rateWowCard", () => {
  it("gives all three attributes in a fixed order", () => {
    const { card } = rateWowCard(char());
    expect(card.attributes.map((a) => a.key)).toEqual(WOW_ATTR_ORDER);
  });

  it("rates every attribute inside 1-99", () => {
    for (const c of [char(), char({ achievementPoints: 0, equippedItemLevel: 0, level: 1 }), char({ achievementPoints: 90000, equippedItemLevel: 900 })]) {
      for (const a of rateWowCard(c).card.attributes) {
        expect(a.rating).toBeGreaterThanOrEqual(1);
        expect(a.rating).toBeLessThanOrEqual(99);
      }
    }
  });

  // Samma tröskel som WoT: under den säger siffrorna inget. En nyss skapad
  // karaktär ska inte ge ett betyg alls, den ska ge inget kort.
  it("refuses to rate a character below the level floor", () => {
    expect(rateWowCard(char({ level: MIN_LEVEL - 1 })).card.hasStats).toBe(false);
  });

  it("rates a character at the floor", () => {
    expect(rateWowCard(char({ level: MIN_LEVEL })).card.hasStats).toBe(true);
  });

  it("gives an unrated character no attributes to draw", () => {
    expect(rateWowCard(char({ level: 1 })).card.attributes).toEqual([]);
  });

  it("ranks more achievement points above fewer", () => {
    const few = rateWowCard(char({ achievementPoints: 2000 })).card;
    const many = rateWowCard(char({ achievementPoints: 30000 })).card;
    expect(many.rating).toBeGreaterThan(few.rating);
  });

  it("ranks better gear above worse", () => {
    const poor = rateWowCard(char({ equippedItemLevel: 400 })).card;
    const rich = rateWowCard(char({ equippedItemLevel: 700 })).card;
    expect(rich.rating).toBeGreaterThan(poor.rating);
  });

  // Betyget är en bedömning av karaktären, inte av när han sist var inne.
  it("ignores the login timestamp entirely", () => {
    expect(rateWowCard(char({ lastLogin: 0 })).card.rating).toBe(
      rateWowCard(char({ lastLogin: 1_700_000_000_000 })).card.rating
    );
  });

  it("names the strongest attribute as the role", () => {
    const { card } = rateWowCard(char({ achievementPoints: 90000, equippedItemLevel: 100 }));
    expect(card.topAttr).toBe("SAM");
  });
});
