import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DISCORD_UNAVAILABLE,
  fetchDiscordWidget,
  MAX_LISTED,
  parseWidget,
} from "./discordWidget.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function widget(members: unknown[], presenceCount?: number) {
  return { presence_count: presenceCount ?? members.length, members };
}

const MAG = { username: "Mag", status: "online", game: { name: "Counter-Strike 2" } };

describe("parseWidget", () => {
  it("pulls out name, status and game", () => {
    const status = parseWidget(widget([MAG]));
    expect(status).toEqual({
      available: true,
      online: 1,
      members: [{ name: "Mag", status: "online", game: "Counter-Strike 2" }],
    });
  });

  it("leaves the game null when Discord does not say", () => {
    const status = parseWidget(widget([{ username: "Kungalv", status: "idle" }]));
    expect(status.members[0]).toEqual({ name: "Kungalv", status: "idle", game: null });
  });

  // Avatar-URL:er och id:n behöver vi inte, och avatarerna hade dessutom blivit
  // externa bildanrop från vår sida.
  it("keeps nothing but name, status and game", () => {
    const status = parseWidget(
      widget([{ ...MAG, id: "12345", avatar_url: "https://cdn.discordapp.com/x.png" }])
    );
    expect(Object.keys(status.members[0]!).sort()).toEqual(["game", "name", "status"]);
    expect(JSON.stringify(status)).not.toContain("discordapp");
  });

  it("falls back to online for a status it does not recognise", () => {
    expect(parseWidget(widget([{ username: "Udda", status: "invisible" }])).members[0]!.status).toBe(
      "online"
    );
  });

  it("skips entries without a username", () => {
    const status = parseWidget(widget([{ status: "online" }, MAG, { username: "" }]));
    expect(status.members).toHaveLength(1);
  });

  // Taket satt förut här, i tolkningen. Det var ett visningsbeslut, men
  // pollern som delar ut månadspoäng läste samma avkortade lista — och Discord
  // sorterar alfabetiskt, så gubbar sent i alfabetet kunde aldrig få en poäng
  // hur mycket de än hängde inne. Tolkningen behåller nu allt; kapningen sker
  // först när svaret ska ut till webbläsaren (publicDiscordStatus).
  it("keeps every member Discord sent, so scoring sees them all", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ username: `Gubbe ${i}`, status: "online" }));
    const status = parseWidget(widget(many, 40));

    expect(status.members).toHaveLength(40);
    expect(status.members.length).toBeGreaterThan(MAX_LISTED);
    expect(status.online).toBe(40);
  });

  it("survives a payload that is not shaped like a widget at all", () => {
    for (const junk of [null, {}, { members: "nope" }, { members: [null] }]) {
      const status = parseWidget(junk);
      expect(status.available).toBe(true);
      expect(status.members).toEqual([]);
    }
  });

  it("never reports a negative count", () => {
    expect(parseWidget({ presence_count: -5, members: [] }).online).toBe(0);
  });
});

describe("fetchDiscordWidget", () => {
  it("does not call out at all without a server id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(fetchDiscordWidget("")).resolves.toEqual(DISCORD_UNAVAILABLE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks Discord for the widget of the configured server", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(widget([MAG])), { status: 200 }));

    await fetchDiscordWidget("323523542312419348");

    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "https://discord.com/api/guilds/323523542312419348/widget.json"
    );
  });

  // 403 betyder att widgeten är avstängd i serverinställningarna — det
  // vanligaste svaret innan någon slagit på den, och inget att larma om.
  it("reports unavailable when the widget is switched off", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 403 }));
    await expect(fetchDiscordWidget("1")).resolves.toEqual(DISCORD_UNAVAILABLE);
  });

  it("reports unavailable when Discord cannot be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("nätverket nere"));
    await expect(fetchDiscordWidget("1")).resolves.toEqual(DISCORD_UNAVAILABLE);
  });

  it("reports unavailable when Discord answers with something unparsable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>", { status: 200 }));
    await expect(fetchDiscordWidget("1")).resolves.toEqual(DISCORD_UNAVAILABLE);
  });
});
