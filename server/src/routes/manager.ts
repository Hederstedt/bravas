import { Router } from "express";
import { activeSeason, getTeam } from "../db.ts";
import { mutationLimiter, readLimiter } from "../middleware/rateLimit.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { verifySessionCookieValue } from "../session.ts";
import { sessionCookie } from "../session.ts";
import { claimTeam, saveSquad, seasonView, startSeason } from "../seasonService.ts";

export const managerRouter = Router();

const MAX_TEAM_NAME = 40;

// Läsvyn är öppen — man ska kunna titta på tabellen och truppen utan att logga
// in. Den egna truppen fylls i bara om det finns en session.
managerRouter.get("/", readLimiter, (req, res) => {
  const steamid64 = verifySessionCookieValue(req.cookies?.[sessionCookie.name]);
  res.json(seasonView(steamid64));
});

managerRouter.post("/season", mutationLimiter, requireAuth, async (req, res) => {
  const raw: unknown = (req.body as { name?: unknown })?.name;
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name || name.length > MAX_TEAM_NAME) {
    res.status(400).json({ error: "invalid_name" });
    return;
  }

  // Vem som helst i klanen får dra igång säsongen, men bara en åt gången —
  // startSeason lämnar tillbaka den pågående i stället för att skapa en till.
  const season = await startSeason(name);
  res.status(201).json({ season });
});

managerRouter.post("/team", mutationLimiter, requireAuth, (req, res) => {
  const season = activeSeason();
  if (!season) {
    res.status(409).json({ error: "no_active_season" });
    return;
  }

  const raw: unknown = (req.body as { name?: unknown })?.name;
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name || name.length > MAX_TEAM_NAME) {
    res.status(400).json({ error: "invalid_name" });
    return;
  }

  const team = claimTeam(season.id, req.member!.steamid64, name);
  if (!team) {
    res.status(409).json({ error: "already_has_team" });
    return;
  }
  res.status(201).json({ team });
});

managerRouter.put("/squad", mutationLimiter, requireAuth, (req, res) => {
  const season = activeSeason();
  if (!season) {
    res.status(409).json({ error: "no_active_season" });
    return;
  }

  const team = getTeam(season.id, req.member!.steamid64);
  if (!team) {
    res.status(409).json({ error: "no_team" });
    return;
  }

  const raw: unknown = (req.body as { players?: unknown })?.players;
  if (!Array.isArray(raw) || raw.some((k) => typeof k !== "string")) {
    res.status(400).json({ error: "invalid_players" });
    return;
  }

  const result = saveSquad(season, team, raw as string[]);
  if (!result.ok) {
    // Meddelandet är skrivet för managern och går rakt ut i gränssnittet.
    res.status(400).json({ error: "invalid_squad", message: result.error });
    return;
  }

  res.json(seasonView(req.member!.steamid64));
});
