import { Router } from "express";
import { config } from "../config.ts";

export const configRouter = Router();

configRouter.get("/", (_req, res) => {
  res.json({
    discordServerId: config.discordServerId,
    discordInviteUrl: config.discordInviteUrl,
  });
});
