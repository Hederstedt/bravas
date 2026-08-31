import { Router } from "express";
import { config } from "../config.ts";
import { readLimiter } from "../middleware/rateLimit.ts";

export const configRouter = Router();

// Bara inbjudningslänken. Server-ID:t skickades hit förr men lästes aldrig av
// någon komponent — och nu när widgeten hämtas av BFF:en (se discordPoller)
// behöver klienten det inte alls, så det stannar i backend.
configRouter.get("/", readLimiter, (_req, res) => {
  res.json({
    discordInviteUrl: config.discordInviteUrl,
    // Bara om kopplingen är påslagen, aldrig nycklarna själva. Utan den här
    // hade knappen funnits men inte gjort något synligt när någon tryckte —
    // ett tyst klick är sämre än ingen knapp alls.
    wowLinkEnabled: config.blizzardClientId !== "",
  });
});
