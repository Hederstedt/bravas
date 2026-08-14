import { describe, expect, it } from "vitest";
import { SELL_RATE, sellPrice, TRANSFERS_PER_MATCHDAY, validateTransfer } from "./market.ts";

const SQUAD = [
  { key: "m:a", name: "Kungalv", value: 6200 },
  { key: "g:b", name: "Bärarn", value: 3100 },
];

const POOL = [
  ...SQUAD,
  { key: "g:c", name: "Cyklisten", value: 5000 },
  { key: "g:d", name: "Dundret", value: 900 },
  { key: "m:e", name: "Stjärnan", value: 9000 },
];

function check(input: Partial<Parameters<typeof validateTransfer>[0]> = {}) {
  return validateTransfer({
    sellKey: "g:b",
    buyKey: "g:c",
    squad: SQUAD,
    pool: POOL,
    takenKeys: new Set(SQUAD.map((p) => p.key)),
    funds: 4000,
    ...input,
  });
}

describe("sellPrice", () => {
  // Rabatten är invarianten mot pengamaskiner: varje rundtur förlorar pengar.
  it("is always below the value, never negative", () => {
    for (const value of [1, 2, 3, 100, 999, 6200, 20_000]) {
      expect(sellPrice(value)).toBeLessThan(value);
      expect(sellPrice(value)).toBeGreaterThanOrEqual(0);
    }
  });

  it("pays out the sell rate rounded down", () => {
    expect(sellPrice(1000)).toBe(700);
    expect(sellPrice(999)).toBe(Math.floor(999 * SELL_RATE));
  });
});

describe("validateTransfer", () => {
  it("approves a legal swap and does the maths", () => {
    const result = check();
    expect(result).toEqual({
      ok: true,
      soldFor: 2170, // floor(0.7 × 3100)
      boughtFor: 5000,
      newFunds: 4000 + 2170 - 5000,
    });
  });

  // Kassan plus truppens värde får aldrig öka av en affär — det är rabatten
  // som ser till det, och det här testet som vaktar den.
  it("never lets a transfer grow funds plus squad value", () => {
    const squadValue = SQUAD.reduce((s, p) => s + p.value, 0);
    for (const buyKey of ["g:c", "g:d"]) {
      const result = check({ buyKey, funds: 20_000 });
      if (!result.ok) continue;
      const bought = POOL.find((p) => p.key === buyKey)!;
      const newSquadValue = squadValue - 3100 + bought.value;
      expect(result.newFunds + newSquadValue).toBeLessThan(20_000 + squadValue);
    }
  });

  it("refuses to sell and buy the same player", () => {
    const result = check({ buyKey: "g:b" });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Samma gubbe") });
  });

  it("refuses to sell a player outside the squad", () => {
    const result = check({ sellKey: "g:d", buyKey: "g:c" });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("inte i din trupp") });
  });

  it("refuses to buy a player outside the pool", () => {
    const result = check({ buyKey: "finns:inte" });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("finns inte") });
  });

  it("refuses to buy a contracted player, own squad included", () => {
    const taken = check({ buyKey: "m:e", takenKeys: new Set(["m:a", "g:b", "m:e"]) });
    expect(taken).toMatchObject({ ok: false, error: expect.stringContaining("redan skriven") });

    const own = check({ buyKey: "m:a" });
    expect(own).toMatchObject({ ok: false, error: expect.stringContaining("redan skriven") });
  });

  it("explains when the funds do not stretch", () => {
    const result = check({ buyKey: "m:e", funds: 100 });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Kassan räcker inte") });
  });

  it("keeps the quota at one per matchday", () => {
    // Konstanten är en spelregel — ändras den ska någon ha menat det.
    expect(TRANSFERS_PER_MATCHDAY).toBe(1);
  });
});
