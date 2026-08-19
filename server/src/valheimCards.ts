import { scale, tierFor, type Tier } from "./cs2Cards.ts";
import type { MemberPlaytime } from "./valheimPlaytime.ts";

// Steam ger oss bara ett mått för Valheim: livstidsspeltid (se valheimPlaytime.ts
// — GetSchemaForGame svarar tomt, inget spel-API att räkna skicklighet ur).
// Betyget här är därför rent deltagande, inte prestation, samma ankare som
// CS2:s TID-attribut (cs2Cards.ts) återanvänds för att hålla skalan jämförbar.
const HOURS_ANCHORS: readonly (readonly [number, number])[] = [
  [0, 1],
  [50, 30],
  [300, 55],
  [1000, 75],
  [3000, 92],
  [6000, 99],
];

export interface ValheimCard {
  hasStats: boolean;
  rating: number;
  tier: Tier;
}

// Ingen tröskel utöver "något registrerat" — till skillnad från CS2/WoT:s
// omgångs-/stridsgränser finns ingen tur som kan snedvrida ren speltid.
export function rateValheimCard(m: MemberPlaytime): { card: ValheimCard } {
  if (m.minutes <= 0) {
    return { card: { hasStats: false, rating: 0, tier: "okänd" } };
  }

  const hours = m.minutes / 60;
  const rating = scale(hours, HOURS_ANCHORS);

  return { card: { hasStats: true, rating, tier: tierFor(rating) } };
}
