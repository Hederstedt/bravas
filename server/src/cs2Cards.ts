import { assignQuips, buildQuips, type Derived } from "./cs2Quips.ts";
import type { MemberStats } from "./cs2Stats.ts";

export type AttrKey = "SIK" | "SKA" | "FRA" | "TÅL" | "NYT" | "TID";
export type Tier = "ikon" | "guld" | "silver" | "brons" | "okänd";

// key är en sträng, inte AttrKey — kortet bär numera även World of Tanks-
// attribut (wotCards.ts har sin egen nyckeltyp), och båda ska kunna renderas
// av samma komponent på frontend.
export interface CardAttribute {
  key: string;
  label: string;
  description: string;
  rating: number;
}

export interface PlayerCard {
  steamid64: string;
  personaName: string;
  hasStats: boolean;
  overall: number;
  tier: Tier;
  position: string;
  attributes: CardAttribute[];
  // Bara ifyllt för den som länkat World of Tanks — se playerCards.ts, som är
  // den som faktiskt kombinerar CS2- och WoT-betyg. Tomt här betyder bara att
  // den här funktionen (CS2 för sig) inte vet något om WoT, inte att spelaren
  // saknar det.
  wotAttributes: CardAttribute[];
  // Bara ifyllt för den som länkat sin Battle.net-karaktär.
  wowAttributes: CardAttribute[];
  comments: string[];
}

// Under så här få rundor säger siffrorna ingenting — ett betyg där vore påhittat.
const MIN_ROUNDS = 100;

type Anchors = readonly (readonly [number, number])[];

// Reglerna i cs2Quips behöver inte objektiv-kvoten, men betygsmodellen gör det.
export interface DerivedCore extends Derived {
  objectiveRate: number;
}

// Ankarna är absoluta, inte relativa till klanen. Relativ skala hade sett
// roligare ut men gjort korten instabila: en ny gubbe som loggar in skulle
// räkna om allas betyg, och sämsta gubben hade alltid legat i botten oavsett
// hur bra han faktiskt är. Varje tabell börjar på noll så beteendet är
// definierat hela vägen ner.
const SPEC: Record<
  AttrKey,
  { label: string; description: string; anchors: Anchors; of: (d: DerivedCore) => number }
> = {
  SIK: {
    label: "Sikte",
    description: "Andel av avlossade skott som träffar",
    anchors: [
      [0, 1],
      [0.1, 40],
      [0.18, 65],
      [0.24, 80],
      [0.32, 95],
    ],
    of: (d) => d.accuracy,
  },
  SKA: {
    label: "Skallar",
    description: "Andel av hans kills som är headshots",
    anchors: [
      [0, 1],
      [0.15, 35],
      [0.3, 60],
      [0.45, 80],
      [0.6, 95],
    ],
    of: (d) => d.hsRate,
  },
  FRA: {
    label: "Frag",
    description: "Kills per spelad runda",
    anchors: [
      [0, 1],
      [0.4, 40],
      [0.6, 60],
      [0.75, 78],
      [0.95, 95],
    ],
    of: (d) => d.kills / d.rounds,
  },
  TÅL: {
    label: "Tålighet",
    description: "Hur ofta han överlever rundan",
    anchors: [
      [0, 1],
      [0.25, 40],
      [0.35, 60],
      [0.45, 80],
      [0.55, 95],
    ],
    of: (d) => 1 - d.deaths / d.rounds,
  },
  NYT: {
    label: "Nytta",
    description: "Planterade och desarmerade bomber plus MVP:er, per runda",
    anchors: [
      [0, 1],
      [0.05, 40],
      [0.12, 65],
      [0.2, 82],
      [0.3, 95],
    ],
    of: (d) => d.objectiveRate,
  },
  TID: {
    label: "Tid",
    description: "Total speltid i CS2",
    anchors: [
      [0, 1],
      [50, 30],
      [300, 55],
      [1000, 75],
      [3000, 92],
      [6000, 99],
    ],
    of: (d) => d.hours,
  },
};

// Ordningen är både visningsordning på kortet och prioritet när två attribut
// ligger lika och ska ge positionen. Exporterad: träningen validerar attribut
// mot samma lista.
export const ATTR_ORDER: AttrKey[] = ["SIK", "SKA", "FRA", "TÅL", "NYT", "TID"];

const WEIGHTS: Record<AttrKey, number> = {
  FRA: 0.25,
  TÅL: 0.2,
  SIK: 0.2,
  SKA: 0.15,
  NYT: 0.1,
  TID: 0.1,
};

const POSITIONS: Record<AttrKey, string> = {
  SIK: "AWP",
  SKA: "SKALLE",
  FRA: "ENTRY",
  TÅL: "SMYGARE",
  NYT: "IGL",
  TID: "VETERAN",
};

// Styckvis linjär interpolation mellan ankarpunkterna, klampad i båda ändar.
// Utan klampningen skulle en outlier extrapolera förbi 99 eller under noll.
export function scale(value: number, anchors: Anchors): number {
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  if (!Number.isFinite(value) || value <= first[0]) return clamp(first[1]);
  if (value >= last[0]) return clamp(last[1]);

  for (let i = 1; i < anchors.length; i++) {
    const [hiRaw, hiRating] = anchors[i]!;
    if (value > hiRaw) continue;
    const [loRaw, loRating] = anchors[i - 1]!;
    const t = (value - loRaw) / (hiRaw - loRaw);
    return clamp(loRating + t * (hiRating - loRating));
  }
  return clamp(last[1]);
}

