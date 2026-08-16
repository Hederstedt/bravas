import type { NextFunction, Request, Response } from "express";
import { config } from "../config.ts";

export function isAdmin(steamid64: string | undefined): boolean {
  return steamid64 !== undefined && config.adminSteamIds.includes(steamid64);
}

// Komponeras alltid efter requireAuth, som redan slagit fast att anroparen är
// en riktig medlem och satt req.member. Den här lägger bara till frågan om
// steamid:t står i ADMIN_STEAMIDS — behörigheten bor i env, inte i databasen,
// så en felskrivning i en tabell aldrig kan låsa ut gänget från sin egen
// admin-sida.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req.member?.steamid64)) {
    res.status(403).json({ error: "not_admin" });
    return;
  }
  next();
}
