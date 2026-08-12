import type { NextFunction, Request, Response } from "express";
import { getMember } from "../db.ts";
import { sessionCookie, verifySessionCookieValue } from "../session.ts";

declare module "express-serve-static-core" {
  interface Request {
    member?: ReturnType<typeof getMember>;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const steamid64 = verifySessionCookieValue(req.cookies?.[sessionCookie.name]);
  const member = steamid64 ? getMember(steamid64) : undefined;
  if (!member) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  req.member = member;
  next();
}
