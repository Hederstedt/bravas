import { describe, expect, it } from "vitest";
import { MAX_GAP_MS, toIntervals, valheimHighlights } from "./valheimHistory.ts";
import type { ValheimSample } from "./db.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;

// En måndag 20:00 lokal tid, så veckodags- och timrubriker går att resonera om.
const START = new Date(2026, 7, 10, 20, 0, 0).getTime();

function samples(steps: { after: number; online?: boolean; players: number }[]): ValheimSample[] {
  return steps.map((s) => ({
    at: START + s.after,
    online: (s.online ?? true) ? 1 : 0,
    players: s.players,
  }));
}

// Pollern skriver en rad var femte minut. Testdata måste se likadan ut, annars
// ser toIntervals varje steg som ett glapp och hoppar över det — vilket är
// precis vad den ska göra med riktiga glapp, men gör fixturen meningslös.
function timeline(steps: { players: number; online?: boolean; minutes: number }[]): ValheimSample[] {
  const rows: ValheimSample[] = [];
  let at = START;
  for (const step of steps) {
    for (let left = step.minutes; left > 0; left -= 5) {
      rows.push({ at, online: (step.online ?? true) ? 1 : 0, players: step.players });
      at += 5 * MIN;
    }
  }
  // Avslutande rad så att sista steget får en varaktighet. Dess egna värden
  // används aldrig — den startar inget intervall.
  rows.push({ at, online: 0, players: 0 });
  return rows;
}

function find(highlights: ReturnType<typeof valheimHighlights>, label: string) {
  return highlights.find((h) => h.label === label);
}

describe("toIntervals", () => {
  it("makes each reading last until the next one", () => {
    const intervals = toIntervals(samples([{ after: 0, players: 2 }, { after: 5 * MIN, players: 4 }]));

    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toMatchObject({ players: 2, online: true, to: START + 5 * MIN });
  });

  // Ett glapp betyder att API:et var nere. Vi vet inte vad som hände då, och
  // gissar därför ingenting — utan den regeln hade en veckas driftstopp
  // bokförts som en vecka i det läge servern råkade ha när strömmen gick.
  it("skips over a gap instead of guessing what happened in it", () => {
    const intervals = toIntervals(
      samples([
        { after: 0, players: 3 },
        { after: MAX_GAP_MS + HOUR, players: 3 },
        { after: MAX_GAP_MS + HOUR + 5 * MIN, players: 3 },
      ])
    );

    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.from).toBe(START + MAX_GAP_MS + HOUR);
  });

  it("has nothing to say about a single reading", () => {
    expect(toIntervals(samples([{ after: 0, players: 5 }]))).toEqual([]);
  });

  it("ignores readings that go backwards in time", () => {
    const rows: ValheimSample[] = [
      { at: START, online: 1, players: 2 },
      { at: START, online: 1, players: 3 },
    ];
    expect(toIntervals(rows)).toEqual([]);
  });
});

