import type { PresenceSample } from "./db.ts";
import { clampToWindow, spans } from "./sampleSpans.ts";

// Tvärspelspoäng: det man faktiskt lirar ska märkas i managern.
//
// Den hårda regeln är att aktiviteten **aldrig** får röra spelarbetygen.
// Poolen fryses vid säsongsstart just för att en bra kväll i CS2 inte ska
// ändra en gubbes pris mitt i en pågående serie — se manager.md. Rivs den
// invarianten faller hela transfermarknaden.
//
// Belöningen går därför till managerns *resurser*: fler träningspass och en
// extra affär. Knappheten per omgång är ändå den skruv spelet vrider på, så
// det är där en belöning hör hemma.
//
// Och den räknas fram, aldrig lagras. Kvoterna är redan "gräns minus använt
// den här omgången", så en bonus som höjer gränsen kan inte växlas in två
// gånger: samma timmar spenderas inte, de bestämmer bara takets höjd i det
// fönster de ligger i. Ingen avstämplingstabell behövs.

// Managern handlar om CS2, så timmar där ger träning — man övar. Tid i
// klanens andra spel ger en affär i stället: man umgås och hör vad folk vill.
export const CS2_GAME = "Counter-Strike 2";

// Trösklar valda så att en vanlig kväll märks men inte avgör. Tre timmar CS2
// mellan två omgångar är en riktig kväll, inte en runda i förbifarten.
export const HOURS_PER_TRAINING = 3;
export const HOURS_PER_TRANSFER = 4;

// Taken är det som hindrar den som lirar dygnet runt från att göra serien
// meningslös. Som mest dubblas kvoterna.
export const MAX_TRAINING_BONUS = 2;
export const MAX_TRANSFER_BONUS = 1;

export interface ActivityHours {
  cs2: number;
  other: number;
}

export interface ActivityBonus {
  hours: ActivityHours;
  training: number;
  transfer: number;
}

export const NO_ACTIVITY: ActivityBonus = {
  hours: { cs2: 0, other: 0 },
  training: 0,
  transfer: 0,
};

// Timmar per spelkategori inom fönstret. Ett spann som börjar före fönstret
// eller slutar efter det klipps, så en omgång som spelas mitt i en session
// bara räknar den del som hör till rätt sida.
export function hoursInWindow(
  samples: readonly PresenceSample[],
  from: number,
  to: number
): ActivityHours {
  let cs2 = 0;
  let other = 0;

  for (const span of spans(samples)) {
    const ms = clampToWindow(span, from, to);
    if (ms === 0) continue;
    if (span.row.game === CS2_GAME) cs2 += ms;
    else other += ms;
  }

  return { cs2: cs2 / 3_600_000, other: other / 3_600_000 };
}

export function bonusFrom(hours: ActivityHours): ActivityBonus {
  return {
    hours,
    training: Math.min(MAX_TRAINING_BONUS, Math.floor(hours.cs2 / HOURS_PER_TRAINING)),
    transfer: Math.min(MAX_TRANSFER_BONUS, Math.floor(hours.other / HOURS_PER_TRANSFER)),
  };
}

export function activityBonus(
  samples: readonly PresenceSample[],
  from: number,
  to: number
): ActivityBonus {
  return bonusFrom(hoursInWindow(samples, from, to));
}
