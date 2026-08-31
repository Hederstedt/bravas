import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.ts";

// Battle.net använder riktig OAuth 2.0 med authorization code, till skillnad
// från Steams och Wargamings OpenID 2.0. Skillnaden som spelar roll för oss:
// det finns en klienthemlighet, och den lämnar aldrig servern.
//
// Vi sparar aldrig användarens OAuth-token. Den används en enda gång, vid
// länkningen, för att bevisa vilka karaktärer kontot äger. Därefter läses
// karaktärens publika data med en apptoken (client_credentials) — den token
// vi förnyar själva, i stället för att hålla liv i någons personliga.

const OAUTH_HOST = "https://oauth.battle.net";
const SCOPE = "wow.profile";

// Staten lever bara mellan två klick i samma flöde.
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function apiHost(): string {
  return `https://${config.blizzardRegion}.api.blizzard.com`;
}

// Namnrymden avgör vilken data man får. profile-<region> är Retail; Classic
// ligger i profile-classic-<region> och har inte alls samma fält.
export function profileNamespace(): string {
  return `profile-${config.blizzardRegion}`;
}

export function buildLoginRedirectUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: config.blizzardClientId,
    scope: SCOPE,
    state,
    redirect_uri: redirectUri,
    response_type: "code",
  });
  return `${OAUTH_HOST}/authorize?${params.toString()}`;
}

// ---------- state ----------
//
// Callbacken kräver redan en inloggad session, men det räcker inte: en
// angripare kan starta flödet med sitt eget Blizzard-konto och sedan lura en
// inloggad gubbe att besöka callback-adressen med angriparens kod. Då hamnar
// angriparens karaktär på offrets kort. Staten binder flödet till den som
// faktiskt startade det. Samma HMAC-idé som sessionskakan, men kortlivad.

interface StatePayload {
  sid: string;
  exp: number;
}

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

export function signState(steamid64: string, now = Date.now()): string {
  const payload: StatePayload = { sid: steamid64, exp: now + STATE_MAX_AGE_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyState(state: string | undefined, steamid64: string): boolean {
  if (!state) return false;
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return false;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as StatePayload;
    if (payload.exp < Date.now()) return false;
    return payload.sid === steamid64;
  } catch {
    return false;
  }
}

// ---------- token ----------

async function requestToken(body: URLSearchParams): Promise<string | null> {
  const basic = Buffer.from(`${config.blizzardClientId}:${config.blizzardClientSecret}`).toString("base64");
  const res = await fetch(`${OAUTH_HOST}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string | null> {
  return requestToken(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri })
  );
}

export async function appToken(): Promise<string | null> {
  return requestToken(new URLSearchParams({ grant_type: "client_credentials" }));
}

// ---------- kontots karaktärer ----------

export interface WowCharacterSummary {
  id: number;
  name: string;
  realmSlug: string;
  level: number;
  // Fylls i av ett extra anrop per karaktär — kontosammanfattningen har den
  // inte, och det är den som avgör vilken som är main.
  lastLogin: number;
}

interface AccountProfileResponse {
  wow_accounts?: {
    characters?: {
      id?: number;
      name?: string;
      level?: number;
      realm?: { slug?: string };
    }[];
  }[];
}

// Beviset på ägarskap. Att någon vet ett karaktärsnamn säger ingenting — den
// här listan kommer från kontot bakom OAuth-tokenen, så bara den som faktiskt
// loggat in hos Blizzard kan få den.
export async function fetchAccountCharacters(userToken: string): Promise<WowCharacterSummary[]> {
  const url = new URL(`${apiHost()}/profile/user/wow`);
  url.searchParams.set("namespace", profileNamespace());

  const res = await fetch(url, { headers: { Authorization: `Bearer ${userToken}` } });
  if (!res.ok) return [];

  const data = (await res.json()) as AccountProfileResponse;
  const out: WowCharacterSummary[] = [];

  for (const account of data.wow_accounts ?? []) {
    for (const c of account.characters ?? []) {
      const slug = c.realm?.slug;
      if (typeof c.id !== "number" || !c.name || !slug) continue;
      out.push({ id: c.id, name: c.name, realmSlug: slug, level: c.level ?? 0, lastLogin: 0 });
    }
  }

  return out;
}

// Den senast spelade är i praktiken din main, och valet följer med av sig
// självt om du byter. Oavgjort bryts på lägst id — samma princip som
// kröningen i monthlyPoller.ts: godtyckligt, men deterministiskt.
export function pickMainCharacter(
  characters: readonly WowCharacterSummary[]
): WowCharacterSummary | null {
  let best: WowCharacterSummary | null = null;
  for (const c of characters) {
    if (!best || c.lastLogin > best.lastLogin || (c.lastLogin === best.lastLogin && c.id < best.id)) {
      best = c;
    }
  }
  return best;
}
