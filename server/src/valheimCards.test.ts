import { describe, expect, it } from "vitest";
import { rateValheimCard } from "./valheimCards.ts";
import type { MemberPlaytime } from "./valheimPlaytime.ts";

function playtime(minutes: number): MemberPlaytime {
  return { steamid64: "1", personaName: "Gubbe", minutes };
}

describe("rateValheimCard", () => {
  it("has no rating for someone with zero recorded minutes", () => {
    const { card } = rateValheimCard(playtime(0));
    expect(card).toEqual({ hasStats: false, rating: 0, tier: "okänd" });
  });

  it("rates a modest amount of playtime low but not zero", () => {
    const { card } = rateValheimCard(playtime(5 * 60));
    expect(card.hasStats).toBe(true);
    expect(card.rating).toBeGreaterThan(0);
    expect(card.rating).toBeLessThan(30);
  });

  it("rates more hours higher, up to the 1-99 ceiling", () => {
    const modest = rateValheimCard(playtime(50 * 60)).card;
    const heavy = rateValheimCard(playtime(4000 * 60)).card;

    expect(heavy.rating).toBeGreaterThan(modest.rating);
    expect(heavy.rating).toBeLessThanOrEqual(99);
  });
});
