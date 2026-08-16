import type { StatHighlight } from "./cs2Stats.ts";

// Steams eget livstidsräkneverk (GetOwnedGames, playtime_forever) — till
// skillnad från gubbtimmar i valheimHistory.ts, som kommer ur vår egen
// serverpoller och aldrig vet vilka spelarna var. Det här är per gubbe.

export interface MemberPlaytime {
  steamid64: string;
  personaName: string;
  minutes: number;
}

const GAME = { gameId: "valheim", gameTitle: "Valheim" };

const nf = new Intl.NumberFormat("sv-SE");

function formatHours(minutes: number): string {
  return `${nf.format(Math.round(minutes / 60))} h`;
}

// Turns Steam's raw per-account minute counters into the one highlight worth
// putting on the wall. Nobody with zero minutes counts as a candidate — either
// they don't own the game or their profile is closed, and neither should look
// like "0 h" on the site.
export function computeValheimPlaytimeHighlight(members: MemberPlaytime[]): StatHighlight | null {
  const ranked = members
    .filter((m) => m.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || a.personaName.localeCompare(b.personaName, "sv"));

  const top = ranked[0];
  if (!top) return null;

  return {
    ...GAME,
    label: "Mest speltid i Valheim",
    value: formatHours(top.minutes),
    holder: top.personaName,
    detail: `ungefär ${nf.format(Math.round(top.minutes / 60 / 24))} dygn i Midgård`,
    standings: ranked.map((m) => ({ name: m.personaName, value: formatHours(m.minutes) })),
  };
}
