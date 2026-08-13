import { describe, expect, it } from "vitest";
import { buildCard, buildCards, scale, tierFor, type AttrKey } from "./cs2Cards.ts";
import type { MemberStats } from "./cs2Stats.ts";

function member(personaName: string, stats: Record<string, number>): MemberStats {
  return { steamid64: `7656119${personaName.length}000000000`, personaName, stats };
}

// Sitter exakt på ett ankare i varje attribut, så förväntade betyg går att läsa
// rakt ur tabellen istället för att räknas fram i huvudet:
//   SIK 96000/400000 = 0,24 → 80    SKA 3375/7500 = 0,45 → 80
//   FRA 7500/10000  = 0,75 → 78    TÅL 1 − 6500/10000 = 0,35 → 60
//   NYT (800+250+150)/10000 = 0,12 → 65    TID 3600000 s = 1000 h → 75
const SHARPSHOOTER = member("Skarpskytten", {
  total_rounds_played: 10000,
  total_shots_fired: 400000,
  total_shots_hit: 96000,
  total_kills: 7500,
  total_kills_headshot: 3375,
  total_deaths: 6500,
  total_mvps: 800,
  total_planted_bombs: 250,
  total_defused_bombs: 150,
  total_time_played: 3600000,
});

// Överlever mest av alla men fraggar sparsamt — TÅL ska bli hans toppattribut.
const LURKER = member("Smygaren", {
  total_rounds_played: 10000,
  total_shots_fired: 200000,
  total_shots_hit: 36000,
  total_kills: 5000,
  total_kills_headshot: 1500,
  total_deaths: 5000,
  total_mvps: 500,
  total_planted_bombs: 100,
  total_defused_bombs: 100,
  total_time_played: 1800000,
});

function rating(card: ReturnType<typeof buildCard>, key: AttrKey): number {
  const attr = card.attributes.find((a) => a.key === key);
  if (!attr) throw new Error(`card has no ${key} attribute`);
  return attr.rating;
}

describe("scale", () => {
  const anchors = [
    [0, 1],
    [10, 40],
    [20, 80],
  ] as const;

  it("returns the anchor rating when the value sits exactly on one", () => {
    expect(scale(0, anchors)).toBe(1);
    expect(scale(10, anchors)).toBe(40);
    expect(scale(20, anchors)).toBe(80);
  });

  it("interpolates linearly between two anchors", () => {
    expect(scale(5, anchors)).toBe(21); // halvvägs mellan 1 och 40 → 20,5 → 21
    expect(scale(15, anchors)).toBe(60);
  });

  it("clamps instead of extrapolating past the ends", () => {
    // Utan klampning skulle en outlier skjuta betyget förbi 99 eller under noll.
    expect(scale(-5, anchors)).toBe(1);
    expect(scale(1000, anchors)).toBe(80);
  });
});

describe("buildCard", () => {
  it("derives each attribute from the raw counters", () => {
    const card = buildCard(SHARPSHOOTER);

    expect(rating(card, "SIK")).toBe(80);
    expect(rating(card, "SKA")).toBe(80);
    expect(rating(card, "FRA")).toBe(78);
    expect(rating(card, "TÅL")).toBe(60);
    expect(rating(card, "NYT")).toBe(65);
    expect(rating(card, "TID")).toBe(75);
  });

  it("always exposes all six attributes in a stable order", () => {
    const card = buildCard(SHARPSHOOTER);
    expect(card.attributes.map((a) => a.key)).toEqual(["SIK", "SKA", "FRA", "TÅL", "NYT", "TID"]);
  });

  it("weights the attributes into an overall rating", () => {
    // 0,25·78 + 0,20·60 + 0,20·80 + 0,15·80 + 0,10·65 + 0,10·75 = 73,5
    expect(buildCard(SHARPSHOOTER).overall).toBe(74);
  });

  it("breaks a tie for top attribute on a fixed priority, not on object order", () => {
    // SIK och SKA ligger båda på 80 — SIK har företräde, så kortet blir en AWP:are.
    expect(buildCard(SHARPSHOOTER).position).toBe("AWP");
  });

  it("names the position after the standout attribute", () => {
    const card = buildCard(LURKER);
    expect(rating(card, "TÅL")).toBe(88);
    expect(card.position).toBe("SMYGARE");
  });

  it("always writes at least one comment", () => {
    expect(buildCard(SHARPSHOOTER).comments.length).toBeGreaterThan(0);
    expect(buildCard(LURKER).comments.length).toBeGreaterThan(0);
  });

  it("carries the member's identity onto the card", () => {
    const card = buildCard(SHARPSHOOTER);
    expect(card.steamid64).toBe(SHARPSHOOTER.steamid64);
    expect(card.personaName).toBe("Skarpskytten");
  });
});

