import type { PresenceSample } from "./db.ts";
import { clampToWindow, spans } from "./sampleSpans.ts";

// Månadens BVS:are: viktad poäng med tak per spel, inte rena timmar. Rör inte
// activity.ts — dess invariant, "aktiviteten rör aldrig spelarbetygen", är
// managerns och de två systemen ska inte kopplas ihop. Delar i stället
// spann-aritmetiken i sampleSpans.ts, precis som activity.ts självt gör.
//
// Fallgropar ärvda därifrån:
// - Sista raden i en session ger aldrig ett spann (ett spann kräver en
//   efterföljare) → upp till ~5 min per session räknas inte. Systematisk
//   underräkning, aldrig över.
// - Byter någon spel inom MAX_GAP_MS tillskrivs mellantiden det första spelet.
// - Stängd Steam-profil samplas aldrig (presence.ts) och ger därför noll
//   poäng — det måste stå i förklaringstexten på sajten.
// - game är Steams råa gameextrainfo-sträng, fritext utan normaliserat id.

export const CAP_HOURS_PER_GAME = 10;

// Timmar per spel i fönstret. Samma spann-aritmetik som hoursInWindow i
// activity.ts, men grupperat på spelnamn i stället för CS2/inte-CS2.
export function hoursPerGame(
  samples: readonly PresenceSample[],
  from: number,
  to: number
): Map<string, number> {
  const hours = new Map<string, number>();

  for (const span of spans(samples)) {
    const ms = clampToWindow(span, from, to);
    if (ms === 0) continue;
    hours.set(span.row.game, (hours.get(span.row.game) ?? 0) + ms / 3_600_000);
  }

  return hours;
}

// Varje spel bidrar upp till taket. Den som är med överallt slår den som
// grindar ett enda spel — annars vinner samma gubbe varje månad.
export function scoreFor(hours: ReadonlyMap<string, number>): number {
  let score = 0;
  for (const h of hours.values()) score += Math.min(CAP_HOURS_PER_GAME, h);
  return score;
}
