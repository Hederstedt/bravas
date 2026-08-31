import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLoginRedirectUrl,
  pickMainCharacter,
  signState,
  verifyState,
  type WowCharacterSummary,
} from "./wowAuth.ts";

const MAG = "76561198053832683";
const KUNGALV = "76561198060166361";
const REDIRECT = "https://www.bravas.se/api/members/wow/callback";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildLoginRedirectUrl", () => {
  it("asks Blizzard for the WoW profile scope and nothing else", () => {
    const url = new URL(buildLoginRedirectUrl(REDIRECT, "state-123"));

    expect(url.origin + url.pathname).toBe("https://oauth.battle.net/authorize");
    expect(url.searchParams.get("scope")).toBe("wow.profile");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  // Hemligheten hör hemma i tokenutbytet, aldrig i en adress som går genom
  // besökarens webbläsare.
  it("never puts the client secret in the browser-visible URL", () => {
    expect(buildLoginRedirectUrl(REDIRECT, "s")).not.toContain("secret");
  });
});

// Utan state kan en angripare starta flödet med sitt eget Blizzard-konto och
// sedan lura en inloggad gubbe att besöka callback-adressen med angriparens
// kod — då hamnar angriparens karaktär på offrets kort. Callbacken kräver
// visserligen en session, men det är just en inloggad session angriparen
// utnyttjar. Staten binder flödet till den som startade det.
describe("state", () => {
  it("round-trips the member who started the flow", () => {
    expect(verifyState(signState(MAG), MAG)).toBe(true);
  });

  it("rejects a state minted for somebody else", () => {
    expect(verifyState(signState(KUNGALV), MAG)).toBe(false);
  });

  it("rejects a forged state", () => {
    expect(verifyState("inte.ensignatur", MAG)).toBe(false);
  });

  it("rejects a tampered payload that keeps the old signature", () => {
    const state = signState(MAG);
    const [, signature] = state.split(".");
    const forged = `${Buffer.from(JSON.stringify({ sid: KUNGALV, exp: Date.now() + 60000 })).toString("base64url")}.${signature}`;
    expect(verifyState(forged, KUNGALV)).toBe(false);
  });

  it("rejects a state that has expired", () => {
    const stale = signState(MAG, Date.now() - 60 * 60 * 1000);
    expect(verifyState(stale, MAG)).toBe(false);
  });

  it("rejects nothing at all", () => {
    expect(verifyState(undefined, MAG)).toBe(false);
    expect(verifyState("", MAG)).toBe(false);
  });
});

function character(over: Partial<WowCharacterSummary> = {}): WowCharacterSummary {
  return {
    id: 1,
    name: "Bravasdruid",
    realmSlug: "stormscale",
    level: 80,
    lastLogin: 0,
    ...over,
  };
}

describe("pickMainCharacter", () => {
  // Ett Battle.net-konto har ofta ett tjog karaktärer. Den som spelats senast
  // är i praktiken din main, och valet följer med av sig självt om du byter.
  it("picks the most recently played character", () => {
    const main = character({ id: 2, name: "Bravaspala", lastLogin: 5_000 });
    expect(
      pickMainCharacter([character({ id: 1, lastLogin: 1_000 }), main, character({ id: 3, lastLogin: 3_000 })])
    ).toEqual(main);
  });

  it("has nothing to pick from an empty account", () => {
    expect(pickMainCharacter([])).toBeNull();
  });

  // Deterministiskt även i det osannolika fallet att två delar tidsstämpel,
  // samma princip som kröningen: lägst id vinner.
  it("breaks a tie on the lowest character id", () => {
    const picked = pickMainCharacter([
      character({ id: 9, lastLogin: 5_000 }),
      character({ id: 4, lastLogin: 5_000 }),
    ]);
    expect(picked?.id).toBe(4);
  });

  // En karaktär utan inloggningsstämpel ska inte kunna vinna över en som har
  // en — men ska gå att välja om det är allt som finns.
  it("falls back to a character with no login timestamp when that is all there is", () => {
    expect(pickMainCharacter([character({ id: 7, lastLogin: 0 })])?.id).toBe(7);
  });
});
