import { getBvsMonthWinner, getMember, listDiscordSamples, listMembers, listPresenceSamples } from "./db.ts";
import { hoursPerGameWithDiscord, scoreFor } from "./bvsMonth.ts";
import { previousMonth } from "./monthlyPoller.ts";

export interface StandingRow {
  steamid64: string;
  personaName: string;
  score: number;
}

export interface MonthlyStatus {
  month: string; // innevarande, ej ännu avgjorda, månad — 'YYYY-MM'
  standings: StandingRow[]; // fallande på poäng, alla medlemmar med
  lastMonth: (StandingRow & { month: string }) | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function currentMonthWindow(now: Date): { month: string; from: number } {
  return {
    month: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
    from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime(),
  };
}

// Löpande ställning för innevarande månad, plus förra månadens redan avgjorda
// vinnare. Alla medlemmar listas, även den som står på noll — poängen är att
// var och en ska se var hen ligger, inte bara de aktiva.
export function getMonthlyStatus(now = new Date()): MonthlyStatus {
  const { month, from } = currentMonthWindow(now);
  const to = now.getTime();

  const standings = listMembers()
    .map((m) => ({
      steamid64: m.steamid64,
      personaName: m.persona_name,
      score: scoreFor(
        hoursPerGameWithDiscord(listPresenceSamples(m.steamid64, from), listDiscordSamples(m.steamid64, from), from, to)
      ),
    }))
    .sort((a, b) => b.score - a.score || a.personaName.localeCompare(b.personaName, "sv"));

  const winner = getBvsMonthWinner(previousMonth(now).month);
  // Vinnaren kan ha slutat sedan kröningen — historiken visas ändå, med
  // steamid:t som namn i stället för att beskedet försvinner.
  const lastMonth = winner
    ? {
        month: winner.month,
        steamid64: winner.steamid64,
        personaName: getMember(winner.steamid64)?.persona_name ?? winner.steamid64,
        score: winner.score,
      }
    : null;

  return { month, standings, lastMonth };
}
