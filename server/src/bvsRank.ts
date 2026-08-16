// BVS egen rangordning, inte lånad från CS2 (AWP, ENTRY...) eller WoT
// (TAKTIKER, KANON...). Samma titlar oavsett vilket spel poängen kom ifrån,
// så "vad betyder AWP?" aldrig blir en fråga igen — bara betyget avgör.
export const RANK_LADDER: readonly (readonly [number, string])[] = [
  [0, "MENIG"],
  [15, "KORPRAL"],
  [30, "SERGEANT"],
  [45, "LÖJTNANT"],
  [60, "KAPTEN"],
  [75, "ÖVERSTE"],
  [90, "GENERAL"],
];

export function rankFor(overall: number): string {
  let rank = RANK_LADDER[0]![1];
  for (const [threshold, name] of RANK_LADDER) {
    if (overall >= threshold) rank = name;
  }
  return rank;
}
