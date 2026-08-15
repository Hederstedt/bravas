import { config } from "./config.ts";
import { broadcast } from "./events.ts";
import {
  DISCORD_UNAVAILABLE,
  fetchDiscordWidget,
  type DiscordStatus,
} from "./discordWidget.ts";

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

export async function pollOnce(): Promise<void> {
  if (await refreshDiscordStatus()) broadcast("discord", snapshot);
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
