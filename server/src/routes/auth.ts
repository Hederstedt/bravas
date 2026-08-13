import { Router } from "express";
import { config } from "../config.ts";
import { generateCsrfToken } from "../csrf.ts";
import { isAllowlisted, upsertMemberLogin } from "../db.ts";
import { authLimiter } from "../middleware/rateLimit.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import {
  sessionCookie,
  createSessionCookieValue,
  needsRenewal,
  readSessionCookieValue,
} from "../session.ts";
import { buildLoginRedirectUrl, fetchPlayerSummaries, verifyCallback } from "../steamAuth.ts";

export const authRouter = Router();
authRouter.use(authLimiter);

const CALLBACK_PATH = "/api/auth/steam/callback";

authRouter.get("/steam/login", (_req, res) => {
  const returnTo = `${config.publicOrigin}${CALLBACK_PATH}`;
  res.redirect(buildLoginRedirectUrl(returnTo));
});

authRouter.get("/steam/callback", async (req, res) => {
  const query = req.query as Record<string, string>;
  const steamid64 = await verifyCallback(query);
  if (!steamid64) {
    res.redirect(`${config.publicOrigin}/?auth=failed`);
    return;
  }

  if (!isAllowlisted(steamid64)) {
    res.redirect(`${config.publicOrigin}/?auth=not_allowed`);
    return;
  }

  const [summary] = await fetchPlayerSummaries([steamid64]);
  upsertMemberLogin({
    steamid64,
    personaName: summary?.personaname ?? steamid64,
    avatarUrl: summary?.avatarfull ?? null,
  });

  res.cookie(sessionCookie.name, createSessionCookieValue(steamid64), sessionCookie.options);
  res.redirect(`${config.publicOrigin}/`);
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(sessionCookie.name, { path: "/" });
  res.status(204).end();
});

// A session probe, not a protected resource: being logged out is a normal
// answer, so it returns 200 either way. A 401 here would log a console error
// on every anonymous page load. Protected endpoints still use requireAuth.
authRouter.get("/me", (req, res) => {
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

  res.json({ authenticated: true, steamid64: session.steamid64 });
});

// Frontend calls this once logged in to obtain a token for subsequent
// state-changing requests (sent back via the X-CSRF-Token header).
authRouter.get("/csrf-token", requireAuth, (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});
