import { listMembers } from "./db.ts";
import { broadcast } from "./events.ts";
import { fetchPresence, type Presence } from "./presence.ts";

export const POLL_MS = 45_000;

// Ögonblicksbilden ägs här i stället för att hämtas per besökare. Tidigare
// utlöste varje sidladdning ett eget anrop mot Steam; nu frågar en poller och
// alla läser samma svar.
let snapshot: Record<string, Presence> = {};
let timer: NodeJS.Timeout | null = null;

export function currentPresence(): Record<string, Presence> {
  return snapshot;
}

// Bara skillnader är värda en händelse. Utan jämförelsen hade varje poll
// väckt alla öppna flikar var 45:e sekund trots att ingenting hänt.
export function presenceChanged(
  before: Record<string, Presence>,
  after: Record<string, Presence>
): boolean {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const id of ids) {
    const a = before[id];
    const b = after[id];
    if (!a || !b) return true;
    if (a.status !== b.status || a.game !== b.game) return true;
  }
  return false;
}

export async function refreshPresence(): Promise<boolean> {
  const steamids = listMembers().map((m) => m.steamid64);
  if (steamids.length === 0) {
    const changed = presenceChanged(snapshot, {});
    snapshot = {};
    return changed;
  }

  let byId: Map<string, Presence>;
  try {
    byId = await fetchPresence(steamids);
  } catch {
    // Presence är dekoration. Ett avbrott mot Steam ska lämna kvar den senaste
    // kända bilden, inte tömma rostern.
    return false;
  }

  // Svaret drivs av vår egen medlemslista så att Steam aldrig kan lägga till
  // någon som inte står på rostern.
  const next: Record<string, Presence> = {};
  for (const id of steamids) {
    const p = byId.get(id);
    if (p) next[id] = p;
  }

  const changed = presenceChanged(snapshot, next);
  snapshot = next;
  return changed;
}

export async function pollOnce(): Promise<void> {
  if (await refreshPresence()) broadcast("presence", { presence: snapshot });
}

// Startas från index.ts, inte från createApp: annars hade varje testfil som
// bygger en app dragit igång en bakgrundstimer och anrop mot Steam.
export function startPresencePolling(intervalMs = POLL_MS): void {
  if (timer) return;
  void pollOnce();
  timer = setInterval(() => void pollOnce(), intervalMs);
  timer.unref?.();
}

export function stopPresencePolling(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

// Bara för tester — låter dem börja från ett känt läge.
export function resetPresenceSnapshot(): void {
  snapshot = {};
}
