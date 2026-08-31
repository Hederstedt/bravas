import { Router } from "express";
import { parseApplicationInput } from "../applications.ts";
import { config } from "../config.ts";
import {
  clearDiscordName,
  clearWotAccount,
  getApplication,
  getMember,
  listMembers,
  setDiscordName,
  setWotAccount,
  setWowCharacter,
  clearWowCharacter,
  upsertApplication,
} from "../db.ts";
import { authLimiter, mutationLimiter, readLimiter } from "../middleware/rateLimit.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireSteamIdentity } from "../middleware/requireSteamIdentity.ts";
import { sessionCookie, verifySessionCookieValue } from "../session.ts";
import { fetchPlayerSummaries } from "../steamAuth.ts";
import { buildLoginRedirectUrl, verifyCallback } from "../wotAuth.ts";
import {
  buildLoginRedirectUrl as buildWowLoginRedirectUrl,
  exchangeCode,
  fetchAccountCharacters,
  pickMainCharacter,
  signState,
  verifyState,
} from "../wowAuth.ts";
import { fetchCharacter } from "../wowStats.ts";

export const membersRouter = Router();

const WOT_CALLBACK_PATH = "/api/members/wot/callback";
const WOW_CALLBACK_PATH = "/api/members/wow/callback";

// Namn och avatar kommer från Steam, aldrig från formuläret — annars kan vem
// som helst ansöka i någon annans namn. Svarar Steam inte får steamid:t duga:
// en ansökan som försvinner för att Steam låg nere är sämre än ett fult namn.
async function steamIdentity(
  steamid64: string
): Promise<{ personaName: string; avatarUrl: string | null }> {
  try {
    const [summary] = await fetchPlayerSummaries([steamid64]);
    if (summary) {
      return {
        personaName: summary.personaname || steamid64,
        avatarUrl: summary.avatarfull || null,
      };
    }
  } catch {
    // Faller igenom till steamid:t som namn.
  }
  return { personaName: steamid64, avatarUrl: null };
}

// steamid64 är kontots riktiga, stabila Steam-id — publikt gör det sajten till
// en skrapbar korsreferens till annat på nätet ingen bad om. Klienten behöver
// bara ett internt id och, för den inloggade, veta vilken rad som är hens
// egen — servern räknar ut "mine" här, precis som quotesRouter redan gör för
// citaten, i stället för att skicka steamid64 och låta klienten jämföra.
membersRouter.get("/", readLimiter, (req, res) => {
  const steamid64 = verifySessionCookieValue(req.cookies?.[sessionCookie.name]);
  const members = listMembers().map((m) => ({
    id: m.public_id,
    personaName: m.persona_name,
    avatarUrl: m.avatar_url,
    discordName: m.discord_name,
    wotNickname: m.wot_nickname,
    // Realm och namn, aldrig karaktärens id: det hade bara varit ännu en
    // identifierare att släppa ut publikt utan att någon behöver den.
    wowCharacter:
      m.wow_realm_slug && m.wow_character_name
        ? { realmSlug: m.wow_realm_slug, name: m.wow_character_name }
        : null,
    mine: steamid64 !== null && m.steamid64 === steamid64,
  }));
  res.json({ members });
});

membersRouter.post("/link", mutationLimiter, requireAuth, (req, res) => {
  const discordName = typeof req.body?.discordName === "string" ? req.body.discordName.trim() : "";
  if (!discordName || discordName.length > 64) {
    res.status(400).json({ error: "invalid_discord_name" });
    return;
  }
  setDiscordName(req.member!.steamid64, discordName);
  res.status(204).end();
});

// Symmetriskt bortkopplingspar till /link och /wot/login-/wot/callback ovan.
// Idempotent med avsikt: att koppla bort något som redan är bortkopplat är
// inget fel, bara ett no-op.
membersRouter.post("/discord/unlink", mutationLimiter, requireAuth, (req, res) => {
  clearDiscordName(req.member!.steamid64);
  res.status(204).end();
});

membersRouter.post("/wot/unlink", mutationLimiter, requireAuth, (req, res) => {
  clearWotAccount(req.member!.steamid64);
  res.status(204).end();
});

// Vem sidan skulle ansöka som, och hur det gick förra gången. En sökande finns
// inte i /api/members, så identiteten får hämtas här — från den egna ansökan om
// det finns en, annars från Steam. Ett Steam-anrop per besök på en sida ingen
// besöker ofta, och bara för den som inte redan ansökt.
membersRouter.get("/apply", readLimiter, requireSteamIdentity, async (req, res) => {
  const steamid64 = req.steamid64!;
  const existing = getApplication(steamid64);
  if (existing) {
    res.json({
      status: existing.status,
      personaName: existing.persona_name,
      avatarUrl: existing.avatar_url,
    });
    return;
  }

  const identity = await steamIdentity(steamid64);
  res.json({ status: "none", ...identity });
});

