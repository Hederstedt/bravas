// Källa: Mikaels Steam-vänlista, filtrerad på "[BVS]" i personanamnet (2026-08-12).
// Namnen är bara till för spårbarhet i seedningen — själva profilnamnet cachas i members-tabellen vid inloggning.
// Mikaels eget konto står först: det ingår inte i hans egen vänlista och fångas
// därför aldrig av filtret, trots att han har taggen.
export const allowlistSeed: { steamid64: string; note: string }[] = [
  { steamid64: "76561198060166361", note: "[BVS] Kungalv" },
  { steamid64: "76561198360569618", note: "[BVS] ⛟" },
  { steamid64: "76561198449272295", note: "[BVS] Berry ⛟ Long Hauler ⛟" },
  { steamid64: "76561197963771177", note: "[BVS] g0nza" },
  { steamid64: "76561198053832683", note: "[BVS] #Mag" },
  { steamid64: "76561198726711900", note: "[BVS] Papa Blue" },
  { steamid64: "76561197994419577", note: "[BVS] Profellorn" },
  { steamid64: "76561198160612460", note: "[BVS] Raustabout" },
  { steamid64: "76561198081249347", note: "[BVS]RäddarenIRöven" },
  { steamid64: "76561199395789022", note: "[BVS] Töjd Vips" },
];
