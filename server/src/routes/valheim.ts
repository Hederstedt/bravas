import { Router } from "express";
import { config } from "../config.ts";
import { getMember } from "../db.ts";
import { readLimiter } from "../middleware/rateLimit.ts";
import { sessionCookie, verifySessionCookieValue } from "../session.ts";
import { currentValheimStatus, hasPolledOnce, refreshValheimStatus } from "../valheimPoller.ts";

export const valheimRouter = Router();

// Namn och lösenord är inte hemliga i bemärkelsen krypterade, men de ska bara
// nå gubbarna på listan — inte vem som helst som hittar sidan. Statusen i
// övrigt (online, spelarantal, adress) är offentlig; adressen ensam duger inte
// till något utan lösenordet.
valheimRouter.get("/status", readLimiter, async (req, res) => {
  // Kallstart: första besökaren efter en omstart hinner före pollerns första
  // varv och ska inte mötas av ett falskt "offline".
  if (!hasPolledOnce()) await refreshValheimStatus();

  const steamid64 = verifySessionCookieValue(req.cookies?.[sessionCookie.name]);
  const member = steamid64 ? getMember(steamid64) : undefined;

  const status = currentValheimStatus();

  res.json({
    online: status.online,
    players: status.players,
    maxPlayers: status.maxPlayers,
    address: config.valheimAddress,
    serverName: member ? config.valheimServerName : null,
    password: member ? config.valheimPassword : null,
  });
});
