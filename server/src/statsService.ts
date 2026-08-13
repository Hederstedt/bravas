import { config } from "./config.ts";
import { listMembers, readCs2Stats, saveCs2Stats } from "./db.ts";
import { computeHighlights, type MemberStats, type StatHighlight } from "./cs2Stats.ts";
import { buildCards, type PlayerCard } from "./cs2Cards.ts";

const CS2_APP_ID = 730;
const TTL_MS = 30 * 60 * 1000;

export interface HighlightsResult {
  highlights: StatHighlight[];
  memberCount: number;
  withStats: number;
}

export interface CardsResult {
  cards: PlayerCard[];
  memberCount: number;
  withStats: number;
}

async function fetchMemberStats(steamid64: string): Promise<Record<string, number> | null> {
  const url = new URL("https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/");
  url.searchParams.set("key", config.steamApiKey);
  url.searchParams.set("steamid", steamid64);
  url.searchParams.set("appid", String(CS2_APP_ID));

  // 400/403 here is the normal answer for a closed profile, not an outage.
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    playerstats?: { stats?: { name: string; value: number }[] };
  };
  const stats = data.playerstats?.stats;
  if (!stats?.length) return null;

  return Object.fromEntries(stats.map((s) => [s.name, s.value]));
}

// One in-flight refresh at a time: without this every request that arrives
// while Steam is answering would start its own round of calls.
let refreshing: Promise<void> | null = null;

async function refreshStale(steamids: string[]): Promise<void> {
  const cached = new Map(readCs2Stats().map((c) => [c.steamid64, c.fetchedAt]));
  const cutoff = Date.now() - TTL_MS;
  const stale = steamids.filter((id) => (cached.get(id) ?? 0) < cutoff);
  if (stale.length === 0) return;

  for (const steamid64 of stale) {
    try {
      const stats = await fetchMemberStats(steamid64);
      if (stats) saveCs2Stats(steamid64, stats);
    } catch {
      // Steam is unreachable — keep whatever we cached last time.
    }
  }
}

interface CrewStats {
  memberCount: number;
  withStats: MemberStats[];
}

// Delad av både klanrekorden och spelarkorten. Utan den skulle de två
// endpointerna dra igång var sin runda mot Steam trots att de vill åt exakt
// samma cache.
async function getCrewStats(): Promise<CrewStats> {
  const members = listMembers();
  if (members.length === 0) return { memberCount: 0, withStats: [] };

  refreshing ??= refreshStale(members.map((m) => m.steamid64)).finally(() => {
    refreshing = null;
  });
  await refreshing;

  const statsById = new Map(readCs2Stats().map((c) => [c.steamid64, c.stats]));
  const withStats: MemberStats[] = members
    .filter((m) => statsById.has(m.steamid64))
    .map((m) => ({
      steamid64: m.steamid64,
      personaName: m.persona_name,
      stats: statsById.get(m.steamid64)!,
    }));

  return { memberCount: members.length, withStats };
}

export async function getHighlights(): Promise<HighlightsResult> {
  const { memberCount, withStats } = await getCrewStats();
  return {
    highlights: computeHighlights(withStats),
    memberCount,
    withStats: withStats.length,
  };
}

export async function getCards(): Promise<CardsResult> {
  const { memberCount, withStats } = await getCrewStats();
  return {
    cards: buildCards(withStats),
    memberCount,
    withStats: withStats.length,
  };
}
