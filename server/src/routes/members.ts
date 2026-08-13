import { Router } from "express";
import { listMembers, setDiscordName } from "../db.ts";
import { mutationLimiter, readLimiter } from "../middleware/rateLimit.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const membersRouter = Router();

membersRouter.get("/", readLimiter, (_req, res) => {
  const members = listMembers().map((m) => ({
    steamid64: m.steamid64,
    personaName: m.persona_name,
    avatarUrl: m.avatar_url,
    discordName: m.discord_name,
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
