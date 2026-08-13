import { Router } from "express";
import { config } from "../config.ts";
import { readLimiter } from "../middleware/rateLimit.ts";

export const configRouter = Router();

configRouter.get("/", readLimiter, (_req, res) => {
  res.json({
    discordServerId: config.discordServerId,
    discordInviteUrl: config.discordInviteUrl,
  });
});
