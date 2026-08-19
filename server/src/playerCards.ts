import { rankFor } from "./bvsRank.ts";
import { rateCard, tierFor, type DerivedCore, type PlayerCard } from "./cs2Cards.ts";
import { assignQuips, type Derived } from "./cs2Quips.ts";
import type { MemberStats } from "./cs2Stats.ts";
import { rateValheimCard } from "./valheimCards.ts";
import type { MemberPlaytime } from "./valheimPlaytime.ts";
import { rateWotCard } from "./wotCards.ts";
import type { WotMemberStats } from "./wotStats.ts";

// Ett spel är basen och varje ytterligare rankat spel — CS2, WoT eller
// Valheim, fler kan följa samma mönster senare — lägger på en rejäl bonus
// ovanpå, aldrig ett avdrag. Meningen är att det ska synas: klanens eget
// betyg ska löna sig att bygga ut, inte bara vara en CS2-siffra med ett
// stänk annat spel i marginalen. Grunden kan aldrig sjunka för att någon
// länkat ett svagt konto — Math.min är ett uttryckligt tak, inte bara vad
// formeln råkar landa på.
const MAX_EXTRA_GAME_BONUS = 15;

// Samma divisor för alla bonuskällor — de är redan 1–99-skalor, så ett
// toppbetyg (99) ger ungefär taket (15) i bonus, oavsett vilket spel det kom
// ifrån.
function bonusFrom(rating: number): number {
  return Math.min(MAX_EXTRA_GAME_BONUS, Math.round(rating / 7));
}

// Samma nollställda form som cs2Cards.ts:s egen derive() ger för en gubbe utan
// statistik — men den behövs här även för någon som aldrig funnits i
// cs2_stats-cachen alls, där det inte finns något riktigt derive()-anrop att
// läsa av.
function emptyCs2Derived(): DerivedCore {
  return {
    hasStats: false,
    ratings: { SIK: 0, SKA: 0, FRA: 0, TÅL: 0, NYT: 0, TID: 0 },
    rounds: 0,
    kills: 0,
    deaths: 0,
    hours: 0,
    accuracy: 0,
    hsRate: 0,
    mvpRate: 0,
    objectiveRate: 0,
    knifeKills: 0,
    taserKills: 0,
    defusedBombs: 0,
    shotsFired: 0,
    moneyPerRound: 0,
    pistolWinRate: 0,
    blindKills: 0,
    topWeapon: null,
  };
}

interface CrewMember {
  steamid64: string;
  personaName: string;
}

// Väver ihop CS2- och WoT-betyg till ett enda kort. Betygsättningen är
// oberoende av kommentarerna precis som i cs2Cards.ts — kommentarerna
// tilldelas över hela laget efteråt, inte per gubbe.
export function buildCombinedCards(
  members: CrewMember[],
  cs2ById: Map<string, MemberStats>,
  wotById: Map<string, WotMemberStats>,
  valheimById: Map<string, MemberPlaytime> = new Map()
): PlayerCard[] {
  const rated = members.map((m) => {
    const cs2Stats = cs2ById.get(m.steamid64);
    const wotStats = wotById.get(m.steamid64);
    const valheimStats = valheimById.get(m.steamid64);

    const cs2Result = cs2Stats ? rateCard(cs2Stats) : null;
    const wotResult = wotStats ? rateWotCard(wotStats) : null;
    const valheimResult = valheimStats ? rateValheimCard(valheimStats) : null;

    const cs2Derived = cs2Result?.derived ?? emptyCs2Derived();
    const cs2HasStats = cs2Derived.hasStats;
    const wotHasStats = wotResult?.derived.hasStats ?? false;
    const valheimHasStats = valheimResult?.card.hasStats ?? false;
    const hasStats = cs2HasStats || wotHasStats || valheimHasStats;

    const cs2Overall = cs2Result?.card.overall ?? 0;
    const wotRating = wotResult?.card.rating ?? 0;
    const valheimRating = valheimResult?.card.rating ?? 0;

    // Basen är det första rankade spelet i CS2 > WoT > Valheim-ordning,
    // resten lägger på var sin kapad bonus. Samma "aldrig ett avdrag"-regel
    // som tidigare, nu bara för upp till tre källor i stället för två.
    let overall = 0;
    if (cs2HasStats) {
      overall = cs2Overall;
      if (wotHasStats) overall += bonusFrom(wotRating);
      if (valheimHasStats) overall += bonusFrom(valheimRating);
    } else if (wotHasStats) {
      overall = wotRating;
      if (valheimHasStats) overall += bonusFrom(valheimRating);
    } else if (valheimHasStats) {
      overall = valheimRating;
    }
    overall = Math.min(99, overall);

    // BVS egen rang, inte "AWP" eller "TAKTIKER" — samma titlar oavsett vilket
    // spel betyget kom ifrån, se bvsRank.ts.
    const position = hasStats ? rankFor(overall) : "OKÄND";

    const derived: Derived = {
      ...cs2Derived,
      hasWotStats: wotHasStats,
      wotBattles: wotResult?.derived.battles,
      wotWinRate: wotResult?.derived.winRate,
      wotDamagePerBattle: wotResult?.derived.damagePerBattle,
      wotSurvivalRate: wotResult?.derived.survivalRate,
    };

    const card: Omit<PlayerCard, "comments"> = {
      steamid64: m.steamid64,
      personaName: m.personaName,
      hasStats,
      overall,
      tier: hasStats ? tierFor(overall) : "okänd",
      position,
      attributes: cs2Result?.card.attributes ?? [],
      wotAttributes: wotResult?.card.attributes ?? [],
    };

    return { card, derived };
  });

  const quips = assignQuips(rated.map(({ card, derived }) => ({ id: card.steamid64, derived })));

  return rated
    .map(({ card }) => ({ ...card, comments: (quips.get(card.steamid64) ?? []).map((q) => q.text) }))
    .sort(
      (a, b) =>
        Number(b.hasStats) - Number(a.hasStats) ||
        b.overall - a.overall ||
        a.personaName.localeCompare(b.personaName, "sv")
    );
}
