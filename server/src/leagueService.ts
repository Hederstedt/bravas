import {
  createBotTeam,
  finishSeason,
  listFixtures,
  listPool,
  listTeams,
  nextMatchday,
  saveFixtures,
  saveResult,
  setFunds,
  setSquad,
  squadOf,
  takenKeys,
  unplayedOnMatchday,
  type FixtureRow,
  type SeasonPlayerRow,
  type SeasonRow,
  type TeamRow,
} from "./db.ts";
import { broadcast } from "./events.ts";
import { botBudget, draftSquad, MIN_TEAMS, pickBotNames } from "./bots.ts";
import { buildFixtures, buildTable, type PlayedFixture, type TableRow } from "./league.ts";
import { simulateMatch, type MatchResult, type MatchTeam, type PlayerRatings } from "./matchSim.ts";
import { SEASON_BUDGET, squadCost, type PoolPlayer } from "./season.ts";

// Ett lag utan trupp kan inte spela. Att kasta hade tagit hela omgången med
// sig, så laget förlorar i stället — vilket också är det enda rimliga svaret
// på att inte ha skrivit på någon.
const WALKOVER_SCORE = 13;

export interface PublicFixture {
  id: number;
  matchday: number;
  home: { id: number; name: string };
  away: { id: number; name: string };
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

export function scheduleSeason(seasonId: number): void {
  if (listFixtures(seasonId).length > 0) return;
  const teams = listTeams(seasonId);
  saveFixtures(seasonId, buildFixtures(teams.map((t) => t.id)));
}

function toPoolPlayer(row: SeasonPlayerRow): PoolPlayer {
  return {
    key: row.player_key,
    source: row.source as PoolPlayer["source"],
    steamid64: row.steamid64,
    name: row.name,
    ratings: JSON.parse(row.ratings_json) as PlayerRatings,
    value: row.value,
  };
}

// Fyller serien med datorstyrda lag inför första omgången. Utan dem kan den
// första gubben som hittar hit skriva på sin trupp och sedan inte göra
// någonting — det finns ingen att möta.
//
// Bara den som är helt ensam får sällskap. Har två gubbar redan skapat lag har
// de valt varandra som motstånd, och då ska datorn inte tränga sig in i deras
// serie. Botlagen läggs dessutom till först när serien faktiskt startar, så
// att alla som hinner skapa lag under byggfasen får plats före datorn.
export function ensureOpponents(seasonId: number): number {
  const existing = listTeams(seasonId);
  if (existing.length !== 1) return 0;

  const names = pickBotNames(MIN_TEAMS - existing.length, new Set(existing.map((t) => t.name)));
  const taken = takenKeys(seasonId);
  const pool = listPool(seasonId).map(toPoolPlayer);

  let added = 0;
  for (const name of names) {
    const available = pool.filter((p) => !taken.has(p.key));
    const seed = `${seasonId}:${name}`;
    const squad = draftSquad(available, seed, botBudget(seed));
    // Är poolen slut går det inte att fylla på fler lag — hellre en kortare
    // serie än ett lag utan trupp som förlorar allt på walkover.
    if (squad.length === 0) break;

    const team = createBotTeam(seasonId, name);
    setSquad(seasonId, team.id, squad.map((p) => p.key));
    // Kassan räknas mot den riktiga budgeten, inte mot botens snålare tak —
    // annars skulle ett botlag som handlat billigt se ut att sakna pengar det
    // faktiskt har.
    setFunds(team.id, SEASON_BUDGET - squadCost(squad));
    for (const p of squad) taken.add(p.key);
    added++;
  }
  return added;
}

function toMatchTeam(team: TeamRow): MatchTeam | null {
  const squad = squadOf(team.id);
  if (squad.length === 0) return null;
  return {
    id: String(team.id),
    name: team.name,
    players: squad.map((p) => ({
      id: p.player_key,
      name: p.name,
      ratings: JSON.parse(p.ratings_json) as PlayerRatings,
    })),
  };
}

// Ett resultat utan match: motståndaren får full pott och rapporten säger
// varför, i stället för att en tom rad dyker upp i tabellen.
function walkover(winner: "home" | "away", reason: string): MatchResult {
  return {
    homeScore: winner === "home" ? WALKOVER_SCORE : 0,
    awayScore: winner === "away" ? WALKOVER_SCORE : 0,
    winner,
    rounds: [],
    scoreboard: { home: [], away: [] },
    mvp: null,
    walkover: reason,
  };
}

function playFixture(season: SeasonRow, fixture: FixtureRow, teams: Map<number, TeamRow>): MatchResult {
  const home = teams.get(fixture.home_team_id);
  const away = teams.get(fixture.away_team_id);

  const homeSide = home ? toMatchTeam(home) : null;
  const awaySide = away ? toMatchTeam(away) : null;

  if (!homeSide && !awaySide) return walkover("home", "Inget av lagen hade en trupp.");
  if (!homeSide) return walkover("away", `${home?.name ?? "Hemmalaget"} hade ingen trupp.`);
  if (!awaySide) return walkover("home", `${away?.name ?? "Bortalaget"} hade ingen trupp.`);

  // Seedet är fast per match, så en omgång går att spela om identiskt och en
  // rapport alltid stämmer med resultatet den sparades med.
  return simulateMatch(homeSide, awaySide, `${season.id}:${fixture.id}`);
}

export interface MatchdayResult {
  matchday: number;
  played: number;
  // Sant när den här omgången var den sista — då är säsongen avslutad och
  // lobbyn tar över, med förra tabellen kvar att titta på.
  seasonFinished: boolean;
}

// Spelar nästa ospelade omgång. Returnerar null när serien är färdig.
export function playNextMatchday(season: SeasonRow): MatchdayResult | null {
  // Motståndarna först: schemat läggs utifrån vilka lag som finns, så botlagen
  // måste vara på plats innan det ritas — efteråt går de inte att få in.
  ensureOpponents(season.id);
  scheduleSeason(season.id);

  const matchday = nextMatchday(season.id);
  if (matchday === null) return null;

  const teams = new Map(listTeams(season.id).map((t) => [t.id, t]));
  const fixtures = unplayedOnMatchday(season.id, matchday);

  for (const fixture of fixtures) {
    const result = playFixture(season, fixture, teams);
    saveResult(fixture.id, result.homeScore, result.awayScore, result);
  }

  // Var det sista omgången stängs säsongen här. Utan det står den kvar som
  // 'active' för alltid: lobbyn kommer aldrig tillbaka, och säsong 2 går inte
  // att starta utan att peta i databasen.
  const seasonFinished = nextMatchday(season.id) === null;
  if (seasonFinished) finishSeason(season.id);

  broadcast("league", { seasonId: season.id, matchday, played: fixtures.length, seasonFinished });
  return { matchday, played: fixtures.length, seasonFinished };
}

export function seasonTable(seasonId: number): TableRow[] {
  const teams = listTeams(seasonId).map((t) => ({ id: t.id, name: t.name }));
  const played: PlayedFixture[] = listFixtures(seasonId)
    .filter((f) => f.played_at !== null && f.home_score !== null && f.away_score !== null)
    .map((f) => ({
      homeTeamId: f.home_team_id,
      awayTeamId: f.away_team_id,
      homeScore: f.home_score!,
      awayScore: f.away_score!,
    }));

  return buildTable(teams, played);
}

export function publicFixtures(seasonId: number): PublicFixture[] {
  const teams = new Map(listTeams(seasonId).map((t) => [t.id, t.name]));
  const named = (id: number) => ({ id, name: teams.get(id) ?? "Okänt lag" });

  return listFixtures(seasonId).map((f) => ({
    id: f.id,
    matchday: f.matchday,
    home: named(f.home_team_id),
    away: named(f.away_team_id),
    played: f.played_at !== null,
    homeScore: f.home_score,
    awayScore: f.away_score,
  }));
}