function clamp(rating: number): number {
  return Math.min(99, Math.max(1, Math.round(rating)));
}

export function tierFor(overall: number): Tier {
  if (overall >= 87) return "ikon";
  if (overall >= 75) return "guld";
  if (overall >= 60) return "silver";
  return "brons";
}

// Vilket vapen han dödat flest med. Suffixen under total_kills_ är inte bara
// vapen — headshot och de blindade offren räknas separat och ska inte kunna
// vinna som "favoritvapen".
const NOT_WEAPONS = new Set(["headshot", "enemy_weapon", "enemy_blinded", "against_zoomed_sniper"]);

function topWeapon(stats: Record<string, number>): string | null {
  let best: { key: string; value: number } | null = null;
  for (const [key, value] of Object.entries(stats)) {
    if (!key.startsWith("total_kills_")) continue;
    const suffix = key.slice("total_kills_".length);
    if (!suffix || NOT_WEAPONS.has(suffix) || value <= 0) continue;
    if (!best || value > best.value) best = { key: suffix, value };
  }
  return best?.key ?? null;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function derive(m: MemberStats): DerivedCore {
  const s = m.stats;
  const rounds = s.total_rounds_played ?? 0;
  const shotsFired = s.total_shots_fired ?? 0;
  const kills = s.total_kills ?? 0;
  const objectives = (s.total_planted_bombs ?? 0) + (s.total_defused_bombs ?? 0) + (s.total_mvps ?? 0);

  return {
    hasStats: rounds >= MIN_ROUNDS && shotsFired > 0,
    ratings: { SIK: 0, SKA: 0, FRA: 0, TÅL: 0, NYT: 0, TID: 0 },
    rounds,
    kills,
    deaths: s.total_deaths ?? 0,
    hours: (s.total_time_played ?? 0) / 3600,
    accuracy: ratio(s.total_shots_hit ?? 0, shotsFired),
    hsRate: ratio(s.total_kills_headshot ?? 0, kills),
    mvpRate: ratio(s.total_mvps ?? 0, rounds),
    objectiveRate: ratio(objectives, rounds),
    knifeKills: s.total_kills_knife ?? 0,
    taserKills: s.total_kills_taser ?? 0,
    defusedBombs: s.total_defused_bombs ?? 0,
    shotsFired,
    moneyPerRound: ratio(s.total_money_earned ?? 0, rounds),
    pistolWinRate: ratio(s.total_wins_pistolround ?? 0, rounds),
    blindKills: s.total_kills_enemy_blinded ?? 0,
    topWeapon: topWeapon(s),
  };
}

export type RatedCard = Omit<PlayerCard, "comments">;

// Betygsättningen är helt oberoende av kommentarerna. De hålls isär eftersom
// kommentarerna måste väljas med hela laget i åtanke medan betygen bara beror
// på gubben själv.
export function rateCard(m: MemberStats): { card: RatedCard; derived: DerivedCore } {
  const d = derive(m);

  if (!d.hasStats) {
    return {
      derived: d,
      card: {
        steamid64: m.steamid64,
        personaName: m.personaName,
        hasStats: false,
        overall: 0,
        tier: "okänd",
        position: "OKÄND",
        attributes: [],
        wotAttributes: [],
        wowAttributes: [],
      },
    };
  }

  for (const key of ATTR_ORDER) {
    d.ratings[key] = scale(SPEC[key].of(d), SPEC[key].anchors);
  }

  const attributes = ATTR_ORDER.map((key) => ({
    key,
    label: SPEC[key].label,
    description: SPEC[key].description,
    rating: d.ratings[key],
  }));

  const overall = Math.round(
    ATTR_ORDER.reduce((sum, key) => sum + d.ratings[key] * WEIGHTS[key], 0)
  );

  // Lika högsta betyg avgörs av ATTR_ORDER, inte av vilken ordning nycklarna
  // råkar ligga i — annars kunde positionen ändras utan att siffrorna gjort det.
  const top = ATTR_ORDER.reduce((best, key) => (d.ratings[key] > d.ratings[best] ? key : best));

  return {
    derived: d,
    card: {
      steamid64: m.steamid64,
      personaName: m.personaName,
      hasStats: true,
      overall,
      tier: tierFor(overall),
      position: POSITIONS[top],
      attributes,
      wotAttributes: [],
      wowAttributes: [],
    },
  };
}

// En ensam gubbe, utan lag att ta hänsyn till.
export function buildCard(m: MemberStats): PlayerCard {
  const { card, derived } = rateCard(m);
  return { ...card, comments: buildQuips(derived, m.steamid64).map((q) => q.text) };
}

// Bäst först. Gubbar utan statistik hamnar sist oavsett var de kom in i listan,
// och lika betyg sorteras på namn så raden inte kastar om sig mellan laddningar.
//
// Kommentarerna tilldelas över hela laget innan korten sätts ihop, så att inga
// två gubbar får samma rad.
export function buildCards(members: MemberStats[]): PlayerCard[] {
  const rated = members.map(rateCard);
  const quips = assignQuips(
    rated.map(({ card, derived }) => ({ id: card.steamid64, derived }))
  );

  return rated
    .map(({ card }) => ({
      ...card,
      comments: (quips.get(card.steamid64) ?? []).map((q) => q.text),
    }))
    .sort(
      (a, b) =>
        Number(b.hasStats) - Number(a.hasStats) ||
        b.overall - a.overall ||
        a.personaName.localeCompare(b.personaName, "sv")
    );
}
