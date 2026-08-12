import { Router } from "express";
import { config } from "../config.ts";
import { isAllowlisted } from "../db.ts";

export const statsRouter = Router();

const CS2_APP_ID = 730;
const STEAMID64_RE = /^\d{17}$/;

statsRouter.get("/:steamId", async (req, res) => {
  const { steamId } = req.params;
  if (!STEAMID64_RE.test(steamId) || !isAllowlisted(steamId)) {
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
