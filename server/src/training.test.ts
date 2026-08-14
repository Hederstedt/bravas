import { describe, expect, it } from "vitest";
import { SESSIONS_PER_MATCHDAY, TRAINING_CAP, trainingGain, validateTraining } from "./training.ts";
import { playerValue } from "./season.ts";
import type { PlayerRatings } from "./matchSim.ts";

describe("trainingGain", () => {
  it("shrinks monotonically as the rating climbs", () => {
    let previous = Infinity;
    for (let rating = 35; rating < TRAINING_CAP; rating++) {
      const gain = trainingGain(rating);
      expect(gain).toBeLessThanOrEqual(previous);
      previous = gain;
    }
  });

  it("is always a whole point between 1 and 6 below the cap", () => {
    for (let rating = 0; rating < TRAINING_CAP; rating++) {
      const gain = trainingGain(rating);
      expect(Number.isInteger(gain)).toBe(true);
      expect(gain).toBeGreaterThanOrEqual(1);
      expect(gain).toBeLessThanOrEqual(6);
    }
  });

  it("gives the project player a real boost and the star a nudge", () => {
    expect(trainingGain(40)).toBe(6);
    expect(trainingGain(82)).toBe(1);
  });

  // Kurvan kan aldrig hoppa över taket: betyget efter ett pass stannar på 90.
  it("never trains past the cap", () => {
    for (let rating = 35; rating < TRAINING_CAP; rating++) {
      expect(rating + trainingGain(rating)).toBeLessThanOrEqual(TRAINING_CAP);
    }
  });
});

describe("validateTraining", () => {
  it("approves a trainable rating with its gain", () => {
    expect(validateTraining({ playerName: "Bärarn", rating: 60 })).toEqual({
      ok: true,
      gain: trainingGain(60),
    });
  });

  it("refuses a player at or above the cap", () => {
    const result = validateTraining({ playerName: "Stjärnan", rating: TRAINING_CAP });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("färdigtränad") });
  });

  it("refuses an attribute the player does not have", () => {
    const result = validateTraining({ playerName: "Bärarn", rating: undefined });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("attribut") });
  });
});

describe("training economics", () => {
  // Tränade spelare blir dyrare — värdet räknas om med samma kubiska kurva.
  it("raises the player's value", () => {
    const before: PlayerRatings = { SIK: 60, SKA: 60, FRA: 60, TÅL: 60, NYT: 60, TID: 60 };
    const after: PlayerRatings = { ...before, SIK: 60 + trainingGain(60) };
    expect(playerValue(after)).toBeGreaterThan(playerValue(before));
  });

  it("keeps the quota at two per matchday", () => {
    // Konstanten är en spelregel — ändras den ska någon ha menat det.
    expect(SESSIONS_PER_MATCHDAY).toBe(2);
  });
});
