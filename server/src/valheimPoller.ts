import { config } from "./config.ts";
import { broadcast } from "./events.ts";
import { lastValheimSample, recordValheimSample } from "./db.ts";
import { HEARTBEAT_MS } from "./valheimHistory.ts";
import { queryValheimServer, type ValheimStatus } from "./valheimQuery.ts";

export const POLL_MS = 45_000;

const OFFLINE: ValheimStatus = { online: false, players: null, maxPlayers: null };

// Ögonblicksbilden ägs här, inte per besökare — samma resonemang som
// presencePoller: en fråga mot spelservern var 45:e sekund, alla läser samma svar.
let snapshot: ValheimStatus = OFFLINE;
let polled = false;
let timer: NodeJS.Timeout | null = null;

export function currentValheimStatus(): ValheimStatus {
  return snapshot;
}

// Skiljer "aldrig frågad än" från "frågad och bekräftat nere" — offline är ett
// giltigt normalläge för spelservern, till skillnad från presence där en tom
// ögonblicksbild bara förekommer precis efter omstart.
export function hasPolledOnce(): boolean {
  return polled;
}

export function valheimStatusChanged(before: ValheimStatus, after: ValheimStatus): boolean {
  return (
    before.online !== after.online ||
    before.players !== after.players ||
    before.maxPlayers !== after.maxPlayers
  );
}

// Sparar avläsningen när något ändrats, och annars med jämna mellanrum. Pulsen
// är det som gör tiden mätbar: mellan två rader vet vi vad som gällde, och ett
// glapp större än pulsen betyder att API:et var nere — då räknas inte tiden
// alls i statistiken. Utan pulsraderna hade en vecka utan omstart bokförts som
// en enda lång stund i det läge servern råkade ha när sista raden skrevs.
function remember(status: ValheimStatus, at: number): void {
  const last = lastValheimSample();
  const changed =
    !last || (last.online === 1) !== status.online || last.players !== (status.players ?? 0);

  if (changed || at - last.at >= HEARTBEAT_MS) {
    recordValheimSample(at, status.online, status.players ?? 0);
  }
}

export async function refreshValheimStatus(): Promise<boolean> {
  const next = await queryValheimServer(config.valheimQueryHost, config.valheimQueryPort);
  const changed = valheimStatusChanged(snapshot, next);
  snapshot = next;
  polled = true;
  remember(next, Date.now());
  return changed;
}

export async function pollOnce(): Promise<void> {
  if (await refreshValheimStatus()) broadcast("valheim", snapshot);
}

// Startas från index.ts, inte från createApp: annars hade varje testfil som
// bygger en app dragit igång en bakgrundstimer och UDP-anrop mot spelservern.
export function startValheimPolling(intervalMs = POLL_MS): void {
  if (timer) return;
  void pollOnce();
  timer = setInterval(() => void pollOnce(), intervalMs);
  timer.unref?.();
}

export function stopValheimPolling(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

// Bara för tester — låter dem börja från ett känt läge.
export function resetValheimSnapshot(): void {
  snapshot = OFFLINE;
  polled = false;
}