describe("valheimHighlights", () => {
  it("says nothing at all before there is anything measured", () => {
    expect(valheimHighlights([])).toEqual([]);
    expect(valheimHighlights(samples([{ after: 0, players: 1 }]))).toEqual([]);
  });

  describe("flest inne samtidigt", () => {
    it("finds the peak and when it happened", () => {
      const record = find(
        valheimHighlights(
          samples([
            { after: 0, players: 2 },
            { after: 5 * MIN, players: 7 },
            { after: 10 * MIN, players: 3 },
            { after: 15 * MIN, players: 0 },
          ])
        ),
        "Flest inne samtidigt"
      );

      expect(record?.value).toBe("7");
      expect(record?.detail).toContain("måndag");
    });

    // Rekordet tillhör den som var först.
    it("keeps the older evening when two nights tie", () => {
      const record = find(
        valheimHighlights(
          samples([
            { after: 0, players: 5 },
            { after: 5 * MIN, players: 1 },
            { after: 24 * HOUR, players: 5 },
            { after: 24 * HOUR + 5 * MIN, players: 1 },
          ])
        ),
        "Flest inne samtidigt"
      );

      expect(record?.holder).toBe("10 augusti");
    });

    it("lists the best evenings, one row per day", () => {
      const record = find(
        valheimHighlights(
          samples([
            { after: 0, players: 6 },
            { after: 5 * MIN, players: 2 },
            { after: 10 * MIN, players: 6 },
            { after: 24 * HOUR, players: 3 },
            { after: 24 * HOUR + 5 * MIN, players: 1 },
          ])
        ),
        "Flest inne samtidigt"
      );

      // Två dygn, inte fem intervall.
      expect(record?.standings).toHaveLength(2);
      expect(record?.standings[0]).toEqual({ name: "10 augusti", value: "6 inne" });
    });
  });

  describe("längsta uptime", () => {
    it("measures an unbroken stretch", () => {
      const record = find(
        valheimHighlights(
          samples([
            { after: 0, players: 1 },
            { after: 5 * MIN, players: 1 },
            { after: 10 * MIN, players: 1 },
          ])
        ),
        "Längsta uptime"
      );

      expect(record?.value).toBe("10 min");
    });

    it("starts over when the server goes down", () => {
      const record = find(
        valheimHighlights(
          timeline([
            { players: 1, minutes: 30 },
            { players: 0, online: false, minutes: 10 },
            { players: 1, minutes: 180 },
          ])
        ),
        "Längsta uptime"
      );

      // Sviten efter nedgången är den långa, inte halvtimmen före.
      expect(record?.value).toBe("3 h");
    });

    // Ett glapp i mätningen bryter sviten lika säkert som en nedgång — vi vet
    // inte om servern stod uppe under tiden.
    it("does not stitch a run across a measurement gap", () => {
      const record = find(
        valheimHighlights(
          samples([
            { after: 0, players: 1 },
            { after: 10 * MIN, players: 1 },
            { after: 10 * MIN + MAX_GAP_MS + HOUR, players: 1 },
            { after: 10 * MIN + MAX_GAP_MS + HOUR + 5 * MIN, players: 1 },
          ])
        ),
        "Längsta uptime"
      );

      expect(record?.value).toBe("10 min");
    });

    it("has no record when the server was never up", () => {
      const highlights = valheimHighlights(
        samples([
          { after: 0, online: false, players: 0 },
          { after: 5 * MIN, online: false, players: 0 },
        ])
      );
      expect(find(highlights, "Längsta uptime")).toBeUndefined();
    });
  });

  describe("gubbtimmar", () => {
    it("adds up players times time", () => {
      const record = find(
        valheimHighlights(
          timeline([
            { players: 4, minutes: 60 },
            { players: 2, minutes: 60 },
          ])
        ),
        "Gubbtimmar i Valheim"
      );

      // Fyra gubbar i en timme plus två i nästa: sex gubbtimmar.
      expect(record?.value).toBe("6 h");
    });

    it("says nothing when nobody has been inside", () => {
      const highlights = valheimHighlights(
        samples([
          { after: 0, players: 0 },
          { after: 5 * MIN, players: 0 },
        ])
      );
      expect(find(highlights, "Gubbtimmar i Valheim")).toBeUndefined();
    });
  });

  describe("primetime", () => {
    it("points out the busiest hour of the week", () => {
      const record = find(
        valheimHighlights(
          samples([
            { after: 0, players: 1 },
            { after: 5 * MIN, players: 1 },
            // Nästa kväll, betydligt fler.
            { after: 24 * HOUR, players: 6 },
            { after: 24 * HOUR + 5 * MIN, players: 6 },
            { after: 24 * HOUR + 10 * MIN, players: 0 },
          ])
        ),
        "Primetime"
      );

      expect(record?.value).toBe("tisdag 20–21");
    });

    it("ignores the hours when nobody was inside", () => {
      const highlights = valheimHighlights(
        samples([
          { after: 0, players: 0 },
          { after: 5 * MIN, players: 0 },
          { after: 10 * MIN, players: 0 },
        ])
      );
      expect(find(highlights, "Primetime")).toBeUndefined();
    });
  });

  it("tags every record as Valheim so the section can group them", () => {
    const highlights = valheimHighlights(
      samples([
        { after: 0, players: 3 },
        { after: 5 * MIN, players: 3 },
      ])
    );

    expect(highlights.length).toBeGreaterThan(0);
    for (const h of highlights) {
      expect(h.gameId).toBe("valheim");
      expect(h.gameTitle).toBe("Valheim");
    }
  });
});
