import { describe, expect, it } from "vitest";
import { buildFeed, FEED_LIMIT, type FeedSources } from "./feed.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 22, 20, 0, 0);

const EMPTY: FeedSources = {
  members: [],
  months: [],
  quotes: [],
  matches: [],
  seasons: [],
  memberBySteamid64: new Map(),
};

function sources(partial: Partial<FeedSources>): FeedSources {
  return { ...EMPTY, ...partial };
}

describe("buildFeed", () => {
  it("blandar källorna och lägger det senaste först", () => {
    const feed = buildFeed(
      sources({
        members: [
          { public_id: "pid-1", persona_name: "Kungalv", avatar_url: null, first_login: NOW - 3 * DAY },
        ],
        quotes: [{ text: "Jag hade ju träklubban", said_by: "Mag", created_at: NOW - DAY }],
        seasons: [{ name: "Höstserien", starts_at: NOW - 2 * DAY }],
      })
    );

    expect(feed.map((i) => i.kind)).toEqual(["quote", "season", "member"]);
    expect(feed[0]).toMatchObject({ kind: "quote", text: "Jag hade ju träklubban", saidBy: "Mag" });
  });

  it("visar aldrig mer än en skärmfull", () => {
    const quotes = Array.from({ length: FEED_LIMIT + 5 }, (_, i) => ({
      text: `Citat ${i}`,
      said_by: "Gubbe",
      created_at: NOW - i * 1000,
    }));

    expect(buildFeed(sources({ quotes }))).toHaveLength(FEED_LIMIT);
  });

  it("ger matchen både lag, resultat och en väg till referatet", () => {
    const feed = buildFeed(
      sources({
        matches: [
          {
            id: 12,
            played_at: NOW,
            home: "Gubbarna FC",
            away: "Rush B United",
            home_score: 16,
            away_score: 13,
          },
        ],
      })
    );

    expect(feed[0]).toEqual({
      kind: "match",
      at: NOW,
      fixtureId: 12,
      home: "Gubbarna FC",
      away: "Rush B United",
      homeScore: 16,
      awayScore: 13,
    });
  });

  // Kröningen sparar steamid64 — det får aldrig ut i svaret, lika lite som i
  // /api/members. Namnet och det opaka id:t slås upp i medlemsregistret.
  it("slår upp månadens vinnare och skickar aldrig med steamid64", () => {
    const feed = buildFeed(
      sources({
        months: [{ month: "2026-07", steamid64: "76561198053832683", decided_at: NOW }],
        memberBySteamid64: new Map([
          ["76561198053832683", { public_id: "pid-mag", persona_name: "Mag" }],
        ]),
      })
    );

    expect(feed[0]).toEqual({
      kind: "month",
      at: NOW,
      id: "pid-mag",
      name: "Mag",
      month: "2026-07",
    });
    expect(JSON.stringify(feed)).not.toContain("76561198053832683");
  });

  // Samma linje som removeMember drar: historiken blir kvar, namnet kopplas
  // loss. En vinnare som slutat har ingen medlemsrad att slå upp.
  it("anonymiserar en vinnare som lämnat i stället för att tappa raden", () => {
    const feed = buildFeed(
      sources({
        months: [{ month: "2026-06", steamid64: "76561190000000001", decided_at: NOW }],
      })
    );

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ kind: "month", id: null, name: "Tidigare medlem" });
  });

  it("är tomt när ingenting hänt, i stället för att hitta på", () => {
    expect(buildFeed(EMPTY)).toEqual([]);
  });
});
