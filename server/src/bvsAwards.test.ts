import { describe, expect, it } from "vitest";
import { CAP_HOURS_PER_GAME } from "./bvsMonth.ts";
import { MIN_NIGHT_HOURS, MIN_SWITCHES, decideAwards, monthMetrics } from "./bvsAwards.ts";
import type { DiscordSample, PresenceSample } from "./db.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const START = new Date(2026, 7, 1, 19, 0, 0).getTime();
const NOW = START + 31 * 24 * HOUR;

const CS2 = "Counter-Strike 2";
const WOT = "World of Tanks";

// Samma pulsrad-form som bvsMonth.test.ts — en rad var femte minut, plus en
// avslutande rad så det sista steget får en varaktighet.
function played(steps: { game: string; minutes: number }[], from = START): PresenceSample[] {
  const rows: PresenceSample[] = [];
  let at = from;
  for (const step of steps) {
    for (let left = step.minutes; left > 0; left -= 5) {
      rows.push({ at, steamid64: "76561190000000001", game: step.game });
      at += 5 * MIN;
    }
  }
  rows.push({ at, steamid64: "76561190000000001", game: "Slut" });
  return rows;
}

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

function metricsFor(presence: PresenceSample[], discord: DiscordSample[] = []) {
  return monthMetrics(presence, discord, START, NOW);
}

describe("monthMetrics", () => {
  it("splits game hours from Discord hours", () => {
    const m = metricsFor(played([{ game: CS2, minutes: 120 }]), seenInDiscord(60));
    expect(m.gameHours).toBeCloseTo(2, 5);
    expect(m.discordHours).toBeCloseTo(1, 5);
  });

  // Discord är en påhittad spelrad i poängräkningen, men den är inte ett spel.
  // Räknades den med i gameCount hade var och en som suttit i Discorden
  // diskvalificerats från ENKELSPÅRET utan att ha spelat något nytt.
  it("does not count Discord as one of the games played", () => {
    const m = metricsFor(played([{ game: CS2, minutes: 120 }]), seenInDiscord(60));
    expect(m.gameCount).toBe(1);
  });

  it("counts each distinct game and the hours in the biggest one", () => {
    const m = metricsFor(
      played([
        { game: CS2, minutes: 60 },
        { game: WOT, minutes: 180 },
      ])
    );
    expect(m.gameCount).toBe(2);
    expect(m.topGameHours).toBeCloseTo(3, 5);
  });

  it("scores the month the same way the crowning does", () => {
    const m = metricsFor(played([{ game: CS2, minutes: 40 * 60 }]));
    expect(m.score).toBe(CAP_HOURS_PER_GAME);
  });

  describe("byten mellan spel", () => {
    it("counts a switch made inside one sitting", () => {
      const m = metricsFor(
        played([
          { game: CS2, minutes: 30 },
          { game: WOT, minutes: 30 },
          { game: CS2, minutes: 30 },
        ])
      );
      expect(m.switches).toBe(2);
    });

    // Det här är hela poängen med VINDFLÖJELN: den mäter någon som aldrig blir
    // klar med något, inte någon som spelade CS2 på måndagen och Valheim på
    // lördagen. Två sessioner är inte ett byte.
    it("does not count a different game in a later sitting as a switch", () => {
      const monday = played([{ game: CS2, minutes: 60 }], START);
      const saturday = played([{ game: WOT, minutes: 60 }], START + 5 * 24 * HOUR);
      expect(monthMetrics([...monday, ...saturday], [], START, NOW).switches).toBe(0);
    });

    it("counts nothing for someone who stayed in one game all month", () => {
      expect(metricsFor(played([{ game: CS2, minutes: 600 }])).switches).toBe(0);
    });
  });


  describe("nattimmar", () => {
    // Natten räknas 00-06 lokal tid. Kvällsspel räknas inte — då är halva
    // klanen igång, och utmärkelsen ska peka ut den som sitter uppe.
    it("counts nothing for an ordinary evening", () => {
      const kvall = new Date(2026, 7, 3, 20, 0, 0).getTime();
      expect(monthMetrics(played([{ game: CS2, minutes: 120 }], kvall), [], kvall, NOW).nightHours).toBe(0);
    });

    it("counts a session played in the small hours", () => {
      const natt = new Date(2026, 7, 3, 1, 0, 0).getTime();
      const m = monthMetrics(played([{ game: CS2, minutes: 120 }], natt), [], natt, NOW);
      expect(m.nightHours).toBeCloseTo(2, 1);
    });

    // Spannet som ligger över gränsen ska delas, inte räknas helt eller inte
    // alls: den som loggar ut 00:30 har varit uppe en halvtimme, inte noll.
    it("splits a session that crosses into the night", () => {
      const kvall = new Date(2026, 7, 3, 23, 0, 0).getTime();
      const m = monthMetrics(played([{ game: CS2, minutes: 120 }], kvall), [], kvall, NOW);
      expect(m.nightHours).toBeCloseTo(1, 1);
      expect(m.gameHours).toBeCloseTo(2, 1);
    });

    it("splits a session that runs out the other end of the night", () => {
      const gryning = new Date(2026, 7, 3, 5, 0, 0).getTime();
      const m = monthMetrics(played([{ game: CS2, minutes: 120 }], gryning), [], gryning, NOW);
      expect(m.nightHours).toBeCloseTo(1, 1);
    });
  });

  it("reports an empty month as all zeroes", () => {
    const m = monthMetrics([], [], START, NOW);
    expect(m).toMatchObject({ score: 0, gameHours: 0, discordHours: 0, gameCount: 0, switches: 0, nightHours: 0 });
  });
});

