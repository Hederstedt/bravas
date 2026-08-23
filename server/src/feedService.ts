import { db, listMembers } from "./db.ts";
import { buildFeed, FEED_LIMIT, type FeedItem, type FeedSources } from "./feed.ts";

// Varje källa hämtar bara sin egen skärmfull. Loggboken visar ändå aldrig fler
// än FEED_LIMIT rader totalt, och en tabell med tusen citat ska inte läsas in i
// sin helhet för att åtta av dem kanske får plats.
const MEMBERS_SQL = `
  SELECT public_id, persona_name, avatar_url, first_login
  FROM members ORDER BY first_login DESC LIMIT ?
`;

const MONTHS_SQL = `
  SELECT month, steamid64, decided_at
  FROM bvs_month ORDER BY decided_at DESC LIMIT ?
`;

const QUOTES_SQL = `
  SELECT text, said_by, created_at
  FROM quotes ORDER BY created_at DESC LIMIT ?
`;

// Bara spelade matcher — en match i spelschemat har ännu inte hänt, och
// loggboken handlar om det som hänt.
const MATCHES_SQL = `
  SELECT f.id, f.played_at, f.home_score, f.away_score,
         home.name AS home, away.name AS away
  FROM fixtures f
  JOIN teams home ON home.id = f.home_team_id
  JOIN teams away ON away.id = f.away_team_id
  WHERE f.played_at IS NOT NULL
  ORDER BY f.played_at DESC LIMIT ?
`;

const SEASONS_SQL = `
  SELECT name, starts_at FROM seasons ORDER BY starts_at DESC LIMIT ?
`;

// Bara rubriken och tjänsten — loggboken berättar att ett klipp lagts upp,
// själva spelaren bor i galleriet.
const CLIPS_SQL = `
  SELECT title, provider, created_at FROM clips ORDER BY created_at DESC LIMIT ?
`;

export function getFeed(): FeedItem[] {
  const take = (sql: string) => db.prepare(sql).all(FEED_LIMIT);

  const sources: FeedSources = {
    members: take(MEMBERS_SQL) as FeedSources["members"],
    months: take(MONTHS_SQL) as FeedSources["months"],
    quotes: take(QUOTES_SQL) as FeedSources["quotes"],
    matches: take(MATCHES_SQL) as FeedSources["matches"],
    seasons: take(SEASONS_SQL) as FeedSources["seasons"],
    clips: take(CLIPS_SQL) as FeedSources["clips"],
    memberBySteamid64: new Map(
      listMembers().map((m) => [
        m.steamid64,
        { public_id: m.public_id, persona_name: m.persona_name },
      ])
    ),
  };

  return buildFeed(sources);
}