describe("tierFor", () => {
  it("puts each threshold on the boundary value itself", () => {
    expect(tierFor(87)).toBe("ikon");
    expect(tierFor(86)).toBe("guld");
    expect(tierFor(75)).toBe("guld");
    expect(tierFor(74)).toBe("silver");
    expect(tierFor(60)).toBe("silver");
    expect(tierFor(59)).toBe("brons");
    expect(tierFor(1)).toBe("brons");
  });

  it("reads the tier off a real card's overall rating", () => {
    const card = buildCard(SHARPSHOOTER);
    expect(card.overall).toBe(74);
    expect(card.tier).toBe("silver");
  });

  it("grades a weak player as brons", () => {
    const card = buildCard(
      member("Nybörjaren", {
        total_rounds_played: 500,
        total_shots_fired: 20000,
        total_shots_hit: 2000,
        total_kills: 150,
        total_kills_headshot: 20,
        total_deaths: 400,
        total_mvps: 5,
        total_time_played: 180000,
      })
    );
    expect(card.overall).toBeLessThan(60);
    expect(card.tier).toBe("brons");
  });
});

describe("members without usable stats", () => {
  it("marks a profile with too few rounds as okänd rather than rating it", () => {
    // 40 rundor säger ingenting — ett betyg där vore påhittat.
    const card = buildCard(
      member("Nyinloggad", {
        total_rounds_played: 40,
        total_shots_fired: 900,
        total_shots_hit: 300,
        total_kills: 30,
      })
    );

    expect(card.hasStats).toBe(false);
    expect(card.tier).toBe("okänd");
    expect(card.overall).toBe(0);
    expect(card.attributes).toEqual([]);
  });

  it("treats a locked profile with no shots fired as okänd", () => {
    const card = buildCard(member("Hemlig", { total_rounds_played: 5000, total_shots_fired: 0 }));
    expect(card.hasStats).toBe(false);
  });

  it("still gives the okänd card a name, a position and a comment", () => {
    // Kortet ska renderas i raden som alla andra, inte bli ett hål.
    const card = buildCard(member("Hemlig", { total_rounds_played: 0 }));
    expect(card.personaName).toBe("Hemlig");
    expect(card.position).toBe("OKÄND");
    expect(card.comments.length).toBeGreaterThan(0);
  });
});

describe("buildCards", () => {
  it("returns nothing for an empty crew", () => {
    expect(buildCards([])).toEqual([]);
  });

  it("sorts the lineup by overall rating, best first", () => {
    const cards = buildCards([LURKER, SHARPSHOOTER]);
    expect(cards.map((c) => c.personaName)).toEqual(["Skarpskytten", "Smygaren"]);
  });

  it("puts members without stats last, whatever order they arrived in", () => {
    const secretive = member("Hemlig", { total_rounds_played: 0 });
    const cards = buildCards([secretive, LURKER]);
    expect(cards.map((c) => c.personaName)).toEqual(["Smygaren", "Hemlig"]);
  });

  it("orders equally rated members by name so the lineup never reshuffles itself", () => {
    const a = member("Anna", { total_rounds_played: 0 });
    const b = member("Bertil", { total_rounds_played: 0 });
    expect(buildCards([b, a]).map((c) => c.personaName)).toEqual(["Anna", "Bertil"]);
  });
});
