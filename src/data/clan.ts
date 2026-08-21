import type { CardAttribute, CardTier, StatHighlight } from '../api'

// Ritas med exakt samma kortkomponent som de riktiga gubbarna, så fälten
// matchar. Visas inte längre i produktion — ett API-fel såg tidigare ut som
// en vanlig dag utan medlemmar, se roster.tsx. Kvar bara som testfixtur.
export interface Member {
  nick: string
  position: string
  flavor: string
  overall: number
  tier: CardTier
  attributes: CardAttribute[]
}

// Speglar SPEC i server/src/cs2Cards.ts, så testfixturen förklarar attributen
// på precis samma sätt som de riktiga korten gör.
const ATTR_META = [
  ['SIK', 'Sikte', 'Andel av avlossade skott som träffar'],
  ['SKA', 'Skallar', 'Andel av hans kills som är headshots'],
  ['FRA', 'Frag', 'Kills per spelad runda'],
  ['TÅL', 'Tålighet', 'Hur ofta han överlever rundan'],
  ['NYT', 'Nytta', 'Planterade och desarmerade bomber plus MVP:er, per runda'],
  ['TID', 'Tid', 'Total speltid i CS2'],
] as const

function attrs(...ratings: [number, number, number, number, number, number]): CardAttribute[] {
  return ATTR_META.map(([key, label, description], i) => ({
    key,
    label,
    description,
    rating: ratings[i]!,
  }))
}

export interface Game {
  id: string
  title: string
  status: 'Aktivt' | 'Säsong' | 'På is'
  blurb: string
}

// Testfixtur — importeras inte längre av något produktionskomponent.
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

// Egna rader för Siffrorna, skilda från game.blurb ovan — den står redan i
// Spel-sektionen och skulle bara upprepa sig här. gameId 'steam' är inte ett
// spel i sig utan mock-datans "över alla spel"-post (Mest speltid totalt).
export const gameStatsBlurbs: Record<string, string> = {
  cs2: 'Kulhål, kills och kvällens efternack — här är siffrorna skarpast.',
  wot: 'Pansar, prickskytte och tålamodet att vänta ut hela striden.',
  valheim: 'Vad servern faktiskt burit, mätt i gubbtimmar och trolldöd.',
  satisfactory: 'Fabriken har inga siffror än — men transportbanden växer.',
  steam: 'Räknat över alla spel, inte bara ett.',
}

// ------------------------------------------------------------------
// Testfixtur för stats-sektionen — visas inte längre i produktion, se
// Stats i sections.tsx. Strukturen speglar källorna den en gång stod in för:
//  - CS2: Steam ISteamUserStats/GetUserStatsForGame (appid 730),
//    t.ex. total_kills_ak47, total_kills_headshot, total_matches_won
//  - WoT: Wargaming API (account/info + tanks/stats)
//  - Speltid: Steam IPlayerService/GetOwnedGames (playtime_forever, minuter)
// ------------------------------------------------------------------

// Formen kommer från API:et. Fixturen ska ha exakt samma fält som det riktiga
// svaret — en egen kopia här hade glidit isär och skillnaden märkts först i
// webbläsaren.
export type { StatHighlight } from '../api'

export const statHighlights: StatHighlight[] = [
  {
    gameId: 'cs2',
    gameTitle: 'Counter-Strike 2',
    label: 'Favoritvapen',
    value: 'AK-47',
    holder: 'Gubbe #2',
    detail: '1 337 kills · 42 % headshots',
    standings: [
      { name: 'AK-47', value: '1 337 kills' },
      { name: 'AWP', value: '812 kills' },
      { name: 'M4A4', value: '604 kills' },
    ],
  },
  {
    gameId: 'cs2',
    gameTitle: 'Counter-Strike 2',
    label: 'Flest vunna matcher',
    value: '512',
    holder: 'Gubbe #1',
    detail: 'IGL:n tar åt sig äran för allihop',
    standings: [
      { name: 'Gubbe #1', value: '512' },
      { name: 'Gubbe #5', value: '488' },
      { name: 'Gubbe #2', value: '431' },
    ],
  },
  {
    gameId: 'wot',
    gameTitle: 'World of Tanks',
    label: 'Favoritpansarvagn',
    value: 'T-34',
    holder: 'Gubbe #4',
    detail: '2 041 strider · 54 % winrate',
    standings: [
      { name: 'T-34', value: '2 041 strider' },
      { name: 'KV-1', value: '1 508 strider' },
    ],
  },
  {
    gameId: 'valheim',
    gameTitle: 'Valheim',
    label: 'Flest dödsfall mot troll',
    value: '23',
    holder: 'Gubbe #6',
    detail: '"Jag hade ju träklubban"',
    standings: [
      { name: 'Gubbe #6', value: '23' },
      { name: 'Gubbe #3', value: '17' },
    ],
  },
  {
    gameId: 'satisfactory',
    gameTitle: 'Satisfactory',
    label: 'Längst transportband',
    value: '4,2 km',
    holder: 'Gubbe #3',
    detail: 'Spagettin har egen postkod',
    standings: [
      { name: 'Gubbe #3', value: '4,2 km' },
      { name: 'Gubbe #1', value: '2,8 km' },
    ],
  },
  {
    gameId: 'steam',
    gameTitle: 'Steam',
    label: 'Mest speltid totalt',
    value: '3 812 h',
    holder: 'Gubbe #5',
    detail: 'Hörs aldrig, syns aldrig — men är alltid online',
    standings: [
      { name: 'Gubbe #5', value: '3 812 h' },
      { name: 'Gubbe #2', value: '3 104 h' },
    ],
  },
]

// Discord-inbjudan kommer från backendens /api/config, inte härifrån — se
// useSiteConfig. Så kan den bytas utan att bygga om frontenden.
