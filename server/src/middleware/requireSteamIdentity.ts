import type { NextFunction, Request, Response } from "express";
import { sessionCookie, verifySessionCookieValue } from "../session.ts";

declare module "express-serve-static-core" {
  interface Request {
    steamid64?: string;
  }
}

// Systerporten till requireAuth: den här bryr sig bara om att kakan är äkta,
// inte om att det finns en members-rad bakom den. Sökande har det senare — de
// har loggat in med Steam men står inte i allowlisten, och skulle med
// requireAuth aldrig kunna posta sin ansökan.
//
// Att den släpper igenom fler gör den inte svagare: allt som faktiskt rör
// klanens data ligger kvar bakom requireAuth. En sökandes kaka räcker till
// exakt två saker — hämta en CSRF-token och skicka in en ansökan.
export function requireSteamIdentity(req: Request, res: Response, next: NextFunction) {
  const steamid64 = verifySessionCookieValue(req.cookies?.[sessionCookie.name]);
  if (!steamid64) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  req.steamid64 = steamid64;
  next();
}
