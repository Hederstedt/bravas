// Serien: vem möter vem, och vad tabellen säger efteråt. Rena funktioner —
// inget här rör databasen eller simuleringen.

export const POINTS_WIN = 3;
export const POINTS_DRAW = 1;

export interface Fixture {
  matchday: number;
  home: number;
  away: number;
}

export interface PlayedFixture {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
}

export interface TableRow {
  teamId: number;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  roundsFor: number;
  roundsAgainst: number;
  diff: number;
  points: number;
}

// Platshållare för udda lagantal. Den som paras ihop med den står över omgången.
const BYE = -1;

// Cirkelmetoden: ett lag står stilla och resten roterar runt det. Ger ett
// schema där ingen möter någon två gånger i första varvet och ingen spelar två
// matcher samma omgång.
function singleRound(ids: readonly number[]): Fixture[] {
  const line = [...ids];
  if (line.length % 2 === 1) line.push(BYE);

  const n = line.length;
  const half = n / 2;
  const fixtures: Fixture[] = [];
  let order = [...line];

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < half; i++) {
      const a = order[i]!;
      const b = order[n - 1 - i]!;
      if (a === BYE || b === BYE) continue;
      // Varannan omgång byts hemma och borta, annars spelar samma lag hemma i
      // nästan varje match bara för att det råkade stå först i listan.
      const [home, away] = round % 2 === 0 ? [a, b] : [b, a];
      fixtures.push({ matchday: round + 1, home, away });
    }
    // Första platsen står still, resten roterar ett steg.
    order = [order[0]!, order[n - 1]!, ...order.slice(1, n - 1)];
  }

  return fixtures;
}

// Två varv som standard: alla möter alla både hemma och borta, vilket är det
// enda sättet att göra hemmafördelen rättvis över en säsong.
export function buildFixtures(teamIds: readonly number[], rounds = 2): Fixture[] {
  if (teamIds.length < 2) return [];

  const first = singleRound(teamIds);
  if (rounds < 2) return first;

  const daysPerRound = Math.max(...first.map((f) => f.matchday));
  const second = first.map((f) => ({
    matchday: f.matchday + daysPerRound,
    home: f.away,
    away: f.home,
  }));

  return [...first, ...second];
}

export function buildTable(
  teams: readonly { id: number; name: string }[],
  results: readonly PlayedFixture[]
): TableRow[] {
  const rows = new Map<number, TableRow>(
    teams.map((t) => [
      t.id,
      {
        teamId: t.id,
        name: t.name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        roundsFor: 0,
        roundsAgainst: 0,
        diff: 0,
        points: 0,
      },
    ])
  );

  for (const r of results) {
    const home = rows.get(r.homeTeamId);
    const away = rows.get(r.awayTeamId);
    // Ett resultat som rör ett lag utanför serien hör inte hemma i tabellen.
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.roundsFor += r.homeScore;
    home.roundsAgainst += r.awayScore;
    away.roundsFor += r.awayScore;
    away.roundsAgainst += r.homeScore;

    if (r.homeScore > r.awayScore) {
      home.won++;
      away.lost++;
      home.points += POINTS_WIN;
    } else if (r.awayScore > r.homeScore) {
      away.won++;
      home.lost++;
      away.points += POINTS_WIN;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += POINTS_DRAW;
      away.points += POINTS_DRAW;
    }
  }

  for (const row of rows.values()) row.diff = row.roundsFor - row.roundsAgainst;

  // Namnet sist så att två lag med identisk statistik ändå får en fast ordning
  // i stället för att hoppa mellan sidladdningar.
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.diff - a.diff ||
      b.roundsFor - a.roundsFor ||
      a.name.localeCompare(b.name, "sv")
  );
}
