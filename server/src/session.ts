import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.ts";

const COOKIE_NAME = "bvs_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface SessionPayload {
  sid: string; // steamid64
  exp: number;
}

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

export function createSessionCookieValue(steamid64: string): string {
  const payload: SessionPayload = { sid: steamid64, exp: Date.now() + MAX_AGE_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionCookieValue(value: string | undefined): string | null {
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
    return payload.sid;
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: COOKIE_NAME,
  maxAgeMs: MAX_AGE_MS,
};
