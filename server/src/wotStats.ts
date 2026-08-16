import type { StatHighlight } from "./cs2Stats.ts";

export interface WotMemberStats {
  wotAccountId: string;
  personaName: string;
  stats: Record<string, number>;
}

const GAME = { gameId: "wot", gameTitle: "World of Tanks" };

// Under den här nivån säger vinstprocenten inget om skicklighet — ett par
// turstrider skulle toppa listan.
const MIN_BATTLES_FOR_RATE = 100;

const nf = new Intl.NumberFormat("sv-SE");

function formatInt(n: number): string {
  return nf.format(Math.round(n));
}

interface Leader {
  member: WotMemberStats;
  value: number;
}

// Alla som kvalar in, bäst först. Lika värden avgörs på namn så listan står
// still mellan anrop i stället för att kastas om av sorteringen.
function rank(members: WotMemberStats[], score: (m: WotMemberStats) => number | null): Leader[] {
  return members
    .map((member) => ({ member, value: score(member) }))
    .filter((x): x is Leader => x.value !== null && Number.isFinite(x.value) && x.value > 0)
    .sort((a, b) => b.value - a.value || a.member.personaName.localeCompare(b.member.personaName, "sv"));
}

function standingsFrom(ranked: Leader[], format: (value: number) => string): { name: string; value: string }[] {
  return ranked.map((r) => ({ name: r.member.personaName, value: format(r.value) }));
}

// Turns the crew's raw account-level WoT counters into the handful of records
// worth putting on the wall. Any highlight nobody qualifies for is left out
// rather than shown empty — same rule as the CS2 highlights.
export function computeWotHighlights(members: WotMemberStats[]): StatHighlight[] {
  const highlights: StatHighlight[] = [];

  const battleRanking = rank(members, (m) => m.stats.battles ?? null);
  const battles = battleRanking[0];
  if (battles) {
    const wins = battles.member.stats.wins ?? 0;
    highlights.push({
      ...GAME,
      label: "Flest strider",
      value: formatInt(battles.value),
      holder: battles.member.personaName,
      detail: `${formatInt(wins)} segrar på vägen`,
      standings: standingsFrom(battleRanking, formatInt),
    });
  }

  const rateRanking = rank(members, (m) => {
    const b = m.stats.battles ?? 0;
    const w = m.stats.wins ?? 0;
    if (b < MIN_BATTLES_FOR_RATE) return null;
    return (w / b) * 100;
  });
  const rate = rateRanking[0];
  if (rate) {
    const fmt = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;
    highlights.push({
      ...GAME,
      label: "Bästa vinstprocent",
      value: fmt(rate.value),
      holder: rate.member.personaName,
      detail: `${formatInt(rate.member.stats.battles ?? 0)} strider spelade`,
      standings: standingsFrom(rateRanking, fmt),
    });
  }

  const damageRanking = rank(members, (m) => m.stats.damage_dealt ?? null);
  const damage = damageRanking[0];
  if (damage) {
    const battlesPlayed = damage.member.stats.battles ?? 0;
    const perBattle = battlesPlayed > 0 ? damage.value / battlesPlayed : 0;
    highlights.push({
      ...GAME,
      label: "Mest skada tillfogad",
      value: formatInt(damage.value),
      holder: damage.member.personaName,
      detail: `snitt ${formatInt(perBattle)} per strid`,
      standings: standingsFrom(damageRanking, formatInt),
    });
  }

  return highlights;
}
