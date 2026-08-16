import { Router } from "express";
import { config } from "../config.ts";
import { csrfCookie, generateCsrfToken } from "../csrf.ts";
import { getMember, isAllowlisted, upsertMemberLogin } from "../db.ts";
import { authLimiter, readLimiter } from "../middleware/rateLimit.ts";
import { isAdmin } from "../middleware/requireAdmin.ts";
import { requireSteamIdentity } from "../middleware/requireSteamIdentity.ts";
import {
  sessionCookie,
  createSessionCookieValue,
  needsRenewal,
  readSessionCookieValue,
} from "../session.ts";
import { buildLoginRedirectUrl, fetchPlayerSummaries, verifyCallback } from "../steamAuth.ts";

export const authRouter = Router();

const CALLBACK_PATH = "/api/auth/steam/callback";

// authLimiter (30 per kvart) sitter på de routes som faktiskt loggar in eller
// ut, inte router-brett. /me och /csrf-token är sessionsavläsningar, inte
// inloggningsförsök: frontenden frågar /me vid varje sidladdning från flera
// komponenter samtidigt, och med inloggningstaket räckte ett vanligt
// klickande för att bli utlåst och se utloggad ut mitt i besöket.
authRouter.get("/steam/login", authLimiter, (_req, res) => {
  const returnTo = `${config.publicOrigin}${CALLBACK_PATH}`;
  res.redirect(buildLoginRedirectUrl(returnTo));
});

authRouter.get("/steam/callback", authLimiter, async (req, res) => {
  const query = req.query as Record<string, string>;
  const steamid64 = await verifyCallback(query);
  if (!steamid64) {
    res.redirect(`${config.publicOrigin}/?auth=failed`);
    return;
  }

  // Den som inte står i allowlisten får ändå en session — men ingen
  // members-rad, och därmed ingenting bakom requireAuth. Kakan duger till exakt
  // två saker: hämta en CSRF-token och skicka in en ansökan. Utan den kunde en
  // sökande inte posta något alls, och möttes förut av en query-parameter som
  // frontenden aldrig läste.
  if (!isAllowlisted(steamid64)) {
    res.cookie(sessionCookie.name, createSessionCookieValue(steamid64), sessionCookie.options);
    res.redirect(`${config.publicOrigin}/ansok`);
    return;
  }

  const [summary] = await fetchPlayerSummaries([steamid64]);
  const { isNew } = upsertMemberLogin({
    steamid64,
    personaName: summary?.personaname ?? steamid64,
    avatarUrl: summary?.avatarfull ?? null,
  });

  res.cookie(sessionCookie.name, createSessionCookieValue(steamid64), sessionCookie.options);
  // Första inloggningen landar på kontosidan i stället för hem: där finns
  // kopplingarna till Discord och World of Tanks, och utan en knuff dit är det
  // ingen som hittar dem. ?ny=1 låter sidan välkomna i stället för att bara
  // stå där.
  res.redirect(`${config.publicOrigin}${isNew ? "/mitt-konto?ny=1" : "/"}`);
});

authRouter.post("/logout", authLimiter, (_req, res) => {
  // Båda kakorna, med samma flaggor de sattes med. Lämnas CSRF-kakan kvar
  // ligger en token bunden till ett steamid som webbläsaren inte längre har
  // någon session för.
  res.clearCookie(sessionCookie.name, sessionCookie.options);
  res.clearCookie(csrfCookie.name, csrfCookie.options);
  res.status(204).end();
});

// A session probe, not a protected resource: being logged out is a normal
// answer, so it returns 200 either way. A 401 here would log a console error
// on every anonymous page load. Protected endpoints still use requireAuth.
authRouter.get("/me", readLimiter, (req, res) => {
  const session = readSessionCookieValue(req.cookies?.[sessionCookie.name]);
  if (!session) {
    res.json({ authenticated: false });
    return;
  }

  // Frontenden anropar den här vid varje sidladdning, så det är här den
  // glidande sessionen får sin förlängning: den som besöker sidan då och då
  // loggas aldrig ut, medan den som varit borta i en månad får logga in igen.
  if (needsRenewal(session)) {
    res.cookie(
      sessionCookie.name,
      createSessionCookieValue(session.steamid64),
      sessionCookie.options
    );
  }

  // isMember skiljer en medlem från en sökande: båda har en giltig kaka, bara
  // den ena har en members-rad. isAdmin styr om Admin-länken visas — servern
  // gatear ändå oberoende av vad frontenden ritar.
  res.json({
    authenticated: true,
    steamid64: session.steamid64,
    isMember: getMember(session.steamid64) !== undefined,
    isAdmin: isAdmin(session.steamid64),
  });
});

// Frontend calls this once logged in to obtain a token for subsequent
// state-changing requests (sent back via the X-CSRF-Token header).
//
// requireSteamIdentity, inte requireAuth: varje skrivväg i src/api.ts börjar
// med att hämta en token och avbryter på null, så en sökande som nekas här kan
// aldrig posta sin ansökan.
authRouter.get("/csrf-token", readLimiter, requireSteamIdentity, (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});
