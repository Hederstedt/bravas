import { describe, expect, it } from "vitest";
import {
  cookieSecureFor,
  createSessionCookieValue,
  needsRenewal,
  readSessionCookieValue,
  sessionCookie,
  verifySessionCookieValue,
} from "./session.ts";

const STEAMID = "76561198060166361";
const DAY = 24 * 60 * 60 * 1000;

describe("session cookie", () => {
  it("round-trips a steamid64", () => {
    const value = createSessionCookieValue(STEAMID);
    expect(verifySessionCookieValue(value)).toBe(STEAMID);
  });

  it("rejects a missing cookie", () => {
    expect(verifySessionCookieValue(undefined)).toBeNull();
    expect(verifySessionCookieValue("")).toBeNull();
  });

  it("rejects a malformed cookie", () => {
    expect(verifySessionCookieValue("garbage")).toBeNull();
    expect(verifySessionCookieValue("only.two.parts.here")).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const [, signature] = createSessionCookieValue(STEAMID).split(".");
    const forged = Buffer.from(JSON.stringify({ sid: "76561190000000000", exp: Date.now() + 1000 })).toString(
      "base64url"
    );
    expect(verifySessionCookieValue(`${forged}.${signature}`)).toBeNull();
  });

  it("rejects an expired session", () => {
    const expired = Buffer.from(JSON.stringify({ sid: STEAMID, exp: Date.now() - 1 })).toString("base64url");
    const value = createSessionCookieValue(STEAMID);
    const signature = value.split(".")[1];
    expect(verifySessionCookieValue(`${expired}.${signature}`)).toBeNull();
  });
});

describe("readSessionCookieValue", () => {
  it("returns both who the session is for and when it runs out", () => {
    const issuedAt = Date.now();
    const session = readSessionCookieValue(createSessionCookieValue(STEAMID, issuedAt));

    expect(session?.steamid64).toBe(STEAMID);
    expect(session?.expiresAt).toBe(issuedAt + sessionCookie.maxAgeMs);
  });

  it("rejects everything verifySessionCookieValue rejects", () => {
    expect(readSessionCookieValue(undefined)).toBeNull();
    expect(readSessionCookieValue("garbage")).toBeNull();
  });
});

describe("needsRenewal", () => {
  // Kakan förnyas först när mer än halva livslängden gått. Att sätta om den vid
  // varje anrop vore gratis att implementera men skulle skicka en Set-Cookie på
  // varenda sidladdning.
  const issuedAt = Date.now();
  const session = { steamid64: STEAMID, expiresAt: issuedAt + sessionCookie.maxAgeMs };

  it("leaves a fresh session alone", () => {
    expect(needsRenewal(session, issuedAt)).toBe(false);
    expect(needsRenewal(session, issuedAt + 14 * DAY)).toBe(false);
  });

  it("renews once past the halfway mark", () => {
    expect(needsRenewal(session, issuedAt + 16 * DAY)).toBe(true);
    expect(needsRenewal(session, issuedAt + 29 * DAY)).toBe(true);
  });

  it("does not renew a session that already ran out", () => {
    // Den är ändå ogiltig — att förnya den vore att återuppliva en död session.
    expect(needsRenewal(session, issuedAt + 31 * DAY)).toBe(false);
  });
});

describe("cookieSecureFor", () => {
  it("keeps the Secure flag on for any real origin", () => {
    expect(cookieSecureFor("https://bravas.se")).toBe(true);
    // Även om någon råkar sätta http i produktion ska flaggan stå kvar.
    expect(cookieSecureFor("http://bravas.se")).toBe(true);
  });

  it("relaxes it only for localhost, where the browser refuses to store it", () => {
    expect(cookieSecureFor("http://localhost:5173")).toBe(false);
    expect(cookieSecureFor("http://127.0.0.1:5173")).toBe(false);
  });

  it("falls back to secure when the origin is unparseable", () => {
    expect(cookieSecureFor("inte-en-url")).toBe(true);
  });
});
