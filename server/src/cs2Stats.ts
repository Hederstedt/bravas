export interface MemberStats {
  steamid64: string;
  personaName: string;
  stats: Record<string, number>;
}

export interface StatHighlight {
  gameId: string;
  gameTitle: string;
  label: string;
  value: string;
  holder: string;
  detail: string;
}

const GAME = { gameId: "cs2", gameTitle: "Counter-Strike 2" };

// A handful of kills says nothing about aim; below this a lucky headshot would
// top the table.
const MIN_KILLS_FOR_RATE = 500;

const WEAPON_NAMES: Record<string, string> = {
  ak47: "AK-47",
  m4a1: "M4A4",
  awp: "AWP",
  deagle: "Desert Eagle",
  glock: "Glock-18",
  hkp2000: "P2000",
  usp_silencer: "USP-S",
  p250: "P250",
  elite: "Dual Berettas",
  fiveseven: "Five-SeveN",
  tec9: "Tec-9",
  cz75a: "CZ75-Auto",
  revolver: "R8 Revolver",
  galilar: "Galil AR",
  famas: "FAMAS",
  aug: "AUG",
  sg556: "SG 553",
  ssg08: "SSG 08",
  scar20: "SCAR-20",
  g3sg1: "G3SG1",
  mac10: "MAC-10",
  mp9: "MP9",
  mp7: "MP7",
  ump45: "UMP-45",
  p90: "P90",
  bizon: "PP-Bizon",
  nova: "Nova",
  xm1014: "XM1014",
  mag7: "MAG-7",
  sawedoff: "Sawed-Off",
  m249: "M249",
  negev: "Negev",
  taser: "Zeus x27",
  knife: "Kniv",
  hegrenade: "HE-granat",
  molotov: "Molotov",
};

const MAP_NAMES: Record<string, string> = {
  de_dust2: "Dust II",
  de_inferno: "Inferno",
  de_nuke: "Nuke",
  de_train: "Train",
  de_vertigo: "Vertigo",
  de_cbble: "Cobblestone",
  de_mirage: "Mirage",
  de_overpass: "Overpass",
  de_ancient: "Ancient",
  de_anubis: "Anubis",
  de_aztec: "Aztec",
  de_lake: "Lake",
  de_safehouse: "Safehouse",
  de_bank: "Bank",
  de_house: "House",
  de_sugarcane: "Sugarcane",
  de_stmarc: "St. Marc",
  de_shorttrain: "Shortdust",
  de_dust: "Dust",
  cs_office: "Office",
  cs_italy: "Italy",
  cs_assault: "Assault",
  cs_militia: "Militia",
  ar_shoots: "Shoots",
  ar_baggage: "Baggage",
  ar_monastery: "Monastery",
};

const nf = new Intl.NumberFormat("sv-SE");

function formatInt(n: number): string {
  return nf.format(Math.round(n));
}

interface Leader {
  member: MemberStats;
  value: number;
}

function leaderBy(members: MemberStats[], score: (m: MemberStats) => number | null): Leader | null {
  let best: Leader | null = null;
  for (const member of members) {
    const value = score(member);
    if (value === null || !Number.isFinite(value) || value <= 0) continue;
    if (!best || value > best.value) best = { member, value };
  }
  return best;
}

function sumBySuffix(members: MemberStats[], prefix: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const m of members) {
    for (const [key, value] of Object.entries(m.stats)) {
      if (!key.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      if (!suffix) continue;
      totals.set(suffix, (totals.get(suffix) ?? 0) + value);
    }
  }
  return totals;
}

function topEntry(totals: Map<string, number>): { key: string; value: number } | null {
  let best: { key: string; value: number } | null = null;
  for (const [key, value] of totals) {
    if (value <= 0) continue;
    if (!best || value > best.value) best = { key, value };
  }
  return best;
}

// Turns the crew's raw CS:GO-era counters into the handful of records worth
// putting on the wall. Any highlight nobody qualifies for is left out rather
// than shown empty.
export function computeHighlights(members: MemberStats[]): StatHighlight[] {
  const highlights: StatHighlight[] = [];

  const kills = leaderBy(members, (m) => m.stats.total_kills ?? null);
  if (kills) {
    highlights.push({
      ...GAME,
      label: "Flest kills",
      value: formatInt(kills.value),
      holder: kills.member.personaName,
      detail: `${formatInt(kills.member.stats.total_deaths ?? 0)} dödsfall på vägen`,
    });
  }

  const wins = leaderBy(members, (m) => m.stats.total_wins ?? null);
  if (wins) {
    const rounds = wins.member.stats.total_rounds_played ?? 0;
    highlights.push({
      ...GAME,
      label: "Flest vunna matcher",
      value: formatInt(wins.value),
      holder: wins.member.personaName,
      detail: rounds > 0 ? `av ${formatInt(rounds)} spelade rundor` : "sedan CS:GO-tiden",
    });
  }

  const headshots = leaderBy(members, (m) => {
    const total = m.stats.total_kills ?? 0;
    const hs = m.stats.total_kills_headshot ?? 0;
    if (total < MIN_KILLS_FOR_RATE || hs <= 0) return null;
    return (hs / total) * 100;
  });
  if (headshots) {
    const hs = headshots.member.stats.total_kills_headshot ?? 0;
    highlights.push({
      ...GAME,
      label: "Bästa headshot-andel",
      value: `${headshots.value.toFixed(1).replace(".", ",")} %`,
      holder: headshots.member.personaName,
      detail: `${formatInt(hs)} skallar totalt`,
    });
  }

  const played = leaderBy(members, (m) => m.stats.total_time_played ?? null);
  if (played) {
    const hours = played.value / 3600;
    highlights.push({
      ...GAME,
      label: "Mest tid i CS2",
      value: `${formatInt(hours)} h`,
      holder: played.member.personaName,
      detail: `ungefär ${formatInt(hours / 24)} dygn framför skärmen`,
    });
  }

  const weapons = sumBySuffix(members, "total_kills_");
  weapons.delete("headshot");
  weapons.delete("enemy_weapon");
  weapons.delete("enemy_blinded");
  weapons.delete("against_zoomed_sniper");
  const weapon = topEntry(weapons);
  if (weapon) {
    highlights.push({
      ...GAME,
      label: "Klanens favoritvapen",
      value: WEAPON_NAMES[weapon.key] ?? weapon.key,
      holder: "Hela BVS",
      detail: `${formatInt(weapon.value)} kills tillsammans`,
    });
  }

  const map = topEntry(sumBySuffix(members, "total_wins_map_"));
  if (map) {
    highlights.push({
      ...GAME,
      label: "Klanens favoritkarta",
      value: MAP_NAMES[map.key] ?? map.key,
      holder: "Hela BVS",
      detail: `${formatInt(map.value)} vinster tillsammans`,
    });
  }

  return highlights;
}
