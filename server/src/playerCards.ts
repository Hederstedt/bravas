import { ATTR_ORDER, rateCard, tierFor, type DerivedCore, type PlayerCard } from "./cs2Cards.ts";
import { assignQuips, type Derived } from "./cs2Quips.ts";
import type { MemberStats } from "./cs2Stats.ts";
import { rateWotCard, WOT_ATTR_ORDER, WOT_POSITIONS } from "./wotCards.ts";
import type { WotMemberStats } from "./wotStats.ts";

// CS2 är basen och WoT är ett tillägg — grunden ska aldrig kunna sjunka för
// att någon länkat ett svagt WoT-konto. Ett rating på 99 (max) ger +5, vilket
// är taket regeln landar på ändå — Math.min är bara ett uttryckligt skydd om
// formeln ändras senare.
const MAX_WOT_BONUS = 5;

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
  wotById: Map<string, WotMemberStats>
): PlayerCard[] {
  const rated = members.map((m) => {
    const cs2Stats = cs2ById.get(m.steamid64);
    const wotStats = wotById.get(m.steamid64);

    const cs2Result = cs2Stats ? rateCard(cs2Stats) : null;
    const wotResult = wotStats ? rateWotCard(wotStats) : null;

    const cs2Derived = cs2Result?.derived ?? emptyCs2Derived();
    const cs2HasStats = cs2Derived.hasStats;
    const wotHasStats = wotResult?.derived.hasStats ?? false;
    const hasStats = cs2HasStats || wotHasStats;

    const cs2Overall = cs2Result?.card.overall ?? 0;
    const wotRating = wotResult?.card.rating ?? 0;

    let overall = 0;
    if (cs2HasStats && wotHasStats) {
      const bonus = Math.min(MAX_WOT_BONUS, Math.round(wotRating / 20));
      overall = Math.min(99, cs2Overall + bonus);
    } else if (cs2HasStats) {
      overall = cs2Overall;
    } else if (wotHasStats) {
      overall = wotRating;
    }

    // Rollen är det enskilt starkaste attributet, oavsett vilket spel det
    // kommer ifrån. Lika höga avgörs till CS2:s fördel — det är basen.
    const cs2Top = cs2HasStats ? Math.max(...ATTR_ORDER.map((k) => cs2Derived.ratings[k])) : 0;
    const wotTop = wotHasStats ? Math.max(...WOT_ATTR_ORDER.map((k) => wotResult!.derived.ratings[k])) : 0;

    let position = "OKÄND";
    if (wotHasStats && wotTop > cs2Top) {
      position = WOT_POSITIONS[wotResult!.card.topAttr!];
    } else if (cs2HasStats) {
      position = cs2Result!.card.position;
    } else if (wotHasStats) {
      position = WOT_POSITIONS[wotResult!.card.topAttr!];
    }

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
