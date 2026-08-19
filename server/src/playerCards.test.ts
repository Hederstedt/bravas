import { describe, expect, it } from "vitest";
import { buildCombinedCards } from "./playerCards.ts";
import type { MemberStats } from "./cs2Stats.ts";
import type { WotMemberStats } from "./wotStats.ts";
import type { MemberPlaytime } from "./valheimPlaytime.ts";

const GOOD_CS2_STATS: Record<string, number> = {
  total_kills: 8000,
  total_deaths: 6000,
  total_rounds_played: 10000,
  total_shots_fired: 300000,
  total_shots_hit: 60000,
  total_kills_headshot: 2500,
  total_planted_bombs: 300,
  total_defused_bombs: 200,
  total_mvps: 500,
  total_time_played: 3_600_000,
};

const GOOD_WOT_STATS: Record<string, number> = {
  battles: 3000,
  wins: 1650,
  damage_dealt: 3_000_000,
  survived_battles: 1200,
};

function cs2(steamid64: string, personaName: string): MemberStats {
  return { steamid64, personaName, stats: GOOD_CS2_STATS };
}

function wot(steamid64: string): WotMemberStats {
  return { wotAccountId: `wot-${steamid64}`, steamid64, personaName: "ignored", stats: GOOD_WOT_STATS };
}

function valheim(steamid64: string, minutes = 400 * 60): MemberPlaytime {
  return { steamid64, personaName: "ignored", minutes };
}

describe("buildCombinedCards", () => {
  it("matches plain CS2 rating for a member who hasn't linked WoT", () => {
    const [card] = buildCombinedCards(
      [{ steamid64: "1", personaName: "CS-Only" }],
      new Map([["1", cs2("1", "CS-Only")]]),
      new Map()
    );

    expect(card!.hasStats).toBe(true);
    expect(card!.wotAttributes).toEqual([]);
    expect(card!.overall).toBeGreaterThan(1);
  });

  it("uses the WoT rating as the base when only WoT is linked", () => {
    const [card] = buildCombinedCards(
      [{ steamid64: "2", personaName: "WoT-Only" }],
      new Map(),
      new Map([["2", wot("2")]])
    );

    expect(card!.hasStats).toBe(true);
    expect(card!.attributes).toEqual([]);
    expect(card!.wotAttributes).toHaveLength(3);
    expect(card!.overall).toBeGreaterThan(1);
  });

  it("has no rating at all for someone who has linked neither", () => {
    const [card] = buildCombinedCards([{ steamid64: "3", personaName: "Nobody" }], new Map(), new Map());

    expect(card!.hasStats).toBe(false);
    expect(card!.overall).toBe(0);
    expect(card!.tier).toBe("okänd");
    expect(card!.position).toBe("OKÄND");
  });

  it("adds WoT as a bonus on top of the CS2 base, never past 99", () => {
    const cs2Only = buildCombinedCards(
      [{ steamid64: "4", personaName: "Gubbe" }],
      new Map([["4", cs2("4", "Gubbe")]]),
      new Map()
    )[0]!;

    const withWot = buildCombinedCards(
      [{ steamid64: "4", personaName: "Gubbe" }],
      new Map([["4", cs2("4", "Gubbe")]]),
      new Map([["4", wot("4")]])
    )[0]!;

    expect(withWot.overall).toBeGreaterThanOrEqual(cs2Only.overall);
    expect(withWot.overall).toBeLessThanOrEqual(99);
  });

  it("never lowers the score for a weak WoT account bolted onto a strong CS2 one", () => {
    const weakWot: WotMemberStats = {
      wotAccountId: "weak",
      steamid64: "5",
      personaName: "ignored",
      stats: { battles: 150, wins: 30, damage_dealt: 60_000, survived_battles: 20 },
    };

    const cs2Only = buildCombinedCards(
      [{ steamid64: "5", personaName: "Gubbe" }],
      new Map([["5", cs2("5", "Gubbe")]]),
      new Map()
    )[0]!;

    const withWeakWot = buildCombinedCards(
      [{ steamid64: "5", personaName: "Gubbe" }],
      new Map([["5", cs2("5", "Gubbe")]]),
      new Map([["5", weakWot]])
    )[0]!;

    expect(withWeakWot.overall).toBeGreaterThanOrEqual(cs2Only.overall);
  });

  it("sorts by stats-present first, then rating, then name", () => {
    const cards = buildCombinedCards(
      [
        { steamid64: "a", personaName: "Zäta" },
        { steamid64: "b", personaName: "Alfa" },
        { steamid64: "c", personaName: "Ingenting" },
      ],
      new Map([
        ["a", cs2("a", "Zäta")],
        ["b", cs2("b", "Alfa")],
      ]),
      new Map()
    );

    // Samma statistik ger samma betyg, så namnet avgör: Alfa (b) före Zäta (a).
    expect(cards.map((c) => c.steamid64)).toEqual(["b", "a", "c"]);
  });

  it("always gives a member with any stats at least one comment", () => {
    const [card] = buildCombinedCards(
      [{ steamid64: "6", personaName: "Gubbe" }],
      new Map([["6", cs2("6", "Gubbe")]]),
      new Map([["6", wot("6")]])
    );

    expect(card!.comments.length).toBeGreaterThan(0);
  });

  // Den som varken spelar CS2 eller WoT ska ändå kunna få ett betyg — annars
  // står hen kvar på "OKÄND" bara för att spelvalet är ett annat.
  it("uses the Valheim rating as the base when only Valheim playtime is known", () => {
    const [card] = buildCombinedCards(
      [{ steamid64: "7", personaName: "Bara Valheim" }],
      new Map(),
      new Map(),
      new Map([["7", valheim("7")]])
    );

    expect(card!.hasStats).toBe(true);
    expect(card!.overall).toBeGreaterThan(1);
    expect(card!.position).not.toBe("OKÄND");
  });

  it("adds Valheim as a bonus on top of the CS2 base, never past 99", () => {
    const cs2Only = buildCombinedCards(
      [{ steamid64: "8", personaName: "Gubbe" }],
      new Map([["8", cs2("8", "Gubbe")]]),
      new Map(),
      new Map()
    )[0]!;

    const withValheim = buildCombinedCards(
      [{ steamid64: "8", personaName: "Gubbe" }],
      new Map([["8", cs2("8", "Gubbe")]]),
      new Map(),
      new Map([["8", valheim("8")]])
    )[0]!;

    expect(withValheim.overall).toBeGreaterThanOrEqual(cs2Only.overall);
    expect(withValheim.overall).toBeLessThanOrEqual(99);
  });

  it("stacks CS2, WoT and Valheim bonuses without ever lowering the score", () => {
    const cs2Only = buildCombinedCards(
      [{ steamid64: "9", personaName: "Gubbe" }],
      new Map([["9", cs2("9", "Gubbe")]]),
      new Map(),
      new Map()
    )[0]!;

    const allThree = buildCombinedCards(
      [{ steamid64: "9", personaName: "Gubbe" }],
      new Map([["9", cs2("9", "Gubbe")]]),
      new Map([["9", wot("9")]]),
      new Map([["9", valheim("9")]])
    )[0]!;

    expect(allThree.overall).toBeGreaterThanOrEqual(cs2Only.overall);
    expect(allThree.overall).toBeLessThanOrEqual(99);
  });

  it("leaves Valheim-less members exactly as before (default parameter)", () => {
    const [card] = buildCombinedCards(
      [{ steamid64: "10", personaName: "Gubbe" }],
      new Map([["10", cs2("10", "Gubbe")]]),
      new Map()
    );

    expect(card!.hasStats).toBe(true);
  });
});
