import dgram from "node:dgram";

export interface ValheimStatus {
  online: boolean;
  players: number | null;
  maxPlayers: number | null;
}

const OFFLINE: ValheimStatus = { online: false, players: null, maxPlayers: null };

// Steams Source-frågeprotokoll (A2S_INFO). Valheim exponerar det på query-porten
// (spelport + 1) trots att det inte är ett Source-spel — samma protokoll som
// CS2-servrar svarar på.
const A2S_INFO_REQUEST = Buffer.concat([
  Buffer.from([0xff, 0xff, 0xff, 0xff]),
  Buffer.from("TSource Engine Query\0", "ascii"),
]);

function readCString(buf: Buffer, offset: number): number {
  const end = buf.indexOf(0, offset);
  if (end === -1) throw new Error("unterminated string in A2S_INFO response");
  return end + 1;
}

// Ren funktion, separat från själva UDP-anropet, så tolkningen går att testa
// mot infångade byte för byte utan att öppna ett riktigt uttag.
export function parseA2sInfoResponse(buf: Buffer): { players: number; maxPlayers: number } | null {
  try {
    if (buf.length < 6 || buf.readInt32LE(0) !== -1 || buf[4] !== 0x49) return null;

    let offset = 6; // förbi FF FF FF FF, 'I', protokollbyte
    offset = readCString(buf, offset); // name
    offset = readCString(buf, offset); // map
    offset = readCString(buf, offset); // folder
    offset = readCString(buf, offset); // game
    offset += 2; // Steam appid

    const players = buf[offset];
    const maxPlayers = buf[offset + 1];
    if (players === undefined || maxPlayers === undefined) return null;

    return { players, maxPlayers };
  } catch {
    return null;
  }
}

// Frågad över nätet (till skillnad från loopback på servern själv) svarar
// Valheim först med en A2S-challenge som anti-spoofing-skydd (header 'A' +
// 4-byte challenge), inte med själva infon. Rätt svar kommer först när samma
// fråga skickas igen med challengen bifogad i slutet.
function isChallengeResponse(buf: Buffer): Buffer | null {
  if (buf.length !== 9 || buf.readInt32LE(0) !== -1 || buf[4] !== 0x41) return null;
  return buf.subarray(5, 9);
}

export function queryValheimServer(host: string, port: number, timeoutMs = 3000): Promise<ValheimStatus> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;

    const finish = (status: ValheimStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(status);
    };

    const timer = setTimeout(() => finish(OFFLINE), timeoutMs);
    timer.unref?.();

    socket.once("error", () => finish(OFFLINE));
    socket.on("message", (msg) => {
      const challenge = isChallengeResponse(msg);
      if (challenge) {
        socket.send(Buffer.concat([A2S_INFO_REQUEST, challenge]), port, host);
        return;
      }

      const parsed = parseA2sInfoResponse(msg);
      finish(parsed ? { online: true, players: parsed.players, maxPlayers: parsed.maxPlayers } : OFFLINE);
    });

    socket.send(A2S_INFO_REQUEST, port, host);
  });
}
