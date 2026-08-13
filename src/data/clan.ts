export interface Member {
  nick: string
  role: string
  flavor: string
}

export interface Game {
  id: string
  title: string
  status: 'Aktivt' | 'Säsong' | 'På is'
  blurb: string
}

// Placeholder-roster tills Steam-syncen kopplas på.
export const members: Member[] = [
  { nick: 'Gubbe #1', role: 'IGL / Serverhusse', flavor: 'Ropar strats, hostar allt' },
  { nick: 'Gubbe #2', role: 'AWP', flavor: 'Ett skott, en ursäkt' },
  { nick: 'Gubbe #3', role: 'Entry', flavor: 'Först in, först ner' },
  { nick: 'Gubbe #4', role: 'Support', flavor: 'Flashar lagkamraterna' },
  { nick: 'Gubbe #5', role: 'Lurker', flavor: 'Hörs aldrig, syns aldrig' },
  { nick: 'Gubbe #6', role: 'Valheim-bonde', flavor: 'Vaktar kolmilan' },
]

export const games: Game[] = [
  {
    id: 'cs2',
    title: 'Counter-Strike 2',
    status: 'Aktivt',
    blurb: 'Huvudspelet. Premier-kvällar, rush B och eftersnack som spårar ur.',
  },
  {
    id: 'wot',
    title: 'World of Tanks',
    status: 'Aktivt',
    blurb: 'Pansar på västgötska. Den som campar i buske vinner.',
  },
  {
    id: 'valheim',
    title: 'Valheim',
    status: 'Säsong',
    blurb: 'Vikingaliv på egen server. Bygger långhus, dör mot trollen.',
  },
  {
    id: 'satisfactory',
    title: 'Satisfactory',
    status: 'Säsong',
    blurb: 'Fabriken sover aldrig. Spagettin av transportband växer.',
  },
]

// ------------------------------------------------------------------
// MOCK-DATA för stats-sektionen. Ersätts av riktiga siffror via BFF:en
// i Steam-sync-fasen. Strukturen speglar källorna:
//  - CS2: Steam ISteamUserStats/GetUserStatsForGame (appid 730),
//    t.ex. total_kills_ak47, total_kills_headshot, total_matches_won
//  - WoT: Wargaming API (account/info + tanks/stats)
//  - Speltid: Steam IPlayerService/GetOwnedGames (playtime_forever, minuter)
// ------------------------------------------------------------------

export interface StatHighlight {
  gameId: string
  gameTitle: string
  label: string
  value: string
  holder: string
  detail: string
}

export const statsIsMock = true

export const statHighlights: StatHighlight[] = [
  {
    gameId: 'cs2',
    gameTitle: 'Counter-Strike 2',
    label: 'Favoritvapen',
    value: 'AK-47',
    holder: 'Gubbe #2',
    detail: '1 337 kills · 42 % headshots',
  },
  {
    gameId: 'cs2',
    gameTitle: 'Counter-Strike 2',
    label: 'Flest vunna matcher',
    value: '512',
    holder: 'Gubbe #1',
    detail: 'IGL:n tar åt sig äran för allihop',
  },
  {
    gameId: 'wot',
    gameTitle: 'World of Tanks',
    label: 'Favoritpansarvagn',
    value: 'T-34',
    holder: 'Gubbe #4',
    detail: '2 041 strider · 54 % winrate',
  },
  {
    gameId: 'valheim',
    gameTitle: 'Valheim',
    label: 'Flest dödsfall mot troll',
    value: '23',
    holder: 'Gubbe #6',
    detail: '"Jag hade ju träklubban"',
  },
  {
    gameId: 'satisfactory',
    gameTitle: 'Satisfactory',
    label: 'Längst transportband',
    value: '4,2 km',
    holder: 'Gubbe #3',
    detail: 'Spagettin har egen postkod',
  },
  {
    gameId: 'steam',
    gameTitle: 'Steam',
    label: 'Mest speltid totalt',
    value: '3 812 h',
    holder: 'Gubbe #5',
    detail: 'Hörs aldrig, syns aldrig — men är alltid online',
  },
]

// Discord-inbjudan kommer från backendens /api/config, inte härifrån — se
// useSiteConfig. Så kan den bytas utan att bygga om frontenden.
