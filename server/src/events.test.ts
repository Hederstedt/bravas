import { afterEach, describe, expect, it } from "vitest";
import {
  broadcast,
  closeAllSubscribers,
  formatEvent,
  heartbeatRefd,
  HEARTBEAT_MS,
  MAX_CONNECTIONS_PER_IP,
  runHeartbeat,
  subscribe,
  subscriberCount,
} from "./events.ts";

afterEach(() => {
  closeAllSubscribers();
});

// En minimal prenumerant som bara samlar det som skrivs till den.
function fakeClient(ip = "1.2.3.4") {
  const written: string[] = [];
  const unsubscribe = subscribe({ ip, write: (chunk) => (written.push(chunk), true) });
  return { written, unsubscribe };
}

describe("formatEvent", () => {
  it("writes a named SSE frame that ends with a blank line", () => {
    // Utan den avslutande tomraden levererar webbläsaren aldrig händelsen.
    expect(formatEvent("quote", { id: 1 })).toBe('event: quote\ndata: {"id":1}\n\n');
  });

  it("keeps the payload on a single line", () => {
    // En radbrytning mitt i data-fältet skulle tolkas som två fält.
    const frame = formatEvent("presence", { text: "två\nrader" });
    const dataLines = frame.split("\n").filter((l) => l.startsWith("data:"));
    expect(dataLines).toHaveLength(1);
  });
});

describe("subscribe and broadcast", () => {
  it("delivers an event to every open client", () => {
    const a = fakeClient();
    const b = fakeClient("5.6.7.8");

    broadcast("quote", { id: 7 });

    expect(a.written).toEqual([formatEvent("quote", { id: 7 })]);
    expect(b.written).toEqual([formatEvent("quote", { id: 7 })]);
  });

  it("stops delivering once a client unsubscribes", () => {
    const a = fakeClient();
    a.unsubscribe();

    broadcast("quote", { id: 1 });

    expect(a.written).toEqual([]);
    expect(subscriberCount()).toBe(0);
  });

  it("survives a client whose socket has already gone away", () => {
    // En död anslutning får inte hindra de andra från att få sin händelse.
    subscribe({ ip: "1.1.1.1", write: () => { throw new Error("socket closed"); } });
    const good = fakeClient("2.2.2.2");

    expect(() => broadcast("quote", { id: 2 })).not.toThrow();
    expect(good.written).toHaveLength(1);
  });

  it("drops a client that fails to write instead of keeping it forever", () => {
    subscribe({ ip: "1.1.1.1", write: () => { throw new Error("socket closed"); } });
    expect(subscriberCount()).toBe(1);

    broadcast("quote", { id: 3 });

    expect(subscriberCount()).toBe(0);
  });

  it("counts nothing after everything is closed", () => {
    fakeClient();
    fakeClient();
    expect(subscriberCount()).toBe(2);

    closeAllSubscribers();
    expect(subscriberCount()).toBe(0);
  });
});

describe("connection limits", () => {
  // En SSE-anslutning är ett enda anrop som lever i timmar, så det vanliga
  // taket per minut säger ingenting. Det som ska begränsas är hur många
  // samtidiga strömmar en besökare håller öppna.
  it("refuses a client once one visitor holds too many streams open", () => {
    for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) {
      expect(subscribe({ ip: "9.9.9.9", write: () => true })).not.toBeNull();
    }
    expect(subscribe({ ip: "9.9.9.9", write: () => true })).toBeNull();
  });

  it("counts the limit per visitor, not across everyone", () => {
    for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) {
      subscribe({ ip: "9.9.9.9", write: () => true });
    }
    expect(subscribe({ ip: "8.8.8.8", write: () => true })).not.toBeNull();
  });

  it("frees the slot again when a stream closes", () => {
    const first = subscribe({ ip: "9.9.9.9", write: () => true })!;
    for (let i = 1; i < MAX_CONNECTIONS_PER_IP; i++) {
      subscribe({ ip: "9.9.9.9", write: () => true });
    }
    expect(subscribe({ ip: "9.9.9.9", write: () => true })).toBeNull();

    first();
    expect(subscribe({ ip: "9.9.9.9", write: () => true })).not.toBeNull();
  });
});

describe("heartbeat", () => {
  it("sends a comment line, which browsers ignore but proxies count as traffic", () => {
    // Utan den stänger nginx och Cloudflare en tyst ström efter en stund.
    const client = fakeClient();
    runHeartbeat();
    expect(client.written).toEqual([": ping\n\n"]);
  });

  it("fires often enough to stay under the usual proxy idle timeout", () => {
    expect(HEARTBEAT_MS).toBeLessThan(60_000);
  });

  it("does not hold the process open between beats", () => {
    // Ett vanligt setInterval hade hållit både servern och testkörningen vid
    // liv tills timeout.
    fakeClient();
    expect(heartbeatRefd()).toBe(false);
  });

  it("only beats while someone is listening", () => {
    expect(heartbeatRefd()).toBeNull();

    const client = fakeClient();
    expect(heartbeatRefd()).toBe(false);

    client.unsubscribe();
    expect(heartbeatRefd()).toBeNull();
  });
});
