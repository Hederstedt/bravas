import type { DiscordSample, PresenceSample } from "./db.ts";
import { CAP_HOURS_PER_GAME, DISCORD_GAME, hoursPerGameWithDiscord, scoreFor } from "./bvsMonth.ts";
import { clampToWindow, spans } from "./sampleSpans.ts";

// Månadens utmärkelser: träskeden och de tre skämtutmärkelserna. Ren modul
// utan db-anrop, precis som bvsMonth.ts — kröningen i monthlyPoller.ts hämtar
// raderna och skickar in dem hit.
//
// Ordet "titel" används medvetet inte om något av det här. Titeln är rangen
// (bvsRank.ts, KAPTEN/GENERAL) och styrs bara av betyget; det här är
// utmärkelser och hör till månaden, inte till hur bra någon är.

export type AwardKey = "jumbo" | "sofflocket" | "enkelsparet" | "vindflojeln";

// Golvet för VINDFLÖJELN. Ett eller två byten är en vanlig kväll — det ska
// vara ett mönster, inte en slump, innan någon får bära det.
export const MIN_SWITCHES = 3;

export interface MonthMetrics {
  score: number;
  gameHours: number; // allt utom Discord
  discordHours: number;
  gameCount: number; // antal olika spel, Discord oräknat
  topGameHours: number;
  switches: number;
}

export interface AwardRow {
  award: AwardKey;
  steamid64: string;
  value: number;
}

export interface MemberMonth {
  steamid64: string;
  metrics: MonthMetrics;
}

// Byten *inom* en session. spans() släpper redan glapp över MAX_GAP_MS, men
// två spann kan ändå ligga i var sin session med ett kasserat glapp emellan —
// därför kravet att det ena slutar exakt där det andra börjar. Utan det hade
// "CS2 på måndagen, Valheim på lördagen" räknats som ett byte, och VINDFLÖJELN
// hade mätt att man spelar flera spel i stället för att man aldrig blir klar
// med något.
function countSwitches(samples: readonly PresenceSample[], from: number, to: number): number {
  const inWindow = spans(samples).filter((s) => clampToWindow(s, from, to) > 0);

  let switches = 0;
  for (let i = 0; i < inWindow.length - 1; i++) {
    const here = inWindow[i]!;
    const next = inWindow[i + 1]!;
    if (here.to !== next.from) continue; // olika sessioner
    if (here.row.game !== next.row.game) switches++;
  }
  return switches;
}

export function monthMetrics(
  presenceSamples: readonly PresenceSample[],
  discordSamples: readonly DiscordSample[],
  from: number,
  to: number
): MonthMetrics {
  const hours = hoursPerGameWithDiscord(presenceSamples, discordSamples, from, to);
  const discordHours = hours.get(DISCORD_GAME) ?? 0;

  let gameHours = 0;
  let gameCount = 0;
  let topGameHours = 0;
  for (const [game, h] of hours) {
    if (game === DISCORD_GAME) continue;
    gameHours += h;
    gameCount++;
    topGameHours = Math.max(topGameHours, h);
  }

  return {
    score: scoreFor(hours),
    gameHours,
    discordHours,
    gameCount,
    topGameHours,
    switches: countSwitches(presenceSamples, from, to),
  };
}

// Oavgjort bryts på lägst steamid64, samma regel som decideWinner i
// monthlyPoller.ts — godtycklig, men deterministisk, så samma månad alltid ger
// samma svar hur många gånger den än räknas om.
function pick(
  candidates: readonly MemberMonth[],
  better: (a: MonthMetrics, b: MonthMetrics) => boolean,
  value: (m: MonthMetrics) => number
): { steamid64: string; value: number } | null {
  let best: MemberMonth | null = null;
  for (const c of candidates) {
    if (
      !best ||
      better(c.metrics, best.metrics) ||
      (value(c.metrics) === value(best.metrics) && c.steamid64 < best.steamid64)
    ) {
      best = c;
    }
  }
  return best ? { steamid64: best.steamid64, value: value(best.metrics) } : null;
}

// Månadens vinnare och träskeden är uteslutna ur skämtutmärkelserna, och ingen
// bär mer än en. Fem utmärkelser på fem olika kort — hade en gubbe kunnat
// samla dem hade hans kort blivit en prislista och de andra blivit utan.
export function decideAwards(
  members: readonly MemberMonth[],
  winnerSteamid64: string | null
): AwardRow[] {
  const taken = new Set<string>(winnerSteamid64 ? [winnerSteamid64] : []);
  const rows: AwardRow[] = [];

  function award(award: AwardKey, hit: { steamid64: string; value: number } | null): void {
    if (!hit) return;
    taken.add(hit.steamid64);
    rows.push({ award, ...hit });
  }

  const free = () => members.filter((m) => !taken.has(m.steamid64));

  // Träskeden kräver poäng över noll. En stängd Steam-profil samplas aldrig
  // och en semestervecka ger också noll — utan kravet hade jumboplatsen pekat
  // ut den som har fel sekretessinställning i stället för den som sket i att
  // dyka upp. Man måste ha varit där för att kunna komma sist.
  award(
    "jumbo",
    pick(
      free().filter((m) => m.metrics.score > 0),
      (a, b) => a.score < b.score,
      (m) => m.score
    )
  );

  // Mer tid i Discorden än i spelen. Marginalen i stället för en kvot: ingen
  // division med noll för den som aldrig startade ett spel, och talet betyder
  // något i förklaringstexten ("6,2 h mer i Discorden än i spel").
  award(
    "sofflocket",
    pick(
      free().filter((m) => m.metrics.discordHours - m.metrics.gameHours > 0),
      (a, b) => a.discordHours - a.gameHours > b.discordHours - b.gameHours,
      (m) => m.discordHours - m.gameHours
    )
  );

  // Golvet är taket: har man inte ens grindat ett fullt tak i sitt enda spel
  // har man inte grindat, man har tittat in. Återanvänder CAP_HOURS_PER_GAME
  // i stället för ett eget tal, så utmärkelsen följer med om taket ändras.
  award(
    "enkelsparet",
    pick(
      free().filter((m) => m.metrics.gameCount === 1 && m.metrics.topGameHours >= CAP_HOURS_PER_GAME),
      (a, b) => a.topGameHours > b.topGameHours,
      (m) => m.topGameHours
    )
  );

  award(
    "vindflojeln",
    pick(
      free().filter((m) => m.metrics.switches >= MIN_SWITCHES),
      (a, b) => a.switches > b.switches,
      (m) => m.switches
    )
  );

  return rows;
}
