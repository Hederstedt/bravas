import type { AttrKey } from "./cs2Cards.ts";
import {
  applyTraining,
  nextMatchday,
  squadOf,
  trainingCount,
  type SeasonRow,
  type TeamRow,
} from "./db.ts";
import { broadcast } from "./events.ts";
import type { PlayerRatings } from "./matchSim.ts";
import { playerValue } from "./season.ts";
import { isAttrKey, SESSIONS_PER_MATCHDAY, validateTraining } from "./training.ts";
import { bonusFor } from "./activityService.ts";

export type TrainingOutcome =
  | { ok: true }
  | { ok: false; code: "season_finished" | "no_sessions_left" | "invalid_training"; error: string };

// Hur många pass laget har kvar inför nästa omgång, inklusive det man lirat
// ihop sedan förra matchen. null-omgång betyder färdigspelad serie — då finns
// inget fönster.
export function sessionsAllowed(season: SeasonRow, team: TeamRow): number {
  return SESSIONS_PER_MATCHDAY + bonusFor(season, team).training;
}

export function trainingLeft(season: SeasonRow, team: TeamRow): number {
  const matchday = nextMatchday(season.id);
  if (matchday === null) return 0;
  return Math.max(0, sessionsAllowed(season, team) - trainingCount(team.id, matchday));
}

export function trainPlayer(
  season: SeasonRow,
  team: TeamRow,
  playerKey: string,
  attr: string
): TrainingOutcome {
  const matchday = nextMatchday(season.id);
  if (matchday === null) {
    return { ok: false, code: "season_finished", error: "Serien är färdigspelad — träningen är stängd." };
  }

  if (trainingCount(team.id, matchday) >= sessionsAllowed(season, team)) {
    return {
      ok: false,
      code: "no_sessions_left",
      error: "Omgångens pass är gjorda — lira lite CS2 så öppnar fler före nästa match.",
    };
  }

  const row = squadOf(team.id).find((p) => p.player_key === playerKey);
  if (!row) {
    return { ok: false, code: "invalid_training", error: "Gubben du vill träna är inte i din trupp." };
  }

  if (!isAttrKey(attr)) {
    return { ok: false, code: "invalid_training", error: "Det där är inget attribut som går att träna." };
  }

  const ratings = JSON.parse(row.ratings_json) as PlayerRatings;
  const check = validateTraining({ playerName: row.name, rating: ratings[attr as AttrKey] });
  if (!check.ok) return { ok: false, code: "invalid_training", error: check.error };

  const newRatings: PlayerRatings = { ...ratings, [attr]: ratings[attr as AttrKey] + check.gain };

  // Värdet räknas om med samma kubiska kurva som satte priset vid frysningen —
  // tränade spelare blir dyrare att köpa och ger mer vid försäljning.
  applyTraining({
    seasonId: season.id,
    teamId: team.id,
    seasonPlayerId: row.id,
    matchday,
    attr,
    gain: check.gain,
    ratingAfter: newRatings[attr as AttrKey],
    ratingsJson: JSON.stringify(newRatings),
    value: playerValue(newRatings),
  });

  broadcast("training", {
    seasonId: season.id,
    teamId: team.id,
    player: playerKey,
    attr,
    rating: newRatings[attr as AttrKey],
  });
  return { ok: true };
}
