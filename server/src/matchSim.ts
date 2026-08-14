import type { AttrKey } from "./cs2Cards.ts";
import { createRng, pickWeighted } from "./rng.ts";

// Matchen spelas runda för runda ur de två laguppställningarnas attribut, med
// seedad slump så att samma match alltid går likadant. Ingen realtid: man
// trycker "spela match" och får en rapport.

export const ROUNDS_TO_WIN = 13;
// 12-12 blir oavgjort. Övertid vore mer CS men gör ligatabellen krångligare
// utan att tillföra något åt managerdelen.
export const MAX_ROUNDS = 24;

export type PlayerRatings = Record<AttrKey, number>;

export interface MatchPlayer {
  id: string;
  name: string;
  ratings: PlayerRatings;
}

export interface MatchTeam {
  id: string;
  name: string;
  players: MatchPlayer[];
}

export type Side = "home" | "away";

export interface KillEvent {
  killerId: string;
  victimId: string;
}

export interface RoundResult {
  round: number;
  winner: Side;
  kills: KillEvent[];
}

export interface PlayerLine {
  id: string;
  name: string;
  kills: number;
  deaths: number;
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  winner: Side | "draw";
  rounds: RoundResult[];
  scoreboard: { home: PlayerLine[]; away: PlayerLine[] };
  mvp: PlayerLine | null;
}

// Hur hårt betygen slår igenom i en enskild duell. Ett rått styrkeförhållande
// ser rimligt ut per duell men komponeras brutalt: femton dueller per runda och
// tretton rundor gör ett litet övertag till nära nog garanterad seger, och då
// är tabellen avgjord av betygen innan säsongen börjat. Kvoten dras därför mot
// 0,5 — bättre lag vinner fortfarande klart oftare, men underdogen kan sno en
// match och det är det som gör serien värd att spela.
const SKILL_WEIGHT = 0.45;

// Vad som avgör en duell. Sikte och skallar avgör om skottet sitter, frag hur
// villig han är att ta striden — tålighet är det som håller honom vid liv.
function attackPower(r: PlayerRatings): number {
  return r.SIK * 0.4 + r.SKA * 0.3 + r.FRA * 0.3;
}

function survivalPower(r: PlayerRatings): number {
  return r.TÅL * 0.6 + r.SIK * 0.4;
}

// Den som fraggar mycket hamnar oftare i strid. Utan viktningen hade alla fem
// i laget dödat lika mycket och positionerna inte betytt något.
function engagement(r: PlayerRatings): number {
  return Math.max(1, r.FRA);
}

interface Alive {
  player: MatchPlayer;
  side: Side;
}

// Objektivspelet avgör de jämna rundorna. Ett lag som planterar och defusar
// bättre vinner fler rundor än rena dueller kan förklara.
function objectiveEdge(home: MatchTeam, away: MatchTeam): number {
  const avg = (t: MatchTeam) =>
    t.players.length === 0
      ? 0
      : t.players.reduce((s, p) => s + p.ratings.NYT, 0) / t.players.length;
  // Skalas ner hårt: NYT ska luta en jämn runda, inte avgöra matchen.
  return (avg(home) - avg(away)) / 400;
}

function playRound(
  home: MatchTeam,
  away: MatchTeam,
  edge: number,
  rng: () => number
): { winner: Side; kills: KillEvent[] } {
  const alive: Alive[] = [
    ...home.players.map((player) => ({ player, side: "home" as Side })),
    ...away.players.map((player) => ({ player, side: "away" as Side })),
  ];
  const kills: KillEvent[] = [];

  // Varje varv är en duell mellan två levande på olika sidor. Rundan är över
  // när ena laget är utslaget.
  while (alive.some((a) => a.side === "home") && alive.some((a) => a.side === "away")) {
    const homeSide = alive.filter((a) => a.side === "home");
    const awaySide = alive.filter((a) => a.side === "away");

    const attacker = pickWeighted(homeSide, (a) => engagement(a.player.ratings), rng)!;
    const defender = pickWeighted(awaySide, (a) => engagement(a.player.ratings), rng)!;

    const attack = attackPower(attacker.player.ratings);
    const defence = survivalPower(defender.player.ratings);
    const raw = attack / (attack + defence);
    const pHome = 0.5 + (raw - 0.5) * SKILL_WEIGHT + edge;

    const homeWinsDuel = rng() < Math.min(0.95, Math.max(0.05, pHome));
    const winner = homeWinsDuel ? attacker : defender;
    const loser = homeWinsDuel ? defender : attacker;

    kills.push({ killerId: winner.player.id, victimId: loser.player.id });
    alive.splice(alive.indexOf(loser), 1);
  }

  return { winner: alive.some((a) => a.side === "home") ? "home" : "away", kills };
}

export function simulateMatch(home: MatchTeam, away: MatchTeam, seed: string): MatchResult {
  if (home.players.length === 0 || away.players.length === 0) {
    throw new Error("En match kräver minst en spelare i varje lag");
  }

  const rng = createRng(`${seed}:${home.id}:${away.id}`);
  const edge = objectiveEdge(home, away);

  const rounds: RoundResult[] = [];
  const kills = new Map<string, number>();
  const deaths = new Map<string, number>();
  let homeScore = 0;
  let awayScore = 0;

  while (
    homeScore < ROUNDS_TO_WIN &&
    awayScore < ROUNDS_TO_WIN &&
    rounds.length < MAX_ROUNDS
  ) {
    const round = playRound(home, away, edge, rng);
    for (const k of round.kills) {
      kills.set(k.killerId, (kills.get(k.killerId) ?? 0) + 1);
      deaths.set(k.victimId, (deaths.get(k.victimId) ?? 0) + 1);
    }
    if (round.winner === "home") homeScore++;
    else awayScore++;
    rounds.push({ round: rounds.length + 1, winner: round.winner, kills: round.kills });
  }

  const line = (p: MatchPlayer): PlayerLine => ({
    id: p.id,
    name: p.name,
    kills: kills.get(p.id) ?? 0,
    deaths: deaths.get(p.id) ?? 0,
  });

  const scoreboard = {
    home: home.players.map(line),
    away: away.players.map(line),
  };

  const winner: Side | "draw" =
    homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";

  // MVP hämtas från det vinnande laget — det är den som avgjorde, inte den som
  // fraggade mest i en förlust. Vid oavgjort får hela protokollet avgöra.
  const mvpPool =
    winner === "home"
      ? scoreboard.home
      : winner === "away"
        ? scoreboard.away
        : [...scoreboard.home, ...scoreboard.away];

  const mvp = mvpPool.reduce<PlayerLine | null>(
    (best, p) => (!best || p.kills > best.kills ? p : best),
    null
  );

  return { homeScore, awayScore, winner, rounds, scoreboard, mvp };
}
