import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLoginRedirectUrl, verifyCallback } from "./steamAuth.ts";

const VALID_CLAIMED_ID = "https://steamcommunity.com/openid/id/76561198060166361";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildLoginRedirectUrl", () => {
  it("points at Steam and carries the return_to url", () => {
    const url = new URL(buildLoginRedirectUrl("https://bravas.test/api/auth/steam/callback"));
    expect(url.origin + url.pathname).toBe("https://steamcommunity.com/openid/login");
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.return_to")).toBe("https://bravas.test/api/auth/steam/callback");
    expect(url.searchParams.get("openid.realm")).toBe("https://bravas.test");
  });
});

describe("verifyCallback", () => {
  it("returns the steamid64 when Steam confirms the assertion", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n")
    );
    await expect(verifyCallback({ "openid.claimed_id": VALID_CLAIMED_ID })).resolves.toBe("76561198060166361");
  });

  it("returns null when Steam rejects the assertion", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("is_valid:false\n"));
    await expect(verifyCallback({ "openid.claimed_id": VALID_CLAIMED_ID })).resolves.toBeNull();
  });

  it("rejects a claimed_id from another host without calling Steam", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      verifyCallback({ "openid.claimed_id": "https://evil.example/openid/id/76561198060166361" })
    ).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a claimed_id that is not a 17-digit id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      verifyCallback({ "openid.claimed_id": "https://steamcommunity.com/openid/id/123" })
    ).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when claimed_id is absent", async () => {
    await expect(verifyCallback({})).resolves.toBeNull();
  });
});
