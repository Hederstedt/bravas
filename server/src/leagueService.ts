import {
  listFixtures,
  listTeams,
  nextMatchday,
  saveFixtures,
  saveResult,
  squadOf,
  unplayedOnMatchday,
  type FixtureRow,
  type SeasonRow,
  type TeamRow,
} from "./db.ts";
import { broadcast } from "./events.ts";
import { buildFixtures, buildTable, type PlayedFixture, type TableRow } from "./league.ts";
import { simulateMatch, type MatchResult, type MatchTeam, type PlayerRatings } from "./matchSim.ts";

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
}

// Spelar nästa ospelade omgång. Returnerar null när serien är färdig.
export function playNextMatchday(season: SeasonRow): MatchdayResult | null {
  scheduleSeason(season.id);

  const matchday = nextMatchday(season.id);
  if (matchday === null) return null;

  const teams = new Map(listTeams(season.id).map((t) => [t.id, t]));
  const fixtures = unplayedOnMatchday(season.id, matchday);

  for (const fixture of fixtures) {
    const result = playFixture(season, fixture, teams);
    saveResult(fixture.id, result.homeScore, result.awayScore, result);
  }

  broadcast("league", { seasonId: season.id, matchday, played: fixtures.length });
  return { matchday, played: fixtures.length };
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
