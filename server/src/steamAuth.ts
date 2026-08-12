import { config } from "./config.ts";

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function buildLoginRedirectUrl(returnTo: string): string {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": config.publicOrigin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID_URL}?${params.toString()}`;
}

// Verifies the callback query params with Steam and returns the caller's SteamID64, or null if invalid.
export async function verifyCallback(query: Record<string, string>): Promise<string | null> {
  const claimedId = query["openid.claimed_id"];
  const match = claimedId ? CLAIMED_ID_RE.exec(claimedId) : null;
  if (!match) return null;

  const verifyParams = new URLSearchParams(query);
  verifyParams.set("openid.mode", "check_authentication");

  const res = await fetch(STEAM_OPENID_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verifyParams.toString(),
  });
  const text = await res.text();
  if (!/is_valid\s*:\s*true/.test(text)) return null;

  return match[1];
}

export interface SteamPlayerSummary {
  steamid: string;
  personaname: string;
  avatarfull: string;
}

export async function fetchPlayerSummaries(steamids: string[]): Promise<SteamPlayerSummary[]> {
  if (steamids.length === 0) return [];
  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
  url.searchParams.set("key", config.steamApiKey);
  url.searchParams.set("steamids", steamids.join(","));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam GetPlayerSummaries failed: ${res.status}`);
  const data = (await res.json()) as { response: { players: SteamPlayerSummary[] } };
  return data.response.players;
}
