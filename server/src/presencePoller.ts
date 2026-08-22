import { lastPresenceSample, listMembers, recordPresenceSample } from "./db.ts";
import { broadcast } from "./events.ts";
import { fetchPresence, type Presence } from "./presence.ts";
import { HEARTBEAT_MS } from "./sampleSpans.ts";

export const POLL_MS = 45_000;

// Ögonblicksbilden ägs här i stället för att hämtas per besökare. Tidigare
// utlöste varje sidladdning ett eget anrop mot Steam; nu frågar en poller och
// alla läser samma svar.
let snapshot: Record<string, Presence> = {};
let timer: NodeJS.Timeout | null = null;

export function currentPresence(): Record<string, Presence> {
  return snapshot;
}

// snapshot är nyckla på steamid64 internt (det är vad Steams API pratar) —
// både GET /api/presence och SSE-strömmen ska visa ett opakt id i stället,
// samma id som GET /api/members ger samma medlem. Delad av båda i stället
// för att var och en gör sin egen översättning, för att de aldrig ska kunna
// glida isär.
export function publicPresence(): Record<string, Presence> {
  const publicIdBySteamid64 = new Map(listMembers().map((m) => [m.steamid64, m.public_id]));
  const result: Record<string, Presence> = {};
  for (const [steamid64, presence] of Object.entries(snapshot)) {
    const publicId = publicIdBySteamid64.get(steamid64);
    if (publicId) result[publicId] = presence;
  }
  return result;
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
  } catch (err) {
    // Presence är dekoration. Ett avbrott mot Steam ska lämna kvar den senaste
    // kända bilden, inte tömma rostern — men det ska synas i loggen. Utgången
    // API-nyckel frös annars prickarna för alltid utan ett enda spår.
    console.warn(`presence: kunde inte nå Steam — behåller senaste bilden. ${String(err)}`);
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
  remember(next, Date.now());
  return changed;
}

// Sparar vem som är inne i vilket spel. En rad när spelet byts, plus en
// pulsrad med jämna mellanrum så att tiden går att mäta — samma regel som
// valheimPoller, av samma skäl.
//
// Bara den som faktiskt är i ett spel loggas. "Online men står i menyn" är
// inte aktivitet och ska inte ge managerpoäng.
function remember(presence: Record<string, Presence>, at: number): void {
  for (const [steamid64, p] of Object.entries(presence)) {
    if (p.status !== "in-game" || !p.game) continue;

    const last = lastPresenceSample(steamid64);
    if (!last || last.game !== p.game || at - last.at >= HEARTBEAT_MS) {
      recordPresenceSample(at, steamid64, p.game);
    }
  }
}

export async function pollOnce(): Promise<void> {
  if (await refreshPresence()) broadcast("presence", { presence: publicPresence() });
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