// Fixturen nedan går förbi monthMetrics och sätter siffrorna direkt — reglerna
// och uträkningen är två olika saker, och det är reglerna som testas här.
function member(steamid64: string, over: Partial<ReturnType<typeof monthMetrics>> = {}) {
  return {
    steamid64,
    metrics: {
      score: 0,
      gameHours: 0,
      discordHours: 0,
      gameCount: 0,
      topGameHours: 0,
      switches: 0,
      nightHours: 0,
      ...over,
    },
  };
}

const A = "76561190000000001";
const B = "76561190000000002";
const C = "76561190000000003";
const D = "76561190000000004";
const E = "76561190000000005";

function awardFor(rows: ReturnType<typeof decideAwards>, award: string) {
  return rows.find((r) => r.award === award) ?? null;
}

describe("decideAwards — träskeden", () => {
  it("goes to the lowest score among those who actually showed up", () => {
    const rows = decideAwards(
      [member(A, { score: 20 }), member(B, { score: 3 }), member(C, { score: 11 })],
      A
    );
    expect(awardFor(rows, "jumbo")).toMatchObject({ steamid64: B, value: 3 });
  });

  // Den viktigaste regeln i hela funktionen. En stängd Steam-profil samplas
  // aldrig, och en semestervecka ger också noll — hade jumboplatsen gått på
  // lägst poäng rakt av hade den pekat ut den som har fel sekretessinställning
  // i stället för den som faktiskt sket i att dyka upp.
  it("never goes to someone who scored nothing at all", () => {
    const rows = decideAwards([member(A, { score: 20 }), member(B, { score: 0 })], A);
    expect(awardFor(rows, "jumbo")).toBeNull();
  });

  it("skips the zeroes and picks the lowest of the rest", () => {
    const rows = decideAwards(
      [member(A, { score: 20 }), member(B, { score: 0 }), member(C, { score: 4 })],
      A
    );
    expect(awardFor(rows, "jumbo")?.steamid64).toBe(C);
  });

  // Vinnaren kan inte också komma sist. Med bara en aktiv gubbe blir det
  // därför ingen träsked alls, vilket är rätt: det finns ingen att komma sist
  // efter.
  it("is not handed to the month's winner", () => {
    const rows = decideAwards([member(A, { score: 20 })], A);
    expect(awardFor(rows, "jumbo")).toBeNull();
  });

  it("breaks a tie on the lowest steamid64, like the crowning does", () => {
    const rows = decideAwards(
      [member(A, { score: 20 }), member(C, { score: 5 }), member(B, { score: 5 })],
      A
    );
    expect(awardFor(rows, "jumbo")?.steamid64).toBe(B);
  });
});

// Skämtutmärkelserna delas ut efter att vinnaren och träskeden är avgjorda.
// Varje fixtur nedan behöver därför både en vinnare och någon som soppar upp
// jumboplatsen — annars fastnar den som testet handlar om i träskeden och
// provet passerar av fel anledning.
const WINNER = member(A, { score: 50 });
const SPOON = member(E, { score: 1 });

describe("decideAwards — sofflocket", () => {
  it("goes to whoever spent the most time in Discord over and above playing", () => {
    const rows = decideAwards(
      [
        WINNER,
        SPOON,
        member(B, { score: 8, discordHours: 9, gameHours: 1 }),
        member(C, { score: 8, discordHours: 12, gameHours: 1 }),
      ],
      A
    );
    expect(awardFor(rows, "sofflocket")?.steamid64).toBe(C);
  });

  // Marginalen måste vara positiv. Den som lirar mer än han hänger har inte
  // gjort sig förtjänt av soffan, hur många Discord-timmar han än har.
  it("goes to nobody when everyone played more than they hung around", () => {
    const rows = decideAwards(
      [WINNER, SPOON, member(B, { score: 8, discordHours: 3, gameHours: 20 })],
      A
    );
    expect(awardFor(rows, "sofflocket")).toBeNull();
  });

  it("records the margin, not the raw Discord hours", () => {
    const rows = decideAwards(
      [WINNER, SPOON, member(B, { score: 8, discordHours: 9, gameHours: 2 })],
      A
    );
    expect(awardFor(rows, "sofflocket")?.value).toBeCloseTo(7, 5);
  });
});

