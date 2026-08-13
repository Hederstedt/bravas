import { Router } from "express";
import { listMembers } from "../db.ts";
import { fetchPresence, type Presence } from "../presence.ts";

export const presenceRouter = Router();

presenceRouter.get("/", async (_req, res) => {
  const steamids = listMembers().map((m) => m.steamid64);
  if (steamids.length === 0) {
    res.json({ presence: {} });
    return;
  }

  let byId = new Map<string, Presence>();
  try {
    byId = await fetchPresence(steamids);
  } catch {
    // Presence is decoration — a Steam outage must not take the roster with it.
    res.json({ presence: {} });
    return;
  }

  // Drive the response from our own member list so Steam can never inject
  // someone who isn't on the roster.
  const presence: Record<string, Presence> = {};
  for (const id of steamids) {
    const p = byId.get(id);
    if (p) presence[id] = p;
  }
  res.json({ presence });
});
