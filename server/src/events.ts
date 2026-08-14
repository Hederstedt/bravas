// Server-Sent Events: servern knuffar, webbläsaren lyssnar. Trafiken går bara
// åt ett håll — ett nytt citat, någon som startat ett spel — så websockets vore
// att betala för en returkanal vi inte har. EventSource återansluter dessutom
// själv, vilket vi annars hade fått bygga.

export const HEARTBEAT_MS = 25_000;

// En SSE-anslutning är ett enda anrop som lever i timmar, så taket per minut i
// rateLimit säger ingenting om den. Det som behöver begränsas är hur många
// samtidiga strömmar en och samma besökare håller öppna — några flikar ska
// fungera, hundra ska inte.
export const MAX_CONNECTIONS_PER_IP = 4;

export type EventName = "quote" | "presence" | "league" | "transfer" | "training" | "valheim";

export interface Subscriber {
  ip: string;
  // Returnerar false när mottagarens buffert är full; kastar när uttaget är
  // borta. Båda betyder att prenumeranten ska bort.
  write: (chunk: string) => boolean;
}

interface Entry extends Subscriber {
  id: number;
}

const subscribers = new Map<number, Entry>();
let nextId = 1;
let heartbeat: NodeJS.Timeout | null = null;

// Ett fält per rad och en tom rad på slutet — utan den levererar webbläsaren
// aldrig händelsen. JSON.stringify escapar radbrytningar, så nyttolasten kan
// inte råka bryta formatet.
export function formatEvent(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function connectionsFrom(ip: string): number {
  let n = 0;
  for (const s of subscribers.values()) if (s.ip === ip) n++;
  return n;
}

function startHeartbeat(): void {
  if (heartbeat) return;
  heartbeat = setInterval(runHeartbeat, HEARTBEAT_MS);
  // Utan unref håller intervallet både servern och testkörningen vid liv.
  heartbeat.unref?.();
}

function stopHeartbeatWhenIdle(): void {
  if (subscribers.size > 0 || !heartbeat) return;
  clearInterval(heartbeat);
  heartbeat = null;
}

// Returnerar null när besökaren redan håller för många strömmar öppna.
export function subscribe(sub: Subscriber): (() => void) | null {
  if (connectionsFrom(sub.ip) >= MAX_CONNECTIONS_PER_IP) return null;

  const id = nextId++;
  subscribers.set(id, { ...sub, id });
  startHeartbeat();

  return () => {
    subscribers.delete(id);
    stopHeartbeatWhenIdle();
  };
}

// En prenumerant vars uttag försvunnit får inte hindra de andra från att få
// sin händelse, och ska inte ligga kvar och samla damm.
function send(chunk: string): void {
  for (const [id, sub] of [...subscribers]) {
    try {
      if (!sub.write(chunk)) subscribers.delete(id);
    } catch {
      subscribers.delete(id);
    }
  }
  stopHeartbeatWhenIdle();
}

export function broadcast(name: EventName, data: unknown): void {
  send(formatEvent(name, data));
}

// En kommentarsrad. Webbläsaren struntar i den, men nginx och Cloudflare räknar
// den som trafik och låter därmed bli att stänga en ström som varit tyst.
export function runHeartbeat(): void {
  send(": ping\n\n");
}

export function subscriberCount(): number {
  return subscribers.size;
}

export function heartbeatRefd(): boolean | null {
  return heartbeat ? (heartbeat.hasRef?.() ?? null) : null;
}

export function closeAllSubscribers(): void {
  subscribers.clear();
  stopHeartbeatWhenIdle();
}
