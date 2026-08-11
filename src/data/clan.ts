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
  {
    id: 'minecraft',
    title: 'Minecraft',
    status: 'På is',
    blurb: 'Klassikern. Servern snurrar hemma i garaget när suget kommer.',
  },
]

// Fylls i när Discord-widgeten aktiveras (server-ID) — tills dess bara invite.
export const discordInvite = '#'
