import { Router } from "express";
import { config } from "../config.ts";
import { doubleCsrfProtection, generateCsrfToken } from "../csrf.ts";
import { isAllowlisted, upsertMemberLogin } from "../db.ts";
import { authLimiter } from "../middleware/rateLimit.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { sessionCookie, createSessionCookieValue, verifySessionCookieValue } from "../session.ts";
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

  res.cookie(sessionCookie.name, createSessionCookieValue(steamid64), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: sessionCookie.maxAgeMs,
    path: "/",
  });
  res.redirect(`${config.publicOrigin}/`);
});

authRouter.post("/logout", doubleCsrfProtection, (_req, res) => {
  res.clearCookie(sessionCookie.name, { path: "/" });
  res.status(204).end();
});

authRouter.get("/me", (req, res) => {
  const steamid64 = verifySessionCookieValue(req.cookies?.[sessionCookie.name]);
  if (!steamid64) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  res.json({ steamid64 });
});

// Frontend calls this once logged in to obtain a token for subsequent
// state-changing requests (sent back via the X-CSRF-Token header).
authRouter.get("/csrf-token", requireAuth, (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});
