import { config } from "./config.ts";
import {
  getReigningBvsMonth,
  listMembers,
  listValheimSamples,
  readCs2Stats,
  saveCs2Stats,
  readValheimPlaytime,
  saveValheimPlaytime,
  readWotStats,
  readWowStats,
  saveWowStats,
  wowCharacterKey,
  saveWotStats,
} from "./db.ts";
import { valheimHighlights } from "./valheimHistory.ts";
import { computeValheimPlaytimeHighlight, type MemberPlaytime } from "./valheimPlaytime.ts";
import { computeHighlights, type MemberStats, type StatHighlight } from "./cs2Stats.ts";
import { computeWotHighlights, type WotMemberStats } from "./wotStats.ts";
import { fetchCharacter, type WowMemberStats } from "./wowStats.ts";
import type { PlayerCard } from "./cs2Cards.ts";
import { buildCombinedCards } from "./playerCards.ts";

const CS2_APP_ID = 730;
const VALHEIM_APP_ID = 892970;
const WOT_ACCOUNT_INFO_URL = "https://api.worldoftanks.eu/wot/account/info/";
const TTL_MS = 30 * 60 * 1000;

export interface HighlightsResult {
  highlights: StatHighlight[];
  memberCount: number;
  withStats: number;
}

// Stjärnan är inte betygshärledd — den sätts inte i cs2Cards.ts/playerCards.ts,
// som handlar uteslutande om betyg. Dekoreras på här i stället, mot den
// regerande vinnaren (senast avgjorda månaden).
export type DecoratedCard = PlayerCard & { memberOfMonth: boolean };

export interface CardsResult {
  cards: DecoratedCard[];
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

// GetOwnedGames svarar 200 även för en stängd profil — bara utan "games" i
// svaret — så ett saknat 892970 i listan betyder "inget att visa", inte fel.
async function fetchValheimPlaytimeMinutes(steamid64: string): Promise<number | null> {
  const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
  url.searchParams.set("key", config.steamApiKey);
  url.searchParams.set("steamid", steamid64);
  url.searchParams.set("format", "json");

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    response?: { games?: { appid: number; playtime_forever: number }[] };
  };
  const valheim = data.response?.games?.find((g) => g.appid === VALHEIM_APP_ID);
  return valheim ? valheim.playtime_forever : null;
}

let refreshingValheimPlaytime: Promise<void> | null = null;

async function refreshStaleValheimPlaytime(steamids: string[]): Promise<void> {
  const cached = new Map(readValheimPlaytime().map((c) => [c.steamid64, c.fetchedAt]));
  const cutoff = Date.now() - TTL_MS;
  const stale = steamids.filter((id) => (cached.get(id) ?? 0) < cutoff);
  if (stale.length === 0) return;

  for (const steamid64 of stale) {
    try {
      const minutes = await fetchValheimPlaytimeMinutes(steamid64);
      if (minutes !== null) saveValheimPlaytime(steamid64, minutes);
    } catch {
      // Steam is unreachable — keep whatever we cached last time.
    }
  }
}

// Egen cache och eget lås, skild från CS2-vägen ovan: olika endpoint, och en
// medlem utan CS2-profil kan mycket väl ha öppen speltid, eller tvärtom.
async function getCrewPlaytime(members: { steamid64: string; persona_name: string }[]): Promise<MemberPlaytime[]> {
  if (members.length === 0) return [];

  refreshingValheimPlaytime ??= refreshStaleValheimPlaytime(members.map((m) => m.steamid64)).finally(() => {
    refreshingValheimPlaytime = null;
  });
  await refreshingValheimPlaytime;

  const minutesById = new Map(readValheimPlaytime().map((c) => [c.steamid64, c.minutes]));
  return members
    .filter((m) => minutesById.has(m.steamid64))
    .map((m) => ({
      steamid64: m.steamid64,
      personaName: m.persona_name,
      minutes: minutesById.get(m.steamid64)!,
    }));
}

// Publik kontostatistik — inget access_token behövs, samma sak som att CS2:s
// GetUserStatsForGame inte kräver en inloggad session. Ett tomt svar betyder
// stängd profil eller att kontot inte hunnit spela än, inte ett fel.
async function fetchWotAccountStats(wotAccountId: string): Promise<Record<string, number> | null> {
  const url = new URL(WOT_ACCOUNT_INFO_URL);
  url.searchParams.set("application_id", config.wargamingApplicationId);
  url.searchParams.set("account_id", wotAccountId);
  url.searchParams.set("fields", "statistics.all");

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: string;
    data?: Record<string, { statistics?: { all?: Record<string, number> } } | null>;
  };
  if (data.status !== "ok") return null;

  const stats = data.data?.[wotAccountId]?.statistics?.all;
  return stats && Object.keys(stats).length > 0 ? stats : null;
}

let refreshingWotStats: Promise<void> | null = null;

async function refreshStaleWotStats(wotAccountIds: string[]): Promise<void> {
  const cached = new Map(readWotStats().map((c) => [c.wotAccountId, c.fetchedAt]));
  const cutoff = Date.now() - TTL_MS;
  const stale = wotAccountIds.filter((id) => (cached.get(id) ?? 0) < cutoff);
  if (stale.length === 0) return;

  for (const wotAccountId of stale) {
    try {
      const stats = await fetchWotAccountStats(wotAccountId);
      if (stats) saveWotStats(wotAccountId, stats);
    } catch {
      // Wargaming är oåtkomligt — behåll det som redan är cachat.
    }
  }
}

