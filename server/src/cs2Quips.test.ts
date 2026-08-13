import { describe, expect, it } from "vitest";
import { buildQuips, QUIP_RULES, type Derived } from "./cs2Quips.ts";

// Svensk sifferformatering grupperar med hårt mellanslag. Skrivs som escape —
// tecknet är osynligt i editorn och ett vanligt mellanslag här ger ett fel som
// ser ut som två identiska strängar.
const NBSP = "\u00A0";

// En helt genomsnittlig gubbe: träffar ingen regel utom fallback. Varje test
// nedan knuffar bara de fält regeln bryr sig om, så det är tydligt vad som
// utlöste raden.
function base(overrides: Partial<Derived> = {}): Derived {
  return {
    hasStats: true,
    ratings: { SIK: 60, SKA: 60, FRA: 60, TÅL: 60, NYT: 60, TID: 60 },
    rounds: 10000,
    kills: 6000,
    deaths: 6000,
    hours: 500,
    accuracy: 0.18,
    hsRate: 0.3,
    mvpRate: 0.05,
    knifeKills: 0,
    taserKills: 0,
    defusedBombs: 0,
    shotsFired: 200000,
    moneyPerRound: 2500,
    pistolWinRate: 0.02,
    blindKills: 0,
    topWeapon: "ak47",
    ...overrides,
  };
}

const SEED = "76561198000000001";

function idsFor(d: Derived): string[] {
  return buildQuips(d, SEED).map((q) => q.ruleId);
}

describe("buildQuips", () => {
  it("always returns at least one line, even for a wholly unremarkable player", () => {
    const quips = buildQuips(base(), SEED);
    expect(quips.length).toBeGreaterThan(0);
    expect(quips[0]!.text.length).toBeGreaterThan(0);
  });

  it("never returns more than two lines", () => {
    // En gubbe som träffar nästan varenda regel ska ändå bara få två rader.
    const everything = base({
      ratings: { SIK: 90, SKA: 90, FRA: 90, TÅL: 90, NYT: 90, TID: 90 },
      hsRate: 0.7,
      knifeKills: 500,
      taserKills: 90,
      defusedBombs: 900,
      hours: 5000,
      mvpRate: 0.3,
      moneyPerRound: 5000,
      pistolWinRate: 0.2,
      blindKills: 900,
    });
    expect(buildQuips(everything, SEED).length).toBe(2);
  });

  it("falls back to a generic line when nothing stands out", () => {
    expect(idsFor(base())).toEqual(["fallback"]);
  });

  it("says nothing about skill when the profile is locked", () => {
    const quips = buildQuips(base({ hasStats: false }), SEED);
    expect(quips[0]!.ruleId).toBe("private");
    expect(quips).toHaveLength(1);
  });
});

describe("the rules", () => {
  it("calls out the lurker who survives but rarely frags", () => {
    const d = base({ ratings: { ...base().ratings, TÅL: 88, FRA: 50 } });
    expect(idsFor(d)).toContain("lurker");
  });

  it("calls out the entry fragger who trades his life for kills", () => {
    const d = base({ ratings: { ...base().ratings, FRA: 82, TÅL: 45 } });
    expect(idsFor(d)).toContain("entry");
  });

  it("calls out the AWPer only when the AWP is actually his weapon", () => {
    const ratings = { ...base().ratings, SIK: 85 };
    expect(idsFor(base({ ratings, topWeapon: "awp" }))).toContain("awp");
    expect(idsFor(base({ ratings, topWeapon: "ak47" }))).not.toContain("awp");
  });

  it("calls out a headshot rate over 55 percent", () => {
    expect(idsFor(base({ hsRate: 0.56 }))).toContain("skalle");
    expect(idsFor(base({ hsRate: 0.54 }))).not.toContain("skalle");
  });

  it("calls out spraying only once enough rounds have gone downrange", () => {
    // Låg träffsäkerhet på ett litet urval är otur, inte en spelstil.
    expect(idsFor(base({ accuracy: 0.12, shotsFired: 200000 }))).toContain("spray");
    expect(idsFor(base({ accuracy: 0.12, shotsFired: 5000 }))).not.toContain("spray");
  });

  it("calls out the knife and the Zeus", () => {
    expect(idsFor(base({ knifeKills: 120 }))).toContain("kniv");
    expect(idsFor(base({ taserKills: 20 }))).toContain("zeus");
  });

  it("calls out the veteran and counts his days", () => {
    const quips = buildQuips(base({ hours: 2400 }), SEED);
    const veteran = quips.find((q) => q.ruleId === "veteran");
    expect(veteran).toBeDefined();
    expect(veteran!.text).toContain(`2${NBSP}400`);
    expect(veteran!.text).toContain("100"); // 2400 h = 100 dygn
  });

  it("calls out the MVP hog, the defuser, the economist and the pistol king", () => {
    expect(idsFor(base({ mvpRate: 0.16 }))).toContain("mvp");
    expect(idsFor(base({ defusedBombs: 250 }))).toContain("defuse");
    expect(idsFor(base({ moneyPerRound: 3600 }))).toContain("ekonom");
    expect(idsFor(base({ pistolWinRate: 0.09 }))).toContain("pistol");
  });

  it("prefers the more specific rule when several match", () => {
    // Smygaren är mer talande än att han råkar ha spelat många timmar.
    const d = base({ ratings: { ...base().ratings, TÅL: 88, FRA: 50 }, hours: 3000 });
    expect(idsFor(d)[0]).toBe("lurker");
  });

  it("drops the fallback as soon as a real rule matches", () => {
    expect(idsFor(base({ knifeKills: 120 }))).not.toContain("fallback");
  });

  it("gives every rule at least two variants so the wall never reads the same twice", () => {
    for (const rule of QUIP_RULES) {
      expect(rule.lines.length, `${rule.id} needs more variants`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("determinism", () => {
  const d = base({ knifeKills: 120 });

  it("gives the same player the same line every time", () => {
    const first = buildQuips(d, SEED);
    for (let i = 0; i < 20; i++) {
      expect(buildQuips(d, SEED)).toEqual(first);
    }
  });

  it("can give two different players different variants of the same rule", () => {
    // Inte ett krav per anrop, men över ett antal seeds ska variationen synas —
    // annars vore varianterna bortkastade.
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const quip = buildQuips(d, `7656119800000${String(i).padStart(4, "0")}`).find(
        (q) => q.ruleId === "kniv"
      );
      if (quip) seen.add(quip.text);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("does not depend on the order the stats happened to arrive in", () => {
    const reordered: Derived = { ...base({ knifeKills: 120 }) };
    expect(buildQuips(reordered, SEED)).toEqual(buildQuips(d, SEED));
  });
});
