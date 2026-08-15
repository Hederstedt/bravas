// Seedar en lokal utvecklingsdatabas: allowlist, medlemmar och färsk
// CS2-statistik. Poängen är att kunna köra hela sajten — särskilt managern —
// utan Steam: statistiken cachas med färsk tidsstämpel, så statsService ser
// den som aktuell och ringer aldrig ut. Sessionskakorna skrivs ut så att man
// kan logga in som vem som helst av testgubbarna utan OpenID-dansen.
//
//   npm --prefix server run seed:dev
//
// Rör bara den databas DB_PATH pekar på. Kör den aldrig mot driftdatabasen.
import { db } from "../db.ts";
import { createSessionCookieValue, sessionCookie } from "../session.ts";
import { createRng } from "../rng.ts";

const MANAGERS = [
  { steamid64: "76561190000000001", name: "[BVS] Mag" },
  { steamid64: "76561190000000002", name: "[BVS] Kungalv" },
  { steamid64: "76561190000000003", name: "[BVS] Töjd Vips" },
  { steamid64: "76561190000000004", name: "[BVS] BrunKalle" },
  { steamid64: "76561190000000005", name: "[BVS] Snabba Sven" },
  { steamid64: "76561190000000006", name: "[BVS] Lugna Lasse" },
] as const;

// Spridda men rimliga siffror, deterministiskt per gubbe: en pool där alla har
// identiska betyg gör lagbygget till ett icke-val, och slumpen skulle göra
// varje seedning till en ny balansdiskussion.
function statsFor(steamid64: string): Record<string, number> {
  const rng = createRng(`seed-dev:${steamid64}`);
  const rounds = 4000 + Math.floor(rng() * 9000);
  const accuracy = 0.14 + rng() * 0.14;
  const shotsFired = Math.round(rounds * (28 + rng() * 22));
  const killsPerRound = 0.45 + rng() * 0.4;
  const kills = Math.round(rounds * killsPerRound);
  const deaths = Math.round(rounds * (0.5 + rng() * 0.25));

  return {
    total_rounds_played: rounds,
    total_shots_fired: shotsFired,
    total_shots_hit: Math.round(shotsFired * accuracy),
    total_kills: kills,
    total_kills_headshot: Math.round(kills * (0.2 + rng() * 0.35)),
    total_deaths: deaths,
    total_mvps: Math.round(rounds * (0.04 + rng() * 0.09)),
    total_planted_bombs: Math.round(rounds * (0.02 + rng() * 0.05)),
    total_defused_bombs: Math.round(rounds * (0.01 + rng() * 0.03)),
    total_time_played: Math.round((300 + rng() * 3000) * 3600),
    total_kills_knife: Math.floor(rng() * 60),
    total_kills_ak47: Math.round(kills * 0.3),
    total_kills_awp: Math.round(kills * (0.05 + rng() * 0.25)),
    total_money_earned: Math.round(rounds * (3000 + rng() * 1500)),
    total_wins_pistolround: Math.round(rounds * 0.05),
  };
}

const now = Date.now();
const insertAllowlist = db.prepare(
  "INSERT OR IGNORE INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)"
);
const insertMember = db.prepare(
  `INSERT INTO members (steamid64, persona_name, avatar_url, first_login, last_login)
   VALUES (?, ?, NULL, ?, ?)
   ON CONFLICT(steamid64) DO UPDATE SET persona_name = excluded.persona_name, last_login = excluded.last_login`
);
const insertStats = db.prepare(
  `INSERT INTO cs2_stats (steamid64, stats_json, fetched_at) VALUES (?, ?, ?)
   ON CONFLICT(steamid64) DO UPDATE SET stats_json = excluded.stats_json, fetched_at = excluded.fetched_at`
);

// Två veckors Valheim-historik med femminuterspuls, så att serverrekorden går
// att titta på utan att först vänta två veckor. Formen speglar driften: uppe
// nästan hela tiden, kvällslir, och ett avbrott att bryta uptime-sviten på.
const MIN = 60_000;
const STEP = 5 * MIN;

const insertSample = db.prepare(
  "INSERT OR IGNORE INTO valheim_samples (at, online, players) VALUES (?, ?, ?)"
);

function playersAt(at: number): number {
  const d = new Date(at);
  const hour = d.getHours();
  const day = d.getDay();

  if (hour >= 19 && hour <= 23) {
    // Torsdag är klanens kväll, helgen näst bäst.
    const base = day === 4 ? 5 : day === 5 || day === 6 ? 3 : 2;
    // Variationen följer datumet i stället för slumpen, så en omseedning ger
    // samma historik.
    return Math.max(0, base + ((d.getDate() + hour) % 3) - 1);
  }
  if (hour < 2) return day === 5 || day === 6 ? 1 : 0;
  return 0;
}

const seed = db.transaction(() => {
  for (const m of MANAGERS) {
    insertAllowlist.run(m.steamid64, m.name, now);
    insertMember.run(m.steamid64, m.name, now, now);
    insertStats.run(m.steamid64, JSON.stringify(statsFor(m.steamid64)), now);
  }

  const start = now - 14 * 24 * 60 * MIN;
  const outageFrom = now - 6 * 24 * 60 * MIN;
  const outageTo = outageFrom + 90 * MIN;

  for (let at = start; at <= now; at += STEP) {
    const down = at >= outageFrom && at < outageTo;
    insertSample.run(at, down ? 0 : 1, down ? 0 : playersAt(at));
  }
});
seed();

console.log(
  `Seedade ${MANAGERS.length} testgubbar med färsk CS2-statistik, plus två veckors Valheim-historik.\n`
);
console.log("Sessionskakor — klistra in i webbläsarens cookie för localhost:\n");
for (const m of MANAGERS) {
  console.log(`  ${m.name}`);
  console.log(`    ${sessionCookie.name}=${createSessionCookieValue(m.steamid64)}\n`);
}
