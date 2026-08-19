import type { DiscordSample, PresenceSample } from "./db.ts";
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

// Discord-widgeten har inget "game"-fält att gruppera på — den vet bara att
// någon syntes, inte i vad. "Discord" är därför en påhittad spelrad, men
// omfattas av exakt samma tak som CS2/WoT/Valheim: den som mest hänger i
// röstchatt ska inte kunna slå den som faktiskt spelar med klanen.
export const DISCORD_GAME = "Discord";

function hoursFromSpans(samples: readonly { at: number }[], from: number, to: number): number {
  let ms = 0;
  for (const span of spans(samples)) ms += clampToWindow(span, from, to);
  return ms / 3_600_000;
}

// Egen tabell (discord_samples, se db.ts) i stället för en rad till i
// presence_samples — en gubbe kan spela CS2 och sitta i röstchatt samtidigt,
// och två oberoende skrivare i samma spann-ström hade avbrutit varandras
// spann varje gång pollern med kortast intervall rörde sig. Slås ihop här,
// efter att båda är omvandlade till timmar var för sig.
export function hoursPerGameWithDiscord(
  presenceSamples: readonly PresenceSample[],
  discordSamples: readonly DiscordSample[],
  from: number,
  to: number
): Map<string, number> {
  const hours = hoursPerGame(presenceSamples, from, to);
  const discordHours = hoursFromSpans(discordSamples, from, to);
  if (discordHours > 0) hours.set(DISCORD_GAME, (hours.get(DISCORD_GAME) ?? 0) + discordHours);
  return hours;
}
