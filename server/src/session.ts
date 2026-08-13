import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.ts";

const COOKIE_NAME = "bvs_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface SessionPayload {
  sid: string; // steamid64
  exp: number;
}

export interface Session {
  steamid64: string;
  expiresAt: number;
}

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

export function createSessionCookieValue(steamid64: string, now = Date.now()): string {
  const payload: SessionPayload = { sid: steamid64, exp: now + MAX_AGE_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function readSessionCookieValue(value: string | undefined): Session | null {
  if (!value) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return { steamid64: payload.sid, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

export function verifySessionCookieValue(value: string | undefined): string | null {
  return readSessionCookieValue(value)?.steamid64 ?? null;
}

// Glidande session: den som fortsätter besöka sidan ska aldrig loggas ut. Kakan
// sätts om först när mer än halva livslängden gått — att förnya vid varje anrop
// vore lika enkelt men skulle skicka en Set-Cookie på varenda sidladdning.
export function needsRenewal(session: Session, now = Date.now()): boolean {
  const remaining = session.expiresAt - now;
  if (remaining <= 0) return false; // redan ogiltig, ska inte återupplivas
  return remaining < MAX_AGE_MS / 2;
}

// Secure-flaggan kan inte vara hårdkodad: på http://localhost vägrar webbläsaren
// spara en Secure-kaka, och då går det inte att vara inloggad lokalt. Bara
// localhost slipper undan — en felkonfigurerad http-origin i drift ska inte
// tyst göra sessionskakan osäker.
export function cookieSecureFor(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]";
  } catch {
    return true;
  }
}

// En enda källa för kakans inställningar. Låg de duplicerade mellan inloggning
// och förnyelse skulle de förr eller senare glida isär, och en kaka satt med
// olika flaggor ersätter inte den gamla utan lägger sig bredvid.
export const sessionCookie = {
  name: COOKIE_NAME,
  maxAgeMs: MAX_AGE_MS,
  options: {
    httpOnly: true,
    secure: cookieSecureFor(config.publicOrigin),
    sameSite: "lax" as const,
    maxAge: MAX_AGE_MS,
    path: "/",
  },
};
