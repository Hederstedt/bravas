import {
  crownBvsMonth,
  getBvsMonthWinner,
  getMonthAwards,
  listDiscordSamples,
  listMembers,
  listPresenceSamples,
  saveMonthAwards,
} from "./db.ts";
import { broadcast } from "./events.ts";
import { decideAwards, monthMetrics, type MemberMonth } from "./bvsAwards.ts";

// En gång i timmen räcker — svaret för en given månad ändras bara i det
// ögonblick den avslutas, resten av tiden är kollen bara en billig no-op mot
// en tabell som redan har raden.
export const POLL_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Lokal tid, som valheimHistory.ts redan gör med getDay()/getHours() — det
// finns ingen tidszonsutility i kodbasen, och sajten har ett gäng i en
// tidszon.
function monthWindow(year: number, monthIndex0: number): { from: number; to: number } {
  return {
    from: new Date(year, monthIndex0, 1, 0, 0, 0, 0).getTime(),
    to: new Date(year, monthIndex0 + 1, 1, 0, 0, 0, 0).getTime(),
  };
}

export function previousMonth(now: Date): { month: string; from: number; to: number } {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const { from, to } = monthWindow(prev.getFullYear(), prev.getMonth());
  return { month: `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`, from, to };
}

// presence_samples är append-only och rensas aldrig, så en avslutad månad går
// att räkna ut i efterhand — även långt efter att den passerat. Siffrorna
// hämtas en gång per medlem och används till både kröningen och
// utmärkelserna; poängen är samma tal i båda fallen.
function metricsForAll(from: number, to: number): MemberMonth[] {
  return listMembers().map((m) => ({
    steamid64: m.steamid64,
    metrics: monthMetrics(
      listPresenceSamples(m.steamid64, from),
      listDiscordSamples(m.steamid64, from),
      from,
      to
    ),
  }));
}

function decideWinner(members: readonly MemberMonth[]): { steamid64: string; score: number } | null {
  let best: { steamid64: string; score: number } | null = null;

  for (const { steamid64, metrics } of members) {
    const score = metrics.score;
    if (score <= 0) continue; // ingen aktivitet räknas inte som en kandidat

    // Extremt osannolikt i praktiken (poängen är en kontinuerlig timsumma),
    // men deterministiskt om det ändå händer: lägst steamid64 vinner.
    if (!best || score > best.score || (score === best.score && steamid64 < best.steamid64)) {
      best = { steamid64, score };
    }
  }

  return best;
}

// Tabellen är sin egen markör: saknar den avslutade månaden en rad, räkna ut
// och lås fast — annars rör vi den inte. Omstartssäkert utan extra state.
//
// Utmärkelserna har en *egen* vakt mot sin egen tabell. Delade de vinnarens
// hade en månad som kröntes innan utmärkelserna fanns aldrig kunnat få några:
// den tidiga returen ovan hade tagit den varje tick, för alltid.
export function crownPreviousMonthIfMissing(now = new Date()): void {
  const { month, from, to } = previousMonth(now);
  const crowned = getBvsMonthWinner(month);
  const hasAwards = getMonthAwards(month).length > 0;
  if (crowned && hasAwards) return;

  const members = metricsForAll(from, to);
  const winner = crowned ?? decideWinner(members);
  // Ingen spelade något den månaden — hellre ingen vinnare än en påhittad.
  // Nästa tick försöker igen; billigt nog att inte spela någon roll.
  if (!winner) return;

  let changed = false;
  if (!crowned) {
    crownBvsMonth({ month, steamid64: winner.steamid64, score: winner.score });
    changed = true;
  }
  if (!hasAwards) {
    const awards = decideAwards(members, winner.steamid64);
    if (awards.length > 0) {
      saveMonthAwards(month, awards);
      changed = true;
    }
  }

  // Bara vid faktisk förändring. En månad där ingen kvalade in till någon
  // utmärkelse (för få aktiva gubbar) får aldrig några rader, och då är
  // vakten ovan falsk varje timme för alltid — utan det här villkoret hade
  // varje öppen flik fått en utsändning i timmen om ingenting.
  if (changed) broadcast("bvs-month", { month, steamid64: winner.steamid64, score: winner.score });
}

export function pollOnce(): void {
  crownPreviousMonthIfMissing();
}

// Startas från index.ts, inte från createApp: annars hade varje testfil som
// bygger en app dragit igång en bakgrundstimer.
export function startMonthlyRollover(intervalMs = POLL_MS): void {
  if (timer) return;
  pollOnce();
  timer = setInterval(pollOnce, intervalMs);
  timer.unref?.();
}

export function stopMonthlyRollover(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
