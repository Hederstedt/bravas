import { ANONYMIZED_MEMBER_LABEL, getMember, getReigningAwards } from "./db.ts";

// Månadens utmärkelser för besökaren. Till skillnad från vinnaren visas de
// här bara för inloggade medlemmar — skämtet stannar i klanen. Vägen dit är
// en egen endpoint bakom requireAuth, inte ett fält på det publika
// /api/stats/cards: det svaret är publikt och cachat, och ett svar som byter
// form efter session är precis så någon råkar hänga ut en polare på öppna
// nätet.

export interface AwardWinner {
  award: string;
  // Null om gubben lämnat BVS sedan utmärkelsen delades ut — då finns ingen
  // medlemsrad att slå upp ett opakt id mot, och steamid64 får inte läcka.
  id: string | null;
  personaName: string;
  value: number;
}

export interface AwardsStatus {
  month: string | null;
  awards: AwardWinner[];
}

export function getAwardsStatus(): AwardsStatus {
  const rows = getReigningAwards();
  if (rows.length === 0) return { month: null, awards: [] };

  return {
    month: rows[0]!.month,
    awards: rows.map((row) => {
      const member = getMember(row.steamid64);
      return {
        award: row.award,
        id: member?.public_id ?? null,
        personaName: member?.persona_name ?? ANONYMIZED_MEMBER_LABEL,
        value: row.value,
      };
    }),
  };
}
