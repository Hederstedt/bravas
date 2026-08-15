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

  // Skiljer "du är utloggad" från "uppgifterna är inte konfigurerade på
  // servern". Utan flaggan fick en inloggad medlem texten "logga in för att
  // se namn och lösenord" när VALHEIM_SERVER_NAME saknades i .env — ett
  // besked som var direkt felaktigt och omöjligt att agera på.
  res.json({
    online: status.online,
    players: status.players,
    maxPlayers: status.maxPlayers,
    address: config.valheimAddress,
    signedIn: member !== undefined,
    serverName: member ? config.valheimServerName : null,
    password: member ? config.valheimPassword : null,
  });
});
