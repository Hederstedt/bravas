import { ANONYMIZED_MEMBER_LABEL } from "./db.ts";

// Loggboken: vad som faktiskt hänt i klanen, i tidsordning.
//
// Ingenting lagras för den här vyn. Varje rad räknas fram ur tabeller som
// redan finns — inloggningar, kröningar, citat, spelade matcher, startade
// säsonger — och det är med flit: en gubbe som lämnar BVS anonymiseras i
// members och season_players (se removeMember), och då försvinner hans namn
// ur loggboken av sig självt. En egen händelsetabell hade behövt städas för
// hand, och den städningen hade förr eller senare missats.
//
// Av samma skäl finns inga rekord här. "Flest inne samtidigt" är ingen
// händelse utan ett tillstånd, och skulle ligga kvar överst i flödet i
// evighet; den bor i Siffrorna, där den hör hemma.
export const FEED_LIMIT = 8;

export interface FeedMemberItem {
  kind: "member";
  at: number;
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface FeedMonthItem {
  kind: "month";
  at: number;
  // null för den som hunnit lämna klanen — raden blir kvar, namnet kopplas loss.
  id: string | null;
  name: string;
  month: string;
}

export interface FeedQuoteItem {
  kind: "quote";
  at: number;
  text: string;
  saidBy: string;
}

export interface FeedMatchItem {
  kind: "match";
  at: number;
  fixtureId: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

export interface FeedSeasonItem {
  kind: "season";
  at: number;
  name: string;
}

export interface FeedClipItem {
  kind: "clip";
  at: number;
  title: string;
  provider: string;
}

export type FeedItem =
  | FeedMemberItem
  | FeedMonthItem
  | FeedQuoteItem
  | FeedMatchItem
  | FeedSeasonItem
  | FeedClipItem;

export interface FeedSources {
  members: { public_id: string; persona_name: string; avatar_url: string | null; first_login: number }[];
  months: { month: string; steamid64: string; decided_at: number }[];
  quotes: { text: string; said_by: string; created_at: number }[];
  matches: {
    id: number;
    played_at: number;
    home: string;
    away: string;
    home_score: number;
    away_score: number;
  }[];
  seasons: { name: string; starts_at: number }[];
  clips: { title: string; provider: string; created_at: number }[];
  // Kröningen sparar steamid64. Det får aldrig ut i ett svar (se /api/members),
  // så namn och opakt id slås upp här i stället.
  memberBySteamid64: Map<string, { public_id: string; persona_name: string }>;
}

export function buildFeed(sources: FeedSources, limit = FEED_LIMIT): FeedItem[] {
  const items: FeedItem[] = [
    ...sources.members.map(
      (m): FeedMemberItem => ({
        kind: "member",
        at: m.first_login,
        id: m.public_id,
        name: m.persona_name,
        avatarUrl: m.avatar_url,
      })
    ),
    ...sources.months.map((row): FeedMonthItem => {
      const member = sources.memberBySteamid64.get(row.steamid64);
      return {
        kind: "month",
        at: row.decided_at,
        id: member?.public_id ?? null,
        name: member?.persona_name ?? ANONYMIZED_MEMBER_LABEL,
        month: row.month,
      };
    }),
    ...sources.quotes.map(
      (q): FeedQuoteItem => ({
        kind: "quote",
        at: q.created_at,
        text: q.text,
        saidBy: q.said_by,
      })
    ),
    ...sources.matches.map(
      (f): FeedMatchItem => ({
        kind: "match",
        at: f.played_at,
        fixtureId: f.id,
        home: f.home,
        away: f.away,
        homeScore: f.home_score,
        awayScore: f.away_score,
      })
    ),
    ...sources.seasons.map(
      (s): FeedSeasonItem => ({ kind: "season", at: s.starts_at, name: s.name })
    ),
    ...sources.clips.map(
      (c): FeedClipItem => ({
        kind: "clip",
        at: c.created_at,
        title: c.title,
        provider: c.provider,
      })
    ),
  ];

  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}
