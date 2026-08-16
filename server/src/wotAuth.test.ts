import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLoginRedirectUrl, verifyCallback } from "./wotAuth.ts";

function accountInfo(accountId: string, nickname: string) {
  return new Response(
    JSON.stringify({ status: "ok", data: { [accountId]: { account_id: Number(accountId), nickname } } }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildLoginRedirectUrl", () => {
  it("points at Wargaming's login wrapper and carries the redirect_uri", () => {
    const url = new URL(buildLoginRedirectUrl("https://bravas.test/api/members/wot/callback"));
    expect(url.origin + url.pathname).toBe("https://api.worldoftanks.eu/wot/auth/login/");
    expect(url.searchParams.get("redirect_uri")).toBe("https://bravas.test/api/members/wot/callback");
    expect(url.searchParams.get("application_id")).toBeTruthy();
  });
});

describe("verifyCallback", () => {
  it("confirms the account_id against Wargaming before trusting it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(accountInfo("500123456", "GubbeIRL"));

    const result = await verifyCallback({ status: "ok", account_id: "500123456", access_token: "tok_abc" });

    expect(result).toEqual({ accountId: "500123456", nickname: "GubbeIRL" });
    const calledUrl = new URL(String(fetchSpy.mock.calls[0]![0]));
    expect(calledUrl.searchParams.get("access_token")).toBe("tok_abc");
    expect(calledUrl.searchParams.get("account_id")).toBe("500123456");
  });

  it("rejects without calling Wargaming when the redirect itself says it failed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(verifyCallback({ status: "error" })).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects when account_id or access_token is missing from the redirect", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(verifyCallback({ status: "ok", account_id: "500123456" })).resolves.toBeNull();
    await expect(verifyCallback({ status: "ok", access_token: "tok_abc" })).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects when Wargaming can't confirm the access_token owns that account", async () => {
    // En förfalskad callback rakt mot vår URL, utan en riktig inloggning bakom.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "error", error: { message: "INVALID_ACCESS_TOKEN" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      verifyCallback({ status: "ok", account_id: "500123456", access_token: "forged" })
    ).resolves.toBeNull();
  });

  it("rejects when Wargaming is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
    await expect(
      verifyCallback({ status: "ok", account_id: "500123456", access_token: "tok_abc" })
    ).resolves.toBeNull();
  });
});
