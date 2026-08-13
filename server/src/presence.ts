import { config } from "./config.ts";

export type PresenceStatus = "offline" | "online" | "in-game";

export interface Presence {
  status: PresenceStatus;
  game: string | null;
}

export interface SteamPresenceFields {
  personastate: number;
  gameextrainfo?: string | null;
  communityvisibilitystate?: number;
}

const ONLINE_STATES = new Set([1, 2, 3, 4, 5]);
const VISIBILITY_PUBLIC = 3;

// Steam reports six persona states plus an optional game name. The roster only
// shows offline / online / in-game, so away, busy and snooze all read as online.
export function toPresence(player: SteamPresenceFields): Presence {
  const visibility = player.communityvisibilitystate ?? VISIBILITY_PUBLIC;
  if (visibility !== VISIBILITY_PUBLIC) return { status: "offline", game: null };

  if (player.gameextrainfo) return { status: "in-game", game: player.gameextrainfo };
  if (ONLINE_STATES.has(player.personastate)) return { status: "online", game: null };
  return { status: "offline", game: null };
}

interface SteamPresencePlayer extends SteamPresenceFields {
  steamid: string;
}

export async function fetchPresence(steamids: string[]): Promise<Map<string, Presence>> {
  if (steamids.length === 0) return new Map();

  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
  url.searchParams.set("key", config.steamApiKey);
  url.searchParams.set("steamids", steamids.join(","));

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam GetPlayerSummaries failed: ${res.status}`);
  const data = (await res.json()) as { response: { players: SteamPresencePlayer[] } };

  return new Map(data.response.players.map((p) => [p.steamid, toPresence(p)]));
}
