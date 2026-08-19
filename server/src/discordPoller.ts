import { config } from "./config.ts";
import { lastDiscordSample, listMembers, recordDiscordSample } from "./db.ts";
import { broadcast } from "./events.ts";
import {
  DISCORD_UNAVAILABLE,
  fetchDiscordWidget,
  type DiscordStatus,
} from "./discordWidget.ts";
import { HEARTBEAT_MS } from "./sampleSpans.ts";

// Samma resonemang som presencePoller och valheimPoller: ett anrop utåt per
// intervall, alla besökare läser samma ögonblicksbild. Utan det hade varje
// sidladdning blivit ett anrop mot Discord.
export const POLL_MS = 60_000;

let snapshot: DiscordStatus = DISCORD_UNAVAILABLE;
let timer: NodeJS.Timeout | null = null;

export function currentDiscordStatus(): DiscordStatus {
  return snapshot;
}

// Namnlistan jämförs som helhet: en gubbe som byter från online till idle,
// eller startar ett spel, är en förändring värd att skicka ut.
export function discordStatusChanged(before: DiscordStatus, after: DiscordStatus): boolean {
  if (before.available !== after.available || before.online !== after.online) return true;
  if (before.members.length !== after.members.length) return true;
  return before.members.some((m, i) => {
    const other = after.members[i]!;
    return m.name !== other.name || m.status !== other.status || m.game !== other.game;
  });
}

export async function refreshDiscordStatus(): Promise<boolean> {
  const next = await fetchDiscordWidget(config.discordServerId);
  const changed = discordStatusChanged(snapshot, next);
  snapshot = next;
  return changed;
}

// Widgeten känner bara till Discords eget användarnamn — ingen stabil id-koppling
// till Steam finns. Länken är därför namnet gubben själv skrivit in
// (members.discord_name, se routes/members.ts), matchat löst: gemener, trimmat,
// och en eventuell "#1234"-diskriminator (gammal Discord-vana) struken från båda
// sidor innan jämförelsen.
function normalizeDiscordName(name: string): string {
  return name.trim().replace(/#\d{4}$/, "").toLowerCase();
}

export function discordNameMatches(discordName: string, widgetUsername: string): boolean {
  const normalized = normalizeDiscordName(discordName);
  return normalized.length > 0 && normalized === normalizeDiscordName(widgetUsername);
}

// Sparar vilka gubbar som syntes i widgeten just nu — en pulsrad med jämna
// mellanrum, samma regel som presencePoller. Egen tabell (discord_samples):
// se motiveringen i db.ts för varför det inte är en rad till i
// presence_samples. Bara den som länkat ett Discord-namn kan någonsin synas
// här — ingen länkning, ingen matchning.
function rememberDiscordPresence(status: DiscordStatus, at: number): void {
  if (!status.available || status.members.length === 0) return;

  for (const member of listMembers()) {
    if (!member.discord_name) continue;
    const seen = status.members.some((m) => discordNameMatches(member.discord_name!, m.name));
    if (!seen) continue;

    const last = lastDiscordSample(member.steamid64);
    if (!last || at - last.at >= HEARTBEAT_MS) {
      recordDiscordSample(at, member.steamid64);
    }
  }
}

export async function pollOnce(): Promise<void> {
  const at = Date.now();
  const changed = await refreshDiscordStatus();
  rememberDiscordPresence(snapshot, at);
  if (changed) broadcast("discord", snapshot);
}

// Startas från index.ts, inte från createApp — annars hade varje testfil som
// bygger en app dragit igång en timer och anrop mot Discord.
export function startDiscordPolling(intervalMs = POLL_MS): void {
  // Utan server-ID finns ingen widget att fråga efter, och då ska pollern inte
  // ens vakna.
  if (timer || !config.discordServerId) return;
  void pollOnce();
  timer = setInterval(() => void pollOnce(), intervalMs);
  timer.unref?.();
}

export function stopDiscordPolling(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

// Bara för tester — låter dem börja från ett känt läge.
export function resetDiscordSnapshot(): void {
  snapshot = DISCORD_UNAVAILABLE;
}
