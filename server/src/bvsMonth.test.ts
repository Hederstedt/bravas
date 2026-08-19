import { describe, expect, it } from "vitest";
import { CAP_HOURS_PER_GAME, DISCORD_GAME, hoursPerGame, hoursPerGameWithDiscord, scoreFor } from "./bvsMonth.ts";
import type { DiscordSample, PresenceSample } from "./db.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const START = new Date(2026, 7, 1, 19, 0, 0).getTime();

// Samma pulsrad-form som närvaropollern skriver — en rad var femte minut.
// Annars läses varje steg som ett glapp, vilket är rätt för riktiga glapp men
// gör fixturen meningslös. Se activity.test.ts, samma mönster.
function played(steps: { game: string; minutes: number }[], from = START): PresenceSample[] {
  const rows: PresenceSample[] = [];
  let at = from;
  for (const step of steps) {
    for (let left = step.minutes; left > 0; left -= 5) {
      rows.push({ at, steamid64: "76561190000000001", game: step.game });
      at += 5 * MIN;
    }
  }
  // Avslutande rad så det sista steget får en varaktighet — sista raden i en
  // session ger annars aldrig ett spann.
  rows.push({ at, steamid64: "76561190000000001", game: "Slut" });
  return rows;
}

// Samma pulsradsmönster som played(), men utan game-fält — discord_samples
// vet bara att gubben syntes, inte i vad.
function seenInDiscord(minutes: number, from = START): DiscordSample[] {
  const rows: DiscordSample[] = [];
  let at = from;
  for (let left = minutes; left > 0; left -= 5) {
    rows.push({ at, steamid64: "76561190000000001" });
    at += 5 * MIN;
  }
  rows.push({ at, steamid64: "76561190000000001" });
  return rows;
}

const CS2 = "Counter-Strike 2";
const WOT = "World of Tanks";
const VALHEIM = "Valheim";
const NOW = START + 31 * 24 * HOUR;

describe("hoursPerGame", () => {
  it("groups hours by the raw game string, not CS2 vs. everything else", () => {
    const hours = hoursPerGame(
      played([
        { game: CS2, minutes: 120 },
        { game: WOT, minutes: 60 },
      ]),
      START,
      NOW
    );
    expect(hours.get(CS2)).toBeCloseTo(2, 5);
    expect(hours.get(WOT)).toBeCloseTo(1, 5);
    expect(hours.size).toBe(2);
  });

  it("clips a span that starts before the window", () => {
    const hours = hoursPerGame(played([{ game: CS2, minutes: 60 }]), START + 30 * MIN, NOW);
    expect(hours.get(CS2)).toBeCloseTo(0.5, 5);
  });

  it("clips a span that ends after the window", () => {
    const hours = hoursPerGame(played([{ game: CS2, minutes: 60 }]), START, START + 30 * MIN);
    expect(hours.get(CS2)).toBeCloseTo(0.5, 5);
  });

  // Systematisk underräkning, aldrig över: ett spann kräver en efterföljare,
  // så det sista steget före "Slut" räknas, men de sista minuterna av en
  // session som aldrig fick en rad efter sig gör det inte.
  it("never overcounts — the trailing minutes of a session with no follow-up row are simply lost", () => {
    const rows = played([{ game: CS2, minutes: 60 }]).slice(0, -1);
    const hours = hoursPerGame(rows, START, NOW);
    expect(hours.get(CS2)).toBeLessThan(1);
  });

  it("returns an empty map for someone with no samples", () => {
    expect(hoursPerGame([], START, NOW).size).toBe(0);
  });

  it("ignores samples entirely outside the window", () => {
    const hours = hoursPerGame(played([{ game: CS2, minutes: 60 }]), NOW, NOW + HOUR);
    expect(hours.size).toBe(0);
  });
});

describe("scoreFor", () => {
  it("counts hours under the cap in full", () => {
    expect(scoreFor(new Map([[CS2, 5]]))).toBeCloseTo(5, 5);
  });

  // Varje spel bidrar upp till taket. Den som är med överallt slår den som
  // grindar ett enda spel.
  it("caps each game at CAP_HOURS_PER_GAME", () => {
    expect(scoreFor(new Map([[CS2, 40]]))).toBe(CAP_HOURS_PER_GAME);
  });

  it("sums capped contributions across every game", () => {
    const hours = new Map([
      [CS2, 40],
      [WOT, 3],
      [VALHEIM, 40],
    ]);
    expect(scoreFor(hours)).toBe(CAP_HOURS_PER_GAME + 3 + CAP_HOURS_PER_GAME);
  });

  it("scores nobody at zero", () => {
    expect(scoreFor(new Map())).toBe(0);
  });
});

describe("hoursPerGameWithDiscord", () => {
  it("adds Discord as its own bucket alongside the games played", () => {
    const hours = hoursPerGameWithDiscord(
      played([{ game: CS2, minutes: 120 }]),
      seenInDiscord(60),
      START,
      NOW
    );
    expect(hours.get(CS2)).toBeCloseTo(2, 5);
    expect(hours.get(DISCORD_GAME)).toBeCloseTo(1, 5);
  });

  // Ingen widget-koppling eller inget matchat Discord-namn ska inte lägga
  // till en tom rad i kartan — samma regel som hoursPerGame redan följer.
  it("adds no Discord entry when nothing was ever sampled", () => {
    const hours = hoursPerGameWithDiscord(played([{ game: CS2, minutes: 60 }]), [], START, NOW);
    expect(hours.has(DISCORD_GAME)).toBe(false);
  });

  it("scores someone with only Discord time, capped like any other game", () => {
    const hours = hoursPerGameWithDiscord([], seenInDiscord(40 * 60), START, NOW);
    expect(scoreFor(hours)).toBe(CAP_HOURS_PER_GAME);
  });
});
