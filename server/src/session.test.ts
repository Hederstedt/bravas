import { describe, expect, it } from "vitest";
import { createSessionCookieValue, verifySessionCookieValue } from "./session.ts";

const STEAMID = "76561198060166361";

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