// Bara de som faktiskt länkat ett konto räknas med — ingen wot_account_id,
// inget att fråga Wargaming om.
async function getCrewWotStats(
  members: { steamid64: string; wot_account_id: string | null; persona_name: string }[]
): Promise<WotMemberStats[]> {
  const linked = members.filter((m) => m.wot_account_id !== null);
  if (linked.length === 0) return [];

  const accountIds = linked.map((m) => m.wot_account_id!);
  refreshingWotStats ??= refreshStaleWotStats(accountIds).finally(() => {
    refreshingWotStats = null;
  });
  await refreshingWotStats;

  const statsById = new Map(readWotStats().map((c) => [c.wotAccountId, c.stats]));
  return linked
    .filter((m) => statsById.has(m.wot_account_id!))
    .map((m) => ({
      wotAccountId: m.wot_account_id!,
      steamid64: m.steamid64,
      personaName: m.persona_name,
      stats: statsById.get(m.wot_account_id!)!,
    }));
}

let refreshingWowStats: Promise<void> | null = null;

async function refreshStaleWowStats(keys: { key: string; realmSlug: string; name: string }[]): Promise<void> {
  const cached = new Map(readWowStats().map((c) => [c.characterKey, c.fetchedAt]));
  const cutoff = Date.now() - TTL_MS;
  const stale = keys.filter((k) => (cached.get(k.key) ?? 0) < cutoff);
  if (stale.length === 0) return;

  for (const k of stale) {
    try {
      const stats = await fetchCharacter(k.realmSlug, k.name);
      if (stats) saveWowStats(k.key, stats);
    } catch {
      // Blizzard är oåtkomligt — behåll det som redan är cachat.
    }
  }
}

// Bara den som faktiskt länkat en karaktär. En omdöpt eller raderad karaktär
// ger 404 hos Blizzard, vilket fetchCharacter behandlar som "inget att visa"
// och inte som ett fel — kortet tappar då sina WoW-attribut tills gubben
// länkar om, precis som en stängd Steam-profil tappar sina CS2-siffror.
async function getCrewWowStats(
  members: { steamid64: string; wow_realm_slug: string | null; wow_character_name: string | null }[]
): Promise<WowMemberStats[]> {
  const linked = members.filter((m) => m.wow_realm_slug !== null && m.wow_character_name !== null);
  if (linked.length === 0) return [];

  const keys = linked.map((m) => ({
    key: wowCharacterKey(m.wow_realm_slug!, m.wow_character_name!),
    realmSlug: m.wow_realm_slug!,
    name: m.wow_character_name!,
  }));

  refreshingWowStats ??= refreshStaleWowStats(keys).finally(() => {
    refreshingWowStats = null;
  });
  await refreshingWowStats;

  const byKey = new Map(readWowStats().map((c) => [c.characterKey, c.stats]));
  return linked.flatMap((m) => {
    const stats = byKey.get(wowCharacterKey(m.wow_realm_slug!, m.wow_character_name!));
    return stats ? [{ steamid64: m.steamid64, stats }] : [];
  });
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
  const members = listMembers();
  const playtime = await getCrewPlaytime(members);
  const valheimPlaytime = computeValheimPlaytimeHighlight(playtime);
  const wotStats = await getCrewWotStats(members);

  return {
    // Valheim-rekorden kommer ur vår egen poller och beror varken på Steam
    // eller på att någon har öppen profil — de finns även när CS2-listan är
    // tom, och det är hela poängen: "Siffrorna" ska inte vara en CS2-sektion.
    highlights: [
      ...computeHighlights(withStats),
      ...valheimHighlights(listValheimSamples()),
      ...(valheimPlaytime ? [valheimPlaytime] : []),
      ...computeWotHighlights(wotStats),
    ],
    memberCount,
    withStats: withStats.length,
  };
}

export async function getCards(): Promise<CardsResult> {
  const members = listMembers();
  const { withStats: cs2WithStats } = await getCrewStats();
  const wotStats = await getCrewWotStats(members);
  const valheimPlaytime = await getCrewPlaytime(members);
  const wowStats = await getCrewWowStats(members);

  const cs2ById = new Map(cs2WithStats.map((m) => [m.steamid64, m]));
  const wotById = new Map(wotStats.map((m) => [m.steamid64, m]));
  const valheimById = new Map(valheimPlaytime.map((m) => [m.steamid64, m]));
  const wowById = new Map(wowStats.map((m) => [m.steamid64, m]));
  const crew = members.map((m) => ({ steamid64: m.steamid64, personaName: m.persona_name }));
  const cards = buildCombinedCards(crew, cs2ById, wotById, valheimById, wowById);
  const reigning = getReigningBvsMonth();
  const decorated = cards.map((c) => ({ ...c, memberOfMonth: c.steamid64 === reigning?.steamid64 }));

  return {
    cards: decorated,
    memberCount: members.length,
    // Räknar nu med båda spelen — en gubbe med bara ett länkat WoT-konto ska
    // räknas som "har statistik" precis som en med öppen CS2-profil.
    withStats: cards.filter((c) => c.hasStats).length,
  };
}
