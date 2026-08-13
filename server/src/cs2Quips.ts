import type { AttrKey } from "./cs2Cards.ts";

// Allt en regel får titta på. Råsiffrorna är redan omvandlade till kvoter här,
// så reglerna slipper dividera och blir läsbara som villkor.
export interface Derived {
  hasStats: boolean;
  ratings: Record<AttrKey, number>;
  rounds: number;
  kills: number;
  deaths: number;
  hours: number;
  accuracy: number;
  hsRate: number;
  mvpRate: number;
  knifeKills: number;
  taserKills: number;
  defusedBombs: number;
  shotsFired: number;
  moneyPerRound: number;
  pistolWinRate: number;
  blindKills: number;
  topWeapon: string | null;
}

export interface Quip {
  ruleId: string;
  text: string;
}

export interface QuipRule {
  id: string;
  when: (d: Derived) => boolean;
  lines: string[];
}

const MAX_QUIPS = 2;

const nf = new Intl.NumberFormat("sv-SE");

// Ordningen är prioriteringen: det som säger mest om gubben står först. De två
// första träffarna hamnar på kortet, resten faller bort.
export const QUIP_RULES: QuipRule[] = [
  {
    id: "private",
    when: (d) => !d.hasStats,
    lines: [
      "Steam-profilen är låst. Vi vet ingenting, och han vill nog ha det så.",
      "Profilen är privat. Antingen är han pinsamt bra eller pinsamt dålig.",
      "Ingen statistik ute. Han säger att det är en principsak.",
    ],
  },
  {
    id: "lurker",
    when: (d) => d.ratings.TÅL >= 78 && d.ratings.FRA <= 55,
    lines: [
      "Smyger runt mest. Dyker upp när röken lagt sig och tar sista fragget.",
      "Överlever allt. Strategin är att inte vara där när det smäller.",
      "Hittas oftast i ett hörn på andra sidan kartan. Lever längst av alla.",
    ],
  },
  {
    id: "entry",
    when: (d) => d.ratings.FRA >= 75 && d.ratings.TÅL <= 50,
    lines: [
      "Först in, först ner. Men aldrig ensam.",
      "Öppnar rundan med kroppen. Någon ska ju göra det.",
      "Springer in i tvåan innan någon hunnit ropa stopp. Ibland funkar det.",
    ],
  },
  {
    id: "awp",
    when: (d) => d.ratings.SIK >= 80 && d.topWeapon === "awp",
    lines: [
      "Träffar allt utom vardagsrummet. AWP:n är hopvuxen med händerna.",
      "Köper AWP varje runda. Ekonomin är lagets problem, inte hans.",
      "Ett skott, en ursäkt till den som stod bakom.",
    ],
  },
  {
    id: "skalle",
    when: (d) => d.hsRate >= 0.55,
    lines: [
      "Siktar bara på huvudet. Resten av kroppen är valfri.",
      "Går rakt på skallen. Har aldrig sett poängen med bröstkorgen.",
      "Crosshairen står på huvudhöjd även när han hämtar kaffe.",
    ],
  },
  {
    id: "spray",
    // Låg träffsäkerhet på ett litet urval är otur. Först när tillräckligt
    // många skott gått iväg är det en spelstil värd att kommentera.
    when: (d) => d.accuracy <= 0.14 && d.shotsFired > 100000,
    lines: [
      "Sprayar först, frågar sen. Väggarna på Dust II bär spår.",
      "Håller inne avtryckaren tills något faller. Ofta han själv.",
      "Träffsäkerheten är låg, men volymen kompenserar.",
    ],
  },
  {
    id: "kniv",
    when: (d) => d.knifeKills >= 100,
    lines: [
      "Har hittat kniven i inventoryt. Alla lider, ingen mer än han själv.",
      "Knivar hellre än vinner. Prioriteringar.",
      "Springer fram med kniven som om det vore en plan.",
    ],
  },
  {
    id: "zeus",
    when: (d) => d.taserKills >= 15,
    lines: [
      "Zeus-entusiast. Vi pratar inte om det, men vi räknar.",
      "Har köpt Zeus igen. Vi har slutat säga ifrån.",
      "Taser i handen och hopp i hjärtat.",
    ],
  },
  {
    id: "veteran",
    when: (d) => d.hours >= 2000,
    lines: [
      "{timmar} timmar i CS. Det är {dygn} dygn av hans liv, och han ångrar inget.",
      "{timmar} timmar bakom skärmen — {dygn} dygn. Han kallar det erfarenhet.",
      "{dygn} dygn i CS2, {timmar} timmar exakt. Frugan har slutat fråga.",
    ],
  },
  {
    id: "mvp",
    when: (d) => d.mvpRate >= 0.15,
    lines: [
      "Får MVP-låten oftare än han får ordning på mikrofonen.",
      "Samlar MVP:er som andra samlar ursäkter.",
      "MVP igen. Han kommer påminna om det i eftersnacket.",
    ],
  },
  {
    id: "defuse",
    when: (d) => d.defusedBombs >= 200,
    lines: [
      "Springer alltid mot bomben. Ibland hinner han fram.",
      "Defusar med en sekund kvar och tar tio år av lagets livslängd.",
      "Har klippt fler sladdar än en pensionerad elektriker.",
    ],
  },
  {
    id: "ekonom",
    when: (d) => d.moneyPerRound >= 3500,
    lines: [
      "Ekonomen. Sparar hela halvleken och köper AWP till sista rundan.",
      "Har mer pengar än alla andra och ändå aldrig en full buy.",
      "Force buy är ett främmande begrepp. Han sparar.",
    ],
  },
  {
    id: "pistol",
    when: (d) => d.pistolWinRate >= 0.08,
    lines: [
      "Pistolrundekung. Sedan tar det stopp.",
      "Vinner pistolrundan och lovar att resten ska gå lika bra. Det gör den inte.",
      "Glocken är hans bästa vapen. Det säger en del.",
    ],
  },
  {
    id: "blind",
    when: (d) => d.blindKills >= 300,
    lines: [
      "Blindar dem först. Sportsligt är det diskutabelt.",
      "Flashar in och skjuter det som snubblar. Effektivt, inte vackert.",
      "Har byggt hela karriären på att andra inte ser något.",
    ],
  },
  {
    id: "fallback",
    when: () => true,
    lines: [
      "Goa gubben. Statistiken säger inget särskilt, men eftersnacket säger allt.",
      "Inget sticker ut i siffrorna. Han håller jämna plågor hela vägen.",
      "Statistiskt fullständigt normal. Det är också en prestation.",
      "Gör sitt, säger inte mycket, dyker alltid upp på kvällen.",
    ],
  },
];

