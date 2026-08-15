import {
  applyTransfer,
  keysTakenByOtherTeams,
  listPool,
  nextMatchday,
  squadOf,
  transferCount,
  type SeasonPlayerRow,
  type SeasonRow,
  type TeamRow,
} from "./db.ts";
import { broadcast } from "./events.ts";
import { TRANSFERS_PER_MATCHDAY, validateTransfer, type MarketPlayer } from "./market.ts";
import { bonusFor } from "./activityService.ts";

export type TransferOutcome =
  | { ok: true }
  | { ok: false; code: "season_finished" | "no_transfers_left" | "invalid_transfer"; error: string };

function toMarketPlayer(row: SeasonPlayerRow): MarketPlayer {
  return { key: row.player_key, name: row.name, value: row.value };
}

// Hur många transfers laget har kvar inför nästa omgång, inklusive den man
// lirat ihop i klanens andra spel sedan förra matchen. null-omgång betyder
// färdigspelad serie — då finns inget fönster.
export function transfersAllowed(season: SeasonRow, team: TeamRow): number {
  return TRANSFERS_PER_MATCHDAY + bonusFor(season, team).transfer;
}

export function transfersLeft(season: SeasonRow, team: TeamRow): number {
  const matchday = nextMatchday(season.id);
  if (matchday === null) return 0;
  return Math.max(0, transfersAllowed(season, team) - transferCount(team.id, matchday));
}

export function makeTransfer(
  season: SeasonRow,
  team: TeamRow,
  sellKey: string,
  buyKey: string
): TransferOutcome {
  const matchday = nextMatchday(season.id);
  if (matchday === null) {
    return { ok: false, code: "season_finished", error: "Serien är färdigspelad — inga fler affärer." };
  }

  if (transferCount(team.id, matchday) >= transfersAllowed(season, team)) {
    return {
      ok: false,
      code: "no_transfers_left",
      error: "Omgångens transfer är redan gjord — nästa fönster öppnar när omgången spelats.",
    };
  }

  const squadRows = squadOf(team.id);
  const poolRows = listPool(season.id);

  // Upptaget är allt som redan har kontrakt — andras gubbar och de egna. Att
  // köpa sin egen gubbe är också en ogiltig affär.
  const takenKeys = new Set([
    ...keysTakenByOtherTeams(season.id, team.id),
    ...squadRows.map((r) => r.player_key),
  ]);

  const check = validateTransfer({
    sellKey,
    buyKey,
    squad: squadRows.map(toMarketPlayer),
    pool: poolRows.map(toMarketPlayer),
    takenKeys,
    funds: team.funds,
  });
  if (!check.ok) return { ok: false, code: "invalid_transfer", error: check.error };

  const soldRow = squadRows.find((r) => r.player_key === sellKey)!;
  const boughtRow = poolRows.find((r) => r.player_key === buyKey)!;

  try {
    applyTransfer({
      seasonId: season.id,
      teamId: team.id,
      matchday,
      soldPlayerId: soldRow.id,
      boughtPlayerId: boughtRow.id,
      soldFor: check.soldFor,
      boughtFor: check.boughtFor,
      newFunds: check.newFunds,
    });
  } catch {
    // Primärnyckeln på spelaren är sista ordet: två lag köpte samma gubbe i
    // samma ögonblick och det här laget kom sist.
    return {
      ok: false,
      code: "invalid_transfer",
      error: "Någon hann före på gubben. Ladda om och försök igen.",
    };
  }

  broadcast("transfer", { seasonId: season.id, teamId: team.id, sold: sellKey, bought: buyKey });
  return { ok: true };
}
