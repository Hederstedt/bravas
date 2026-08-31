import { scale, tierFor, type CardAttribute } from "./cs2Cards.ts";
import type { WowCharacterStats } from "./wowStats.ts";

export type WowAttrKey = "SAM" | "NIV" | "UTR";

export const WOW_ATTR_ORDER: WowAttrKey[] = ["SAM", "NIV", "UTR"];

// Nuvarande maxnivå i Retail. Måste höjas vid varje expansion — anchors nedan
// hänger på den, och glöms den bort ser en ny maxkaraktär ut att ligga över
// taket i stället för på det. Enda stället talet finns.
export const MAX_LEVEL = 80;

// Under den här nivån säger siffrorna ingenting: en färsk alt har varken
// utrustning eller achievements att bedöma. Samma idé som MIN_BATTLES i
// wotCards.ts och MIN_ROUNDS i cs2Cards.ts.
export const MIN_LEVEL = 60;

type Anchors = readonly (readonly [number, number])[];

const WOW_SPEC: Record<
  WowAttrKey,
  { label: string; description: string; anchors: Anchors; of: (s: WowCharacterStats) => number }
> = {
  SAM: {
    label: "Samlare",
    description: "Achievement points — år i spelet, inte en bra vecka",
    anchors: [
      [0, 1],
      [5000, 30],
      [12000, 55],
      [20000, 75],
      [35000, 95],
    ],
    of: (s) => s.achievementPoints,
  },
  NIV: {
    label: "Nivå",
    description: "Karaktärens nivå",
    anchors: [
      [1, 1],
      [MIN_LEVEL, 40],
      [MAX_LEVEL - 10, 65],
      [MAX_LEVEL, 95],
    ],
    of: (s) => s.level,
  },
  UTR: {
    label: "Utrustning",
    description: "Item level på det han faktiskt bär",
    anchors: [
      [0, 1],
      [400, 30],
      [550, 55],
      [640, 78],
      [720, 95],
    ],
    of: (s) => s.equippedItemLevel,
  },
};

// Samlaren väger tyngst: den mäter år i klanen snarare än en bra vecka, och
// det är den sortens spelande gubbarna faktiskt gör. Nivån väger lättast —
// de flesta mains ligger på taket, så den skiljer mest ut den som fortfarande
// levlar.
const WOW_WEIGHTS: Record<WowAttrKey, number> = {
  SAM: 0.45,
  UTR: 0.35,
  NIV: 0.2,
};

export const WOW_POSITIONS: Record<WowAttrKey, string> = {
  SAM: "SAMLARE",
  NIV: "VETERAN",
  UTR: "UTRUSTAD",
};

export interface WowCard {
  hasStats: boolean;
  rating: number;
  tier: ReturnType<typeof tierFor>;
  topAttr: WowAttrKey | null;
  attributes: CardAttribute[];
}

// Egen 1–99-skala, egna attribut, samma maskineri (scale/tierFor) som CS2 och
// WoT. Vet ingenting om de andra spelen — playerCards.ts väver ihop dem.
export function rateWowCard(s: WowCharacterStats): { card: WowCard } {
  if (s.level < MIN_LEVEL) {
    return { card: { hasStats: false, rating: 0, tier: "okänd", topAttr: null, attributes: [] } };
  }

  const ratings = {} as Record<WowAttrKey, number>;
  for (const key of WOW_ATTR_ORDER) {
    ratings[key] = scale(WOW_SPEC[key].of(s), WOW_SPEC[key].anchors);
  }

  const attributes = WOW_ATTR_ORDER.map((key) => ({
    key,
    label: WOW_SPEC[key].label,
    description: WOW_SPEC[key].description,
    rating: ratings[key],
  }));

  const rating = Math.round(
    WOW_ATTR_ORDER.reduce((sum, key) => sum + ratings[key] * WOW_WEIGHTS[key], 0)
  );

  // Lika betyg avgörs av WOW_ATTR_ORDER, inte av nycklarnas ordning i objektet.
  const topAttr = WOW_ATTR_ORDER.reduce((best, key) => (ratings[key] > ratings[best] ? key : best));

  return { card: { hasStats: true, rating, tier: tierFor(rating), topAttr, attributes } };
}
