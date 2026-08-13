import type { CardAttribute, CardTier } from '../api'

// Platshållarna ritas med exakt samma kortkomponent som de riktiga gubbarna, så
// de bär samma fält. En utloggad besökare ska möta en färdig laguppställning,
// inte tomma rutor som väntar på data.
export interface Member {
  nick: string
  position: string
  flavor: string
  overall: number
  tier: CardTier
  attributes: CardAttribute[]
}

function attrs(sik: number, ska: number, fra: number, tal: number, nyt: number, tid: number) {
  return [
    { key: 'SIK', label: 'Sikte', rating: sik },
    { key: 'SKA', label: 'Skallar', rating: ska },
    { key: 'FRA', label: 'Frag', rating: fra },
    { key: 'TÅL', label: 'Tålighet', rating: tal },
    { key: 'NYT', label: 'Nytta', rating: nyt },
    { key: 'TID', label: 'Tid', rating: tid },
  ]
}

export interface Game {
  id: string
  title: string
  status: 'Aktivt' | 'Säsong' | 'På is'
  blurb: string
}

// Placeholder-roster tills gubbarna loggat in med Steam.
export const members: Member[] = [
  {
    nick: 'Gubbe #1',
    position: 'IGL',
    flavor: 'Ropar strats, hostar allt. Serverhusse på fritiden.',
    overall: 79,
    tier: 'guld',
    attributes: attrs(68, 62, 66, 74, 91, 84),
  },
  {
    nick: 'Gubbe #2',
    position: 'AWP',
    flavor: 'Ett skott, en ursäkt till den som stod bakom.',
    overall: 84,
    tier: 'guld',
    attributes: attrs(93, 71, 82, 79, 63, 88),
  },
  {
    nick: 'Gubbe #3',
    position: 'ENTRY',
    flavor: 'Först in, först ner. Men aldrig ensam.',
    overall: 71,
    tier: 'silver',
    attributes: attrs(66, 78, 88, 41, 58, 72),
  },
  {
    nick: 'Gubbe #4',
    position: 'SUPPORT',
    flavor: 'Flashar lagkamraterna med imponerande precision.',
    overall: 64,
    tier: 'silver',
    attributes: attrs(58, 52, 55, 68, 81, 66),
  },
  {
    nick: 'Gubbe #5',
    position: 'SMYGARE',
    flavor: 'Hörs aldrig, syns aldrig, lever längst av alla.',
    overall: 88,
    tier: 'ikon',
    attributes: attrs(84, 80, 76, 96, 82, 94),
  },
  {
    nick: 'Gubbe #6',
    position: 'BONDE',
    flavor: 'Vaktar kolmilan. Har inte startat CS på ett halvår.',
    overall: 52,
    tier: 'brons',
    attributes: attrs(44, 38, 47, 61, 55, 49),
  },
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
