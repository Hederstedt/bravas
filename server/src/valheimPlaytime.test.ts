import { describe, expect, it } from "vitest";
import { computeValheimPlaytimeHighlight, type MemberPlaytime } from "./valheimPlaytime.ts";

function member(personaName: string, minutes: number): MemberPlaytime {
  return { steamid64: personaName, personaName, minutes };
}

describe("computeValheimPlaytimeHighlight", () => {
  it("returns null when nobody has any playtime yet", () => {
    expect(computeValheimPlaytimeHighlight([])).toBeNull();
    expect(computeValheimPlaytimeHighlight([member("Gubbe #1", 0)])).toBeNull();
  });

  it("crowns the member with the most minutes", () => {
    const highlight = computeValheimPlaytimeHighlight([
      member("Gubbe #1", 120),
      member("Gubbe #2", 600),
      member("Gubbe #3", 60),
    ]);

    expect(highlight).toMatchObject({
      gameId: "valheim",
      gameTitle: "Valheim",
      label: "Mest speltid i Valheim",
      value: "10 h",
      holder: "Gubbe #2",
    });
  });

  it("lists everyone with playtime, leader first, ties broken on name", () => {
    const highlight = computeValheimPlaytimeHighlight([
      member("Calle", 300),
      member("Beda", 300),
      member("Alfa", 600),
    ]);

    expect(highlight?.standings).toEqual([
      { name: "Alfa", value: "10 h" },
      { name: "Beda", value: "5 h" },
      { name: "Calle", value: "5 h" },
    ]);
  });

  it("leaves out members with zero recorded minutes rather than showing a zero", () => {
    const highlight = computeValheimPlaytimeHighlight([member("Gubbe #1", 600), member("Gubbe #2", 0)]);

    expect(highlight?.standings).toEqual([{ name: "Gubbe #1", value: "10 h" }]);
  });

  it("rounds down to whole hours", () => {
    const highlight = computeValheimPlaytimeHighlight([member("Gubbe #1", 149)]);
    expect(highlight?.value).toBe("2 h");
  });
});