// FNV-1a. Vilken variant en gubbe får ska stå still mellan sidladdningar — med
// Math.random hade raden hoppat varje gång sidan uppdaterades, och testerna
// hade inte gått att skriva.
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function fill(line: string, d: Derived): string {
  return line
    .replaceAll("{timmar}", nf.format(Math.round(d.hours)))
    .replaceAll("{dygn}", nf.format(Math.round(d.hours / 24)))
    .replaceAll("{kills}", nf.format(Math.round(d.kills)));
}

function pick(rule: QuipRule, d: Derived, seed: string): Quip {
  const line = rule.lines[hash(`${seed}:${rule.id}`) % rule.lines.length]!;
  return { ruleId: rule.id, text: fill(line, d) };
}

// Högst två rader per kort: en tredje gör kortet till en uppsats och den roliga
// poängen dör. Fallback-regeln används bara när inget annat sagt något, annars
// hade varje kort avslutats med "inget sticker ut" trots att något gjorde det.
export function buildQuips(d: Derived, seed: string): Quip[] {
  const locked = QUIP_RULES.find((r) => r.id === "private")!;
  if (locked.when(d)) return [pick(locked, d, seed)];

  const matched = QUIP_RULES.filter((r) => r.id !== "private" && r.id !== "fallback" && r.when(d));
  if (matched.length === 0) {
    const fallback = QUIP_RULES.find((r) => r.id === "fallback")!;
    return [pick(fallback, d, seed)];
  }

  return matched.slice(0, MAX_QUIPS).map((r) => pick(r, d, seed));
}
