import { Router } from "express";
import { config } from "../config.ts";
import { isAllowlisted } from "../db.ts";
import { readLimiter } from "../middleware/rateLimit.ts";
import { getMonthlyStatus } from "../bvsMonthService.ts";
import { getCards, getHighlights } from "../statsService.ts";

export const statsRouter = Router();

const CS2_APP_ID = 730;
const STEAMID64_RE = /^\d{17}$/;

// Måste stå före "/:steamId", annars fångas "highlights" som ett steam-id.
statsRouter.get("/highlights", readLimiter, async (_req, res) => {
  res.json(await getHighlights());
});

// Samma sak här — "cards" är inget steam-id och får inte hamna i den routen.
statsRouter.get("/cards", readLimiter, async (_req, res) => {
  res.json(await getCards());
});

// Samma sak: "month" är inget steam-id och får inte hamna i /:steamId.
// Publik precis som highlights/cards — ingen hemlighet i speltimmar, och
// kontosidan behöver kunna visa den även innan medlemmen hunnit logga in.
statsRouter.get("/month", readLimiter, (_req, res) => {
  res.json(getMonthlyStatus());
});

statsRouter.get("/:steamId", readLimiter, async (req, res) => {
  // Express typar route-parametrar som string | string[]; bara en enkel sträng
  // som ser ut som ett SteamID64 och står på allowlistan släpps vidare till Steam.
  const { steamId } = req.params;
  if (typeof steamId !== "string" || !STEAMID64_RE.test(steamId) || !isAllowlisted(steamId)) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const url = new URL("https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/");
  url.searchParams.set("key", config.steamApiKey);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("appid", String(CS2_APP_ID));

  const steamRes = await fetch(url);
  if (!steamRes.ok) {
    // Steam returns 4xx when the profile/game stats aren't public.
    res.status(502).json({ error: "steam_unavailable" });
    return;
  }
  const data = (await steamRes.json()) as { playerstats?: { stats?: Array<{ name: string; value: number }> } };
  res.json({ steamId, stats: data.playerstats?.stats ?? [] });
});
