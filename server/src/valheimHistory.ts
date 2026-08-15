import type { StatHighlight } from "./cs2Stats.ts";
import type { ValheimSample } from "./db.ts";

// Rekorden räknas fram ur pollerns egna avläsningar. Ingen tredje part
// inblandad — det här är statistik om er server, och den finns ingen
// annanstans.
//
// Serverfrågan ger antal spelare, inte vilka. Rekorden här är därför
// serverns, inte enskilda gubbars: vem som satt uppe till 02 går inte att
// veta den här vägen.

const GAME = { gameId: "valheim", gameTitle: "Valheim" };

// Pulsraden skrivs var femte minut. Ett glapp större än så betyder att API:et
// var nere — då vet vi inte vad som hände, och tiden räknas inte alls. Utan
// den gränsen hade en veckas driftstopp bokförts som en vecka med servern i
// det läge den råkade ha när strömmen gick.
export const HEARTBEAT_MS = 5 * 60 * 1000;
export const MAX_GAP_MS = 15 * 60 * 1000;

export interface Interval {
  from: number;
  to: number;
  online: boolean;
  players: number;
}

// Varje avläsning gäller fram till nästa. Glapp hoppas över i stället för att
// gissas.
export function toIntervals(samples: readonly ValheimSample[], maxGapMs = MAX_GAP_MS): Interval[] {
  const intervals: Interval[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const start = samples[i]!;
    const end = samples[i + 1]!;
    const span = end.at - start.at;
    if (span <= 0 || span > maxGapMs) continue;
    intervals.push({
      from: start.at,
      to: end.at,
      online: start.online === 1,
      players: start.players,
    });
  }
  return intervals;
}

function hours(ms: number): number {
  return ms / 3_600_000;
}

function formatHours(ms: number): string {
  const h = hours(ms);
  if (h < 1) return `${Math.round(ms / 60_000)} min`;
  return `${h.toLocaleString("sv-SE", { maximumFractionDigits: h < 10 ? 1 : 0 })} h`;
}

const DAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"] as const;

function dayAndHour(at: number): { day: string; hour: number } {
  const d = new Date(at);
  return { day: DAYS[d.getDay()]!, hour: d.getHours() };
}

function dateLabel(at: number): string {
  return new Date(at).toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
}

// Toppnoteringen, och när den sattes. Vid lika vinner den äldsta — rekordet
// tillhör den som var först.
function peak(intervals: readonly Interval[]): Interval | null {
  let best: Interval | null = null;
  for (const i of intervals) {
    if (i.players > (best?.players ?? 0)) best = i;
  }
  return best;
}

// Längsta obrutna stund servern stod uppe. Sammanhängande betyder att
// intervallen hänger ihop utan glapp — ett glapp är ju just det vi inte vet
// något om.
function longestUptime(intervals: readonly Interval[]): { ms: number; endedAt: number } | null {
  let best = { ms: 0, endedAt: 0 };
  let runStart: number | null = null;
  let runEnd = 0;

  for (const i of intervals) {
    if (!i.online) {
      runStart = null;
      continue;
    }
    // Ny svit både när den förra bröts av att servern gick ner och när det
    // finns ett glapp i mätningen — ett glapp är just det vi inte vet något om.
    if (runStart === null || i.from !== runEnd) runStart = i.from;
    runEnd = i.to;

    const length = runEnd - runStart;
    if (length > best.ms) best = { ms: length, endedAt: runEnd };
  }

  return best.ms > 0 ? best : null;
}

// Summan av spelare gånger tid — hur mycket vikingaliv servern faktiskt burit.
function playerHoursMs(intervals: readonly Interval[]): number {
  return intervals.reduce((sum, i) => sum + i.players * (i.to - i.from), 0);
}

// När på veckan det brukar vara folk. Nyckeln är veckodag och timme, värdet
// hur många gubbtimmar som lagts där.
//
// Ett intervall bokförs på timmen det börjar i, även om det sträcker sig över
// ett timskifte. Med pulsrader var femte minut är felet som mest några minuter
// på fel sida, vilket inte flyttar vilken timme som är veckans livligaste.
function busiestSlots(intervals: readonly Interval[]): { label: string; ms: number }[] {
  const slots = new Map<string, number>();
  for (const i of intervals) {
    if (i.players === 0) continue;
    const { day, hour } = dayAndHour(i.from);
    const label = `${day} ${String(hour).padStart(2, "0")}–${String((hour + 1) % 24).padStart(2, "0")}`;
    slots.set(label, (slots.get(label) ?? 0) + i.players * (i.to - i.from));
  }
  return [...slots]
    .map(([label, ms]) => ({ label, ms }))
    .sort((a, b) => b.ms - a.ms);
}

// Kvällarna med flest inne samtidigt, en rad per dygn så att listan inte fylls
// av samma kväll om och om igen.
function peakPerDay(intervals: readonly Interval[]): { label: string; players: number }[] {
  const byDay = new Map<string, number>();
  for (const i of intervals) {
    if (i.players === 0) continue;
    const key = new Date(i.from).toDateString();
    byDay.set(key, Math.max(byDay.get(key) ?? 0, i.players));
  }
  return [...byDay]
    .map(([key, players]) => ({ label: dateLabel(new Date(key).getTime()), players }))
    .sort((a, b) => b.players - a.players);
}

export function valheimHighlights(samples: readonly ValheimSample[]): StatHighlight[] {
  const intervals = toIntervals(samples);
  if (intervals.length === 0) return [];

  const highlights: StatHighlight[] = [];

  const top = peak(intervals);
  if (top && top.players > 0) {
    const days = peakPerDay(intervals);
    highlights.push({
      ...GAME,
      label: "Flest inne samtidigt",
      value: String(top.players),
      holder: dateLabel(top.from),
      detail: `${dayAndHour(top.from).day} kväll, som mest ${top.players} på servern`,
      standings: days.slice(0, 5).map((d) => ({ name: d.label, value: `${d.players} inne` })),
    });
  }

  const uptime = longestUptime(intervals);
  if (uptime) {
    highlights.push({
      ...GAME,
      label: "Längsta uptime",
      value: formatHours(uptime.ms),
      holder: "Garageservern",
      detail: `obrutet fram till ${dateLabel(uptime.endedAt)}`,
      standings: [],
    });
  }

  const gubbtimmar = playerHoursMs(intervals);
  if (gubbtimmar > 0) {
    highlights.push({
      ...GAME,
      label: "Gubbtimmar i Valheim",
      value: formatHours(gubbtimmar),
      holder: "Hela klanen",
      detail: "spelare gånger tid, summerat sedan mätningen började",
      standings: [],
    });
  }

  const slots = busiestSlots(intervals);
  const best = slots[0];
  if (best) {
    highlights.push({
      ...GAME,
      label: "Primetime",
      value: best.label,
      holder: "Då är det liv",
      detail: "veckans mest befolkade timme på servern",
      standings: slots.slice(0, 5).map((s) => ({ name: s.label, value: formatHours(s.ms) })),
    });
  }

  return highlights;
}
