import { describe, expect, it } from "vitest";
import {
  activityBonus,
  bonusFrom,
  CS2_GAME,
  hoursInWindow,
  MAX_TRAINING_BONUS,
  MAX_TRANSFER_BONUS,
} from "./activity.ts";
import { MAX_GAP_MS } from "./sampleSpans.ts";
import type { PresenceSample } from "./db.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const START = new Date(2026, 7, 10, 19, 0, 0).getTime();

// Närvaropollern skriver en rad var femte minut. Testdata måste se likadan ut,
// annars läses varje steg som ett glapp — vilket är rätt för riktiga glapp men
// gör fixturen meningslös.
function played(steps: { game: string; minutes: number }[], from = START): PresenceSample[] {
  const rows: PresenceSample[] = [];
  let at = from;
  for (const step of steps) {
    for (let left = step.minutes; left > 0; left -= 5) {
      rows.push({ at, steamid64: "76561190000000001", game: step.game });
      at += 5 * MIN;
    }
  }
  // Avslutande rad så att sista steget får en varaktighet.
  rows.push({ at, steamid64: "76561190000000001", game: "Slut" });
  return rows;
}

const NOW = START + 24 * HOUR;

describe("hoursInWindow", () => {
  it("counts CS2 apart from everything else", () => {
    const hours = hoursInWindow(
      played([
        { game: CS2_GAME, minutes: 120 },
        { game: "Valheim", minutes: 60 },
      ]),
      START,
      NOW
    );

    expect(hours.cs2).toBeCloseTo(2, 5);
    expect(hours.other).toBeCloseTo(1, 5);
  });

  it("has nothing to report without samples", () => {
    expect(hoursInWindow([], START, NOW)).toEqual({ cs2: 0, other: 0 });
  });

  // Fönstret börjar när förra omgången spelades. Timmar före den ska inte
  // följa med — de tillhörde förra omgångens bonus.
  it("ignores time that falls before the window", () => {
    const samples = played([{ game: CS2_GAME, minutes: 120 }])
    const halfway = START + HOUR;

    const hours = hoursInWindow(samples, halfway, NOW);

    expect(hours.cs2).toBeCloseTo(1, 5);
  });

  it("clips a session that straddles the end of the window", () => {
    const hours = hoursInWindow(played([{ game: CS2_GAME, minutes: 120 }]), START, START + HOUR);
    expect(hours.cs2).toBeCloseTo(1, 5);
  });

  // Ett glapp betyder att pollern inte tittade. Att gissa hade gett timmar
  // ingen spelat.
  it("skips a gap instead of counting it as play", () => {
    const samples: PresenceSample[] = [
      { at: START, steamid64: "1", game: CS2_GAME },
      { at: START + MAX_GAP_MS + HOUR, steamid64: "1", game: CS2_GAME },
      { at: START + MAX_GAP_MS + HOUR + 5 * MIN, steamid64: "1", game: CS2_GAME },
    ];

    expect(hoursInWindow(samples, START, NOW).cs2).toBeCloseTo(5 / 60, 5);
  });
});

describe("bonusFrom", () => {
  it("gives nothing for an evening that never happened", () => {
    expect(bonusFrom({ cs2: 0, other: 0 })).toMatchObject({ training: 0, transfer: 0 });
  });

  it("turns CS2 hours into training and other games into a transfer", () => {
    expect(bonusFrom({ cs2: 3, other: 0 }).training).toBe(1);
    expect(bonusFrom({ cs2: 0, other: 4 }).transfer).toBe(1);
  });

  it("does not round a half evening up", () => {
    expect(bonusFrom({ cs2: 2.9, other: 3.9 })).toMatchObject({ training: 0, transfer: 0 });
  });

  // Taken är det som hindrar den som lirar dygnet runt från att göra serien
  // meningslös.
  it("caps what a single matchday can be worth", () => {
    const absurd = bonusFrom({ cs2: 400, other: 400 });
    expect(absurd.training).toBe(MAX_TRAINING_BONUS);
    expect(absurd.transfer).toBe(MAX_TRANSFER_BONUS);
  });

  it("keeps the hours around so the manager can be told why", () => {
    expect(bonusFrom({ cs2: 5, other: 1 }).hours).toEqual({ cs2: 5, other: 1 });
  });
});

describe("activityBonus", () => {
  it("reads a whole evening end to end", () => {
    const bonus = activityBonus(
      played([
        { game: CS2_GAME, minutes: 6 * 60 },
        { game: "Valheim", minutes: 4 * 60 },
      ]),
      START,
      NOW
    );

    expect(bonus.training).toBe(2);
    expect(bonus.transfer).toBe(1);
    expect(bonus.hours.cs2).toBeCloseTo(6, 5);
  });

  // Satisfactory, World of Tanks, vad som helst — allt utom CS2 räknas som
  // klantid.
  it("treats any other game as clan time", () => {
    const bonus = activityBonus(played([{ game: "Satisfactory", minutes: 4 * 60 }]), START, NOW);
    expect(bonus.transfer).toBe(1);
    expect(bonus.training).toBe(0);
  });
});
