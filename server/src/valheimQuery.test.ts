import dgram from "node:dgram";
import { afterEach, describe, expect, it } from "vitest";
import { parseA2sInfoResponse, queryValheimServer } from "./valheimQuery.ts";

// Riktigt svar, infångat mot vår egen Valheim-server (A2S_INFO, källport 2457).
// Namn "Bravas", karta "Bravas", mapp "valheim", 0/10 spelare, lösenordsskyddad.
const REAL_A2S_INFO_RESPONSE = Buffer.from(
  "ffffffff4911427261766173004272617661730076616c6865696d000000000" +
    "00a00646c0100312e302e302e3000b1980908c4617b1ac74001673d302e32323" +
    "12e31322c6e3d33362c6d3d002aa00d0000000000",
  "hex"
);

describe("parseA2sInfoResponse", () => {
  it("reads player counts from a real server response", () => {
    expect(parseA2sInfoResponse(REAL_A2S_INFO_RESPONSE)).toEqual({ players: 0, maxPlayers: 10 });
  });

  it("returns null for garbage that isn't an A2S_INFO reply", () => {
    expect(parseA2sInfoResponse(Buffer.from("nope"))).toBeNull();
    expect(parseA2sInfoResponse(Buffer.alloc(0))).toBeNull();
  });

  it("returns null for a truncated response instead of throwing", () => {
    expect(parseA2sInfoResponse(REAL_A2S_INFO_RESPONSE.subarray(0, 10))).toBeNull();
  });
});

describe("queryValheimServer", () => {
  let server: dgram.Socket | null = null;

  afterEach(async () => {
    if (!server) return;
    await new Promise((resolve) => server!.close(resolve));
    server = null;
  });

  function fakeServer(respond: (msg: Buffer, rinfo: dgram.RemoteInfo) => void): Promise<number> {
    return new Promise((resolve) => {
      server = dgram.createSocket("udp4");
      server.on("message", respond);
      server.bind(0, "127.0.0.1", () => resolve((server!.address() as dgram.AddressInfo).port));
    });
  }

  it("reports online with the player counts when the server answers directly", async () => {
    const port = await fakeServer((_msg, rinfo) => {
      server!.send(REAL_A2S_INFO_RESPONSE, rinfo.port, rinfo.address);
    });

    const status = await queryValheimServer("127.0.0.1", port);
    expect(status).toEqual({ online: true, players: 0, maxPlayers: 10 });
  });

  // Frågad över nätet (i stället för loopback på servern själv) svarar Valheim
  // först med en A2S-challenge (typ 'A' + 4 bytes) som anti-spoofing-skydd.
  // Riktiga svaret kommer först när samma fråga skickas igen med challengen
  // bifogad — upptäcktes genom att faktiskt testa mot servern över Tailscale,
  // inte bara mot localhost.
  it("redoes the query with the challenge when the server asks for one", async () => {
    const CHALLENGE = Buffer.from("ffffffff413447f2fe", "hex");
    let calls = 0;
    const port = await fakeServer((msg, rinfo) => {
      calls++;
      if (calls === 1) {
        server!.send(CHALLENGE, rinfo.port, rinfo.address);
        return;
      }
      // Andra frågan ska bära challengen den fick tillbaka.
      expect(msg.subarray(-4)).toEqual(CHALLENGE.subarray(-4));
      server!.send(REAL_A2S_INFO_RESPONSE, rinfo.port, rinfo.address);
    });

    const status = await queryValheimServer("127.0.0.1", port);
    expect(status).toEqual({ online: true, players: 0, maxPlayers: 10 });
    expect(calls).toBe(2);
  });

  it("reports offline when nothing answers before the timeout", async () => {
    // Ingen fejkserver startad — porten är stängd, inget svar kommer.
    const status = await queryValheimServer("127.0.0.1", 1, 50);
    expect(status).toEqual({ online: false, players: null, maxPlayers: null });
  });

  it("reports offline when the reply is garbage rather than an A2S_INFO frame", async () => {
    const port = await fakeServer((_msg, rinfo) => {
      server!.send(Buffer.from("not a real reply"), rinfo.port, rinfo.address);
    });

    const status = await queryValheimServer("127.0.0.1", port, 500);
    expect(status).toEqual({ online: false, players: null, maxPlayers: null });
  });
});