// Vägen in för den som inte står i allowlisten. requireSteamIdentity i stället
// för requireAuth: en sökande har en giltig Steam-session men medvetet ingen
// members-rad, och skulle aldrig ta sig förbi requireAuth.
//
// Ligger här och inte i authRouter, som har authLimiter router-brett (30 per
// kvart) — ett formulär hör hemma bakom mutationLimiter som resten av
// skrivningarna.
membersRouter.post("/apply", mutationLimiter, requireSteamIdentity, async (req, res) => {
  const steamid64 = req.steamid64!;
  if (getMember(steamid64)) {
    res.status(400).json({ error: "already_member" });
    return;
  }

  const parsed = parseApplicationInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { personaName, avatarUrl } = await steamIdentity(steamid64);
  upsertApplication({ steamid64, personaName, avatarUrl, message: parsed.value.message });
  res.status(201).json({ status: "pending" });
});

// Ingen egen inloggning — Steam är och förblir identiteten. Det här länkar
// bara ett Wargaming-konto till den medlem som redan är inloggad, samma idé
// som Discord-namnet men med en riktig kontokoll i stället för fritext.
membersRouter.get("/wot/login", authLimiter, requireAuth, (_req, res) => {
  res.redirect(buildLoginRedirectUrl(`${config.publicOrigin}${WOT_CALLBACK_PATH}`));
});

membersRouter.get("/wot/callback", authLimiter, requireAuth, async (req, res) => {
  const query = req.query as Record<string, string>;
  const result = await verifyCallback(query);
  if (!result) {
    res.redirect(`${config.publicOrigin}/?wot=failed`);
    return;
  }

  setWotAccount(req.member!.steamid64, result.accountId, result.nickname);
  res.redirect(`${config.publicOrigin}/?wot=linked`);
});

// Samma idé som WoT: Steam är och förblir identiteten, det här länkar bara ett
// Battle.net-konto till den som redan är inloggad. Skillnaden är att Blizzard
// kör riktig OAuth 2.0, så flödet bär en state som binder det till gubben som
// startade det — se wowAuth.ts för varför det inte räcker att callbacken
// kräver en session.
membersRouter.get("/wow/login", authLimiter, requireAuth, (req, res) => {
  if (!config.blizzardClientId) {
    res.redirect(`${config.publicOrigin}/mitt-konto?wow=unavailable`);
    return;
  }
  const state = signState(req.member!.steamid64);
  res.redirect(buildWowLoginRedirectUrl(`${config.publicOrigin}${WOW_CALLBACK_PATH}`, state));
});

membersRouter.get("/wow/callback", authLimiter, requireAuth, async (req, res) => {
  const query = req.query as Record<string, string>;
  const steamid64 = req.member!.steamid64;
  const failed = `${config.publicOrigin}/mitt-konto?wow=failed`;

  if (!verifyState(query.state, steamid64) || !query.code) {
    res.redirect(failed);
    return;
  }

  const token = await exchangeCode(query.code, `${config.publicOrigin}${WOW_CALLBACK_PATH}`);
  if (!token) {
    res.redirect(failed);
    return;
  }

  // Listan kommer från kontot bakom tokenen — det är beviset. Att någon vet
  // ett karaktärsnamn säger ingenting, precis som ett gissat account_id inte
  // räcker på WoT-sidan.
  const characters = await fetchAccountCharacters(token);
  if (characters.length === 0) {
    res.redirect(`${config.publicOrigin}/mitt-konto?wow=nochars`);
    return;
  }

  // Kontosammanfattningen saknar inloggningstidpunkt, så den hämtas per
  // karaktär. Parallellt: ett konto kan ha ett tjog karaktärer, och i följd
  // hade länkningen tagit tiotals sekunder.
  const withLogin = await Promise.all(
    characters.map(async (c) => {
      const profile = await fetchCharacter(c.realmSlug, c.name, token).catch(() => null);
      return { ...c, lastLogin: profile?.lastLogin ?? 0 };
    })
  );

  const main = pickMainCharacter(withLogin);
  if (!main) {
    res.redirect(`${config.publicOrigin}/mitt-konto?wow=nochars`);
    return;
  }

  setWowCharacter(steamid64, {
    realmSlug: main.realmSlug,
    name: main.name,
    characterId: main.id,
  });
  res.redirect(`${config.publicOrigin}/mitt-konto?wow=linked`);
});

membersRouter.post("/wow/unlink", mutationLimiter, requireAuth, (req, res) => {
  clearWowCharacter(req.member!.steamid64);
  res.status(204).end();
});
