import { lastPlayedAt, listPresenceSamples, type SeasonRow, type TeamRow } from "./db.ts";
import { activityBonus, NO_ACTIVITY, type ActivityBonus } from "./activity.ts";

// Fönstret börjar när förra omgången avgjordes — timmar räknas sedan senaste
// matchen, inte sedan tidernas begynnelse. Har ingen omgång spelats än räknas
// tiden från säsongsstarten.
//
// Att fönstret flyttar sig när en omgång spelas är också det som gör att samma
// timmar inte kan växlas in igen: bonusen räknas om mot ett nytt fönster, och
// gamla timmar hamnar utanför.
export function bonusFor(season: SeasonRow, team: TeamRow, now = Date.now()): ActivityBonus {
  // Botlagen har ingen gubbe bakom sig och lirar inga spel.
  if (!team.manager_steamid64) return NO_ACTIVITY;

  const from = lastPlayedAt(season.id) ?? season.starts_at;
  const samples = listPresenceSamples(team.manager_steamid64, from);
  return activityBonus(samples, from, now);
}