describe("decideAwards — enkelspåret", () => {
  it("goes to whoever spent the whole month in one single game", () => {
    const rows = decideAwards(
      [WINNER, SPOON, member(B, { score: 10, gameCount: 1, topGameHours: 30, gameHours: 30 })],
      A
    );
    expect(awardFor(rows, "enkelsparet")?.steamid64).toBe(B);
  });

  it("passes over someone who played two", () => {
    const rows = decideAwards(
      [WINNER, SPOON, member(B, { score: 10, gameCount: 2, topGameHours: 30, gameHours: 40 })],
      A
    );
    expect(awardFor(rows, "enkelsparet")).toBeNull();
  });

  // Golvet är taket: har man inte ens grindat ett fullt tak i sitt enda spel
  // har man inte grindat, man har bara tittat in.
  it("passes over someone who did not even reach one full cap", () => {
    const rows = decideAwards(
      [
        WINNER,
        SPOON,
        member(B, {
          score: 9,
          gameCount: 1,
          topGameHours: CAP_HOURS_PER_GAME - 1,
          gameHours: CAP_HOURS_PER_GAME - 1,
        }),
      ],
      A
    );
    expect(awardFor(rows, "enkelsparet")).toBeNull();
  });
});

describe("decideAwards — vindflöjeln", () => {
  it("goes to whoever switched games the most", () => {
    const rows = decideAwards(
      [WINNER, SPOON, member(B, { score: 10, switches: 12 }), member(C, { score: 10, switches: 30 })],
      A
    );
    expect(awardFor(rows, "vindflojeln")?.steamid64).toBe(C);
  });

  it("goes to nobody when the most restless barely moved", () => {
    const rows = decideAwards(
      [WINNER, SPOON, member(B, { score: 10, switches: MIN_SWITCHES - 1 })],
      A
    );
    expect(awardFor(rows, "vindflojeln")).toBeNull();
  });
});

describe("decideAwards — nattvakten", () => {
  it("goes to whoever logged the most hours in the small hours", () => {
    const rows = decideAwards(
      [WINNER, SPOON, member(B, { score: 10, nightHours: 4 }), member(C, { score: 10, nightHours: 20 })],
      A
    );
    expect(awardFor(rows, "nattvakten")?.steamid64).toBe(C);
  });

  // En enda sen kväll är inte ett mönster. Utmärkelsen ska peka ut den som
  // gör det till en vana, inte den som råkade bli sittande en gång.
  it("goes to nobody when the latest owl barely stayed up", () => {
    const rows = decideAwards(
      [WINNER, SPOON, member(B, { score: 10, nightHours: MIN_NIGHT_HOURS - 0.5 })],
      A
    );
    expect(awardFor(rows, "nattvakten")).toBeNull();
  });

  it("records the hours it was won with", () => {
    const rows = decideAwards([WINNER, SPOON, member(B, { score: 10, nightHours: 12.5 })], A);
    expect(awardFor(rows, "nattvakten")?.value).toBeCloseTo(12.5, 5);
  });
});

describe("decideAwards — fördelningen", () => {
  // Fem utmärkelser på fem olika kort. Hade en gubbe kunnat bära två band hade
  // kortet blivit en prislista, och de andra hade blivit utan.
  it("never hands the same person two awards", () => {
    const greedy = { score: 4, discordHours: 20, gameHours: 1, gameCount: 1, topGameHours: 40, switches: 40, nightHours: 40 };
    const rows = decideAwards(
      [
        member(A, { score: 50 }),
        member(B, greedy),
        member(C, { ...greedy, score: 9 }),
        member(D, { ...greedy, score: 10 }),
        member(E, { ...greedy, score: 11 }),
      ],
      A
    );
    const winners = rows.map((r) => r.steamid64);
    expect(new Set(winners).size).toBe(winners.length);
    expect(winners).not.toContain(A);
  });

  it("hands out nothing at all for a month nobody played", () => {
    expect(decideAwards([member(A), member(B)], null)).toEqual([]);
  });

  it("hands out nothing for a clan with no members", () => {
    expect(decideAwards([], null)).toEqual([]);
  });
});
