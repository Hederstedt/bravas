import { describe, expect, it } from "vitest";
import { createRng, hashSeed, pickWeighted } from "./rng.ts";

describe("hashSeed", () => {
  it("gives the same number for the same string every time", () => {
    expect(hashSeed("bvs")).toBe(hashSeed("bvs"));
  });

  it("separates strings that differ only slightly", () => {
    expect(hashSeed("76561198000000001")).not.toBe(hashSeed("76561198000000002"));
  });

  it("stays inside 32 bits", () => {
    for (const s of ["", "a", "en lite längre sträng med åäö"]) {
      const h = hashSeed(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("createRng", () => {
  it("replays the exact same sequence from the same seed", () => {
    const a = createRng("match-1");
    const b = createRng("match-1");
    const first = Array.from({ length: 20 }, () => a());
    const second = Array.from({ length: 20 }, () => b());
    expect(second).toEqual(first);
  });

  it("gives different seeds different sequences", () => {
    const a = createRng("match-1");
    const b = createRng("match-2");
    expect(Array.from({ length: 10 }, () => a())).not.toEqual(
      Array.from({ length: 10 }, () => b())
    );
  });

  it("stays in [0, 1)", () => {
    const rng = createRng("gränser");
    for (let i = 0; i < 5000; i++) {
      const n = rng();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it("spreads roughly evenly across the range", () => {
    // Inte ett bevis, men en dålig generator som fastnar i ett hörn fångas.
    const rng = createRng("spridning");
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 10000; i++) buckets[Math.floor(rng() * 10)]++;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1300);
    }
  });
});

describe("pickWeighted", () => {
  it("returns null for an empty list", () => {
    expect(pickWeighted([], () => 1, createRng("x"))).toBeNull();
  });

  it("always returns the only candidate", () => {
    expect(pickWeighted(["ensam"], () => 1, createRng("x"))).toBe("ensam");
  });

  it("never returns something weighted at zero", () => {
    const rng = createRng("noll");
    for (let i = 0; i < 200; i++) {
      expect(pickWeighted(["a", "b"], (x) => (x === "a" ? 0 : 1), rng)).toBe("b");
    }
  });

  it("favours the heavier candidate over many draws", () => {
    const rng = createRng("vikt");
    let heavy = 0;
    for (let i = 0; i < 2000; i++) {
      if (pickWeighted(["tung", "lätt"], (x) => (x === "tung" ? 9 : 1), rng) === "tung") heavy++;
    }
    // Förväntat 90 %; marginalen tål slumpen utan att bli meningslös.
    expect(heavy).toBeGreaterThan(1700);
    expect(heavy).toBeLessThan(1900);
  });

  it("falls back to a real candidate when every weight is zero", () => {
    // Annars hade den returnerat null mitt i en runda och tagit matchen med sig.
    expect(pickWeighted(["a", "b"], () => 0, createRng("x"))).not.toBeNull();
  });
});
