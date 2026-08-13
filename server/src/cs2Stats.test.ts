import { describe, expect, it } from "vitest";
import { computeHighlights, type MemberStats } from "./cs2Stats.ts";

// Svensk sifferformatering grupperar med hårt mellanslag (U+00A0) så att talet
// inte bryts över radslut. Skrivs ut explicit här — annars ser förväntan ut som
// ett vanligt mellanslag och felmeddelandet blir omöjligt att tyda.
const NBSP = " ";

function member(personaName: string, stats: Record<string, number>): MemberStats {
  return { steamid64: personaName, personaName, stats };
}

const CREW: MemberStats[] = [
  member("⛟", {
    total_kills: 87021,
    total_wins: 41076,
    total_time_played: 5986872,
    total_kills_headshot: 38172,
    total_kills_ak47: 20465,
    total_kills_awp: 5000,
    total_wins_map_de_inferno: 12848,
    total_wins_map_de_dust2: 12308,
  }),
  member("#Mag", {
    total_kills: 47821,
    total_wins: 21379,
    total_time_played: 3410035,
    total_kills_headshot: 18915,
    total_kills_ak47: 9482,
    total_kills_awp: 9000,
    total_wins_map_de_dust2: 4200,
    total_wins_map_de_inferno: 4518,
  }),
];

function find(highlights: ReturnType<typeof computeHighlights>, label: string) {
  const h = highlights.find((x) => x.label === label);
  if (!h) throw new Error(`no highlight labelled ${label}`);
  return h;
}

describe("computeHighlights", () => {
  it("returns nothing when no one has stats", () => {
    expect(computeHighlights([])).toEqual([]);
  });

  it("credits the member with the most kills", () => {
    const h = find(computeHighlights(CREW), "Flest kills");
    expect(h.holder).toBe("⛟");
    expect(h.value).toBe(`87${NBSP}021`);
  });

  it("credits the member with the most wins", () => {
    const h = find(computeHighlights(CREW), "Flest vunna matcher");
    expect(h.holder).toBe("⛟");
    expect(h.value).toBe(`41${NBSP}076`);
  });

  it("reports headshot accuracy as a percentage of that member's own kills", () => {
    // #Mag: 18915/47821 = 39.6%, ⛟: 38172/87021 = 43.9% — the rate wins, not the count.
    const h = find(computeHighlights(CREW), "Bästa headshot-andel");
    expect(h.holder).toBe("⛟");
    expect(h.value).toBe("43,9 %");
  });

  it("converts CS2 playtime from seconds to whole hours", () => {
    const h = find(computeHighlights(CREW), "Mest tid i CS2");
    expect(h.holder).toBe("⛟");
    expect(h.value).toBe(`1${NBSP}663 h`);
  });

  it("picks the clan's favourite weapon by summed kills, not one member's", () => {
    // AK: 20465+9482 = 29947 beats AWP: 5000+9000 = 14000.
    const h = find(computeHighlights(CREW), "Klanens favoritvapen");
    expect(h.value).toBe("AK-47");
    expect(h.detail).toContain(`29${NBSP}947`);
  });

  it("picks the clan's favourite map by summed wins and uses its display name", () => {
    // Inferno: 12848+4518 = 17366 beats Dust II: 12308+4200 = 16508.
    const h = find(computeHighlights(CREW), "Klanens favoritkarta");
    expect(h.value).toBe("Inferno");
  });

  it("ignores members whose stats are missing the metric", () => {
    const withGap = [...CREW, member("Nykomling", { total_kills: 0 })];
    const h = find(computeHighlights(withGap), "Mest tid i CS2");
    expect(h.holder).toBe("⛟");
  });

  it("skips a highlight entirely when nobody has that metric", () => {
    const noMaps = [member("Ensam", { total_kills: 10 })];
    const labels = computeHighlights(noMaps).map((h) => h.label);
    expect(labels).toContain("Flest kills");
    expect(labels).not.toContain("Klanens favoritkarta");
  });

  it("requires a meaningful sample before crowning a headshot rate", () => {
    // One lucky headshot out of two kills is not a 50% marksman.
    const flukes = [member("Tur", { total_kills: 2, total_kills_headshot: 1 })];
    expect(computeHighlights(flukes).map((h) => h.label)).not.toContain("Bästa headshot-andel");
  });
});

describe("standings behind each record", () => {
  it("ranks every member who qualifies, leader first", () => {
    const h = find(computeHighlights(CREW), "Flest kills");
    expect(h.standings).toEqual([
      { name: "⛟", value: `87${NBSP}021` },
      { name: "#Mag", value: `47${NBSP}821` },
    ]);
  });

  it("formats the standings the same way as the headline value", () => {
    const h = find(computeHighlights(CREW), "Bästa headshot-andel");
    expect(h.standings[0]).toEqual({ name: "⛟", value: "43,9 %" });
    expect(h.standings[1]!.value).toMatch(/^\d+,\d %$/);
  });

  it("leaves out members the record does not apply to", () => {
    // Ingen speltid alls betyder ingen placering, inte en nolla i listan.
    const withGap = [...CREW, member("Nykomling", { total_kills: 5 })];
    const h = find(computeHighlights(withGap), "Mest tid i CS2");
    expect(h.standings.map((s) => s.name)).toEqual(["⛟", "#Mag"]);
  });

  it("ranks the weapons behind the clan favourite", () => {
    const h = find(computeHighlights(CREW), "Klanens favoritvapen");
    expect(h.standings[0]).toEqual({ name: "AK-47", value: `29${NBSP}947 kills` });
    expect(h.standings[1]).toEqual({ name: "AWP", value: `14${NBSP}000 kills` });
  });

  it("counts map standings in wins, not kills", () => {
    const h = find(computeHighlights(CREW), "Klanens favoritkarta");
    expect(h.standings[0]!.name).toBe("Inferno");
    expect(h.standings[0]!.value).toContain("vinster");
  });

  it("always has the headline holder at the top of its own standings", () => {
    for (const h of computeHighlights(CREW)) {
      expect(h.standings.length).toBeGreaterThan(0);
      if (h.holder !== "Hela BVS") expect(h.standings[0]!.name).toBe(h.holder);
    }
  });
});
