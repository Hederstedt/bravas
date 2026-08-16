import { Router } from "express";
import {
  approveApplication,
  listApplications,
  listMembers,
  rejectApplication,
  removeMember,
  type Application,
} from "../db.ts";
import { mutationLimiter, readLimiter } from "../middleware/rateLimit.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const adminRouter = Router();

// Steams id:n är 17 siffror. En rutt-parameter som inte ser ut så är inte en
// medlem som råkar saknas — den är skräp, och ska aldrig nå databasen.
function steamId(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && /^\d{17}$/.test(raw) ? raw : null;
}

function publicApplication(row: Application) {
  return {
    steamid64: row.steamid64,
    personaName: row.persona_name,
    avatarUrl: row.avatar_url,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

adminRouter.get("/applications", readLimiter, requireAuth, requireAdmin, (_req, res) => {
  res.json({ applications: listApplications().map(publicApplication) });
});

// Medlemslistan finns publikt på /api/members, men admin-sidan behöver den
// bredvid ansökningarna och ska inte behöva två anrop för en sida.
adminRouter.get("/members", readLimiter, requireAuth, requireAdmin, (_req, res) => {
  const members = listMembers().map((m) => ({
    steamid64: m.steamid64,
    personaName: m.persona_name,
    avatarUrl: m.avatar_url,
  }));
  res.json({ members });
});

adminRouter.post(
  "/applications/:steamid64/approve",
  mutationLimiter,
  requireAuth,
  requireAdmin,
  (req, res) => {
    const steamid64 = steamId(req.params.steamid64);
    if (!steamid64 || !approveApplication(steamid64)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  }
);

adminRouter.post(
  "/applications/:steamid64/reject",
  mutationLimiter,
  requireAuth,
  requireAdmin,
  (req, res) => {
    const steamid64 = steamId(req.params.steamid64);
    if (!steamid64 || !rejectApplication(steamid64)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  }
);

adminRouter.delete(
  "/members/:steamid64",
  mutationLimiter,
  requireAuth,
  requireAdmin,
  (req, res) => {
    const steamid64 = steamId(req.params.steamid64);
    if (!steamid64) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Ett felklick ska inte kunna låsa ut den enda adminen ur sin egen sida.
    if (steamid64 === req.member!.steamid64) {
      res.status(400).json({ error: "cannot_remove_self" });
      return;
    }

    if (!removeMember(steamid64)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  }
);
