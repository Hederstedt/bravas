import { scale, tierFor, type CardAttribute } from "./cs2Cards.ts";
import type { WotMemberStats } from "./wotStats.ts";

export type WotAttrKey = "SEG" | "SKD" | "ÖVL";

export const WOT_ATTR_ORDER: WotAttrKey[] = ["SEG", "SKD", "ÖVL"];

// Under den här nivån säger siffrorna inget om skicklighet — ett par
// turstrider skulle toppa listan. Samma tröskel som highlighten i wotStats.ts.
const MIN_BATTLES = 100;

interface WotDerived {
  hasStats: boolean;
  battles: number;
  winRate: number;
  damagePerBattle: number;
  survivalRate: number;
  ratings: Record<WotAttrKey, number>;
}

type Anchors = readonly (readonly [number, number])[];

const WOT_SPEC: Record<
  WotAttrKey,
  { label: string; description: string; anchors: Anchors; of: (d: WotDerived) => number }
> = {
  SEG: {
    label: "Segerprocent",
    description: "Andel vunna strider",
    anchors: [
      [0, 1],
      [0.45, 40],
      [0.5, 60],
      [0.55, 80],
      [0.65, 95],
    ],
    of: (d) => d.winRate,
  },
  SKD: {
    label: "Skada",
    description: "Tillfogad skada per strid",
    anchors: [
      [0, 1],
      [500, 40],
      [900, 60],
      [1400, 80],
      [2200, 95],
    ],
    of: (d) => d.damagePerBattle,
  },
  ÖVL: {
    label: "Överlevnad",
    description: "Andel strider han överlever",
    anchors: [
      [0, 1],
      [0.25, 40],
      [0.35, 60],
      [0.45, 80],
      [0.55, 95],
    ],
    of: (d) => d.survivalRate,
  },
};

const WOT_WEIGHTS: Record<WotAttrKey, number> = {
  SEG: 0.4,
  SKD: 0.35,
  ÖVL: 0.25,
};

// Rollnamnet är bara vilket attribut som är starkast, precis som på CS2-sidan.
export const WOT_POSITIONS: Record<WotAttrKey, string> = {
  SEG: "TAKTIKER",
  SKD: "KANON",
  ÖVL: "ÖVERLEVARE",
};

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function derive(m: WotMemberStats): WotDerived {
  const s = m.stats;
  const battles = s.battles ?? 0;

  return {
    hasStats: battles >= MIN_BATTLES,
    battles,
    winRate: ratio(s.wins ?? 0, battles),
    damagePerBattle: ratio(s.damage_dealt ?? 0, battles),
    survivalRate: ratio(s.survived_battles ?? 0, battles),
    ratings: { SEG: 0, SKD: 0, ÖVL: 0 },
  };
}

export interface WotCard {
  hasStats: boolean;
  rating: number;
  tier: ReturnType<typeof tierFor>;
  topAttr: WotAttrKey | null;
  attributes: CardAttribute[];
}

// Egen 1–99-skala, egna attribut, samma maskineri (scale/tierFor) som CS2.
// Håller sig helt ovetande om CS2 — playerCards.ts är den som väver ihop dem.
export function rateWotCard(m: WotMemberStats): { card: WotCard; derived: WotDerived } {
  const d = derive(m);

  if (!d.hasStats) {
    return { derived: d, card: { hasStats: false, rating: 0, tier: "okänd", topAttr: null, attributes: [] } };
  }

  for (const key of WOT_ATTR_ORDER) {
    d.ratings[key] = scale(WOT_SPEC[key].of(d), WOT_SPEC[key].anchors);
  }

  const attributes = WOT_ATTR_ORDER.map((key) => ({
    key,
    label: WOT_SPEC[key].label,
    description: WOT_SPEC[key].description,
    rating: d.ratings[key],
  }));

  const rating = Math.round(WOT_ATTR_ORDER.reduce((sum, key) => sum + d.ratings[key] * WOT_WEIGHTS[key], 0));

  // Lika betyg avgörs av WOT_ATTR_ORDER, inte av vilken ordning nycklarna
  // råkar ligga i.
  const topAttr = WOT_ATTR_ORDER.reduce((best, key) => (d.ratings[key] > d.ratings[best] ? key : best));

  return {
    derived: d,
    card: { hasStats: true, rating, tier: tierFor(rating), topAttr, attributes },
  };
}
