import { ATTR_ORDER, type AttrKey } from "./cs2Cards.ts";

// Träningen: ett pass riktar sig mot ett attribut på en spelare i egna
// truppen. Ingen slump — seedad rng finns i kodbasen för att kunna återskapa
// matcher, men ett träningspass är ett managerbeslut vars effekt ska vara
// förutsägbar. Kurvan ger balansen, inte tärningen.

// Över 90 går det inte att träna någon. Resten av vägen dit får formen komma
// från live-statistiken i Steam.
export const TRAINING_CAP = 90;

// Två pass per lag och ospelad omgång. Med ~10 omgångar blir det ~20 pass på
// hela truppen — ingen kan maxa allt, och det är poängen.
export const SESSIONS_PER_MATCHDAY = 2;

// Avtagande avkastning: en 40-spelare får +6, en 82-spelare +1. Utvecklings-
// strategin — köp billigt, träna upp, sälj dyrt — är avsiktligt spel, eftersom
// passen är den knappa resursen, inte pengarna.
export function trainingGain(rating: number): number {
  return Math.min(6, Math.max(1, Math.round((TRAINING_CAP - rating) / 8)));
}

export function isAttrKey(value: string): value is AttrKey {
  return (ATTR_ORDER as readonly string[]).includes(value);
}

export type TrainingCheck = { ok: true; gain: number } | { ok: false; error: string };

// Meddelandena går rakt ut till managern, så de är på svenska.
export function validateTraining(input: {
  playerName: string;
  rating: number | undefined;
}): TrainingCheck {
  const { playerName, rating } = input;

  if (rating === undefined) {
    return { ok: false, error: `${playerName} har inget sådant attribut att träna.` };
  }

  if (rating >= TRAINING_CAP) {
    return { ok: false, error: `${playerName} är redan färdigtränad där — kurvan tar slut vid ${TRAINING_CAP}.` };
  }

  return { ok: true, gain: trainingGain(rating) };
}
