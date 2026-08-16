import { Router } from "express";
import { config } from "../config.ts";
import { listMembers, setDiscordName, setWotAccount } from "../db.ts";
import { authLimiter, mutationLimiter, readLimiter } from "../middleware/rateLimit.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { buildLoginRedirectUrl, verifyCallback } from "../wotAuth.ts";

export const membersRouter = Router();

const WOT_CALLBACK_PATH = "/api/members/wot/callback";

membersRouter.get("/", readLimiter, (_req, res) => {
  const members = listMembers().map((m) => ({
    steamid64: m.steamid64,
    personaName: m.persona_name,
    avatarUrl: m.avatar_url,
    discordName: m.discord_name,
    wotNickname: m.wot_nickname,
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
