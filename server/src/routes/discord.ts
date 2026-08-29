import { Router } from "express";
import { readLimiter } from "../middleware/rateLimit.ts";
import { publicDiscordStatus } from "../discordPoller.ts";

export const discordRouter = Router();

// Öppen som resten av läsvyerna: vilka som hänger i Discorden är precis den
// sorts sak en besökare ska kunna se innan han bestämt sig för att joina.
// Widgeten är dessutom något serverägaren själv slagit på.
discordRouter.get("/", readLimiter, (_req, res) => {
  res.json(publicDiscordStatus());
});
