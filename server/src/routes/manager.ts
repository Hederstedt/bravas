import { Router } from "express";
import { activeSeason, getFixture, getTeam, getTeamById, listTeams } from "../db.ts";
import { mutationLimiter, readLimiter } from "../middleware/rateLimit.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { verifySessionCookieValue } from "../session.ts";
import { sessionCookie } from "../session.ts";
import { playNextMatchday } from "../leagueService.ts";
import { makeTransfer } from "../marketService.ts";
import { trainPlayer } from "../trainingService.ts";
import { claimTeam, saveSquad, seasonLocked, seasonView, startSeason } from "../seasonService.ts";

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

  // Fri ombyggnad gäller bara i byggfasen. När serien är igång är truppen
  // låst — annars vore transfermarknadens knapphet och kvot meningslösa.
  if (seasonLocked(season.id)) {
    res.status(409).json({
      error: "squad_locked",
      message: "Truppen är låst när serien är igång — byt gubbar via transfermarknaden.",
    });
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

// En affär: sälj en truppgubbe till poolen, köp en ledig. Bara i seriefasen —
// i byggfasen byggs truppen om fritt med PUT /squad i stället.
managerRouter.post("/transfer", mutationLimiter, requireAuth, (req, res) => {
  const season = activeSeason();
  if (!season) {
    res.status(409).json({ error: "no_active_season" });
    return;
  }

  if (!seasonLocked(season.id)) {
    res.status(409).json({
      error: "season_not_started",
      message: "Serien har inte startat än — bygg om truppen fritt så länge.",
    });
    return;
  }

  const team = getTeam(season.id, req.member!.steamid64);
  if (!team) {
    res.status(409).json({ error: "no_team" });
    return;
  }

  const body = req.body as { sell?: unknown; buy?: unknown };
  const sell = typeof body?.sell === "string" ? body.sell : "";
  const buy = typeof body?.buy === "string" ? body.buy : "";
  if (!sell || !buy) {
    res.status(400).json({ error: "invalid_transfer", message: "Välj en gubbe att sälja och en att köpa." });
    return;
  }

  const result = makeTransfer(season, team, sell, buy);
  if (!result.ok) {
    const status = result.code === "invalid_transfer" ? 400 : 409;
    res.status(status).json({ error: result.code, message: result.error });
    return;
  }

  res.json(seasonView(req.member!.steamid64));
});

// Ett träningspass: ett attribut på en egen truppgubbe. Samma fasregel som
// marknaden — i byggfasen finns inget spelschema och därmed inget fönster.
managerRouter.post("/training", mutationLimiter, requireAuth, (req, res) => {
  const season = activeSeason();
  if (!season) {
    res.status(409).json({ error: "no_active_season" });
    return;
  }

  if (!seasonLocked(season.id)) {
    res.status(409).json({
      error: "season_not_started",
      message: "Serien har inte startat än — träningen öppnar när första omgången är spelad.",
    });
    return;
  }

  const team = getTeam(season.id, req.member!.steamid64);
  if (!team) {
    res.status(409).json({ error: "no_team" });
    return;
  }

  const body = req.body as { player?: unknown; attr?: unknown };
  const player = typeof body?.player === "string" ? body.player : "";
  const attr = typeof body?.attr === "string" ? body.attr : "";
  if (!player || !attr) {
    res.status(400).json({ error: "invalid_training", message: "Välj en gubbe och ett attribut." });
    return;
  }

  const result = trainPlayer(season, team, player, attr);
  if (!result.ok) {
    const status = result.code === "invalid_training" ? 400 : 409;
    res.status(status).json({ error: result.code, message: result.error });
    return;
  }

  res.json(seasonView(req.member!.steamid64));
});

// Spelar nästa ospelade omgång. Vem som helst i klanen får trycka — det är en
// gemensam serie, inte något som en enskild manager äger.
managerRouter.post("/matchday", mutationLimiter, requireAuth, (_req, res) => {
  const season = activeSeason();
  if (!season) {
    res.status(409).json({ error: "no_active_season" });
    return;
  }

  // Utan ett enda lag finns ingen serie att spela. Är det bara ett fylls
  // motståndet på med datorstyrda lag, se ensureOpponents — den som är först
  // in i spelet ska kunna spela en hel säsong utan att vänta på klanen.
  if (listTeams(season.id).length === 0) {
    res.status(409).json({
      error: "no_teams",
      message: "Ingen har skapat ett lag än — döp ditt lag och skriv på en trupp först.",
    });
    return;
  }

  const result = playNextMatchday(season);
  if (!result) {
    res.status(409).json({ error: "season_finished" });
    return;
  }
  res.status(201).json(result);
});

// Referatet sparas när matchen spelas och läses tillbaka som det är — det
// simuleras aldrig om, så en rapport kan inte säga något annat än resultatet.
managerRouter.get("/match/:id", readLimiter, (req, res) => {
  const raw = req.params.id;
  const id = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : null;
  const fixture = id === null ? undefined : getFixture(id);

  if (!fixture || !fixture.report_json) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Lagnamnen följer med: utan dem säger referatet "Hemma" och "Borta" och
  // läsaren har ingen aning om vilka som mötte varandra.
  const home = getTeamById(fixture.home_team_id);
  const away = getTeamById(fixture.away_team_id);

  res.json({
    id: fixture.id,
    matchday: fixture.matchday,
    home: { id: fixture.home_team_id, name: home?.name ?? "Okänt lag" },
    away: { id: fixture.away_team_id, name: away?.name ?? "Okänt lag" },
    homeScore: fixture.home_score,
    awayScore: fixture.away_score,
    report: JSON.parse(fixture.report_json) as unknown,
  });
});
