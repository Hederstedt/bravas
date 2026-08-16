import type { AttrKey } from "./cs2Cards.ts";
import { hashSeed } from "./rng.ts";

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
  // Ofyllda för den som inte länkat World of Tanks — reglerna som tittar på
  // dem kollar hasWotStats först, se matchingRules.
  hasWotStats?: boolean;
  wotBattles?: number;
  wotWinRate?: number;
  wotDamagePerBattle?: number;
  wotSurvivalRate?: number;
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
    // Sex av tio profiler kan vara stängda samtidigt, och varje låst gubbe tar
    // en rad ur den här poolen. Den måste räcka till dem allihop.
    lines: [
      "Steam-profilen är låst. Vi vet ingenting, och han vill nog ha det så.",
      "Profilen är privat. Antingen är han pinsamt bra eller pinsamt dålig.",
      "Ingen statistik ute. Han säger att det är en principsak.",
      "Stängd profil. Siffrorna finns, vi får bara inte se dem.",
      "Har dragit ner rullgardinen på Steam. Ingen vet varför.",
      "Profilen säger ingenting. Det gör han också när man frågar.",
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
    id: "wot-only",
    // Inte "profilen är låst" — det är fel besked till någon som bara aldrig
    // rört CS2. matchingRules hoppar över private-regeln när det här stämmer.
    when: (d) => !d.hasStats && !!d.hasWotStats,
    lines: [
      "Har aldrig loggat CS-tid som räknas. Pansarvagnar är hela hans grej.",
      "CS2 är inte hans spel. Han lever i tornet på en Tiger.",
      "Ingen CS-statistik att tala om. Det mesta av honom finns i garaget.",
    ],
  },
  {
    id: "wot-ace",
    when: (d) => !!d.hasWotStats && (d.wotWinRate ?? 0) >= 0.58,
    lines: [
      "Vinner striden innan den ens börjat. Nån läser kartan bättre än laget.",
      "Segerprocenten sticker ut. Han ropar aldrig ut positioner, men vinner ändå.",
      "Har koll på var striden avgörs innan den gör det.",
    ],
  },
  {
    id: "wot-brawler",
    when: (d) => !!d.hasWotStats && (d.wotDamagePerBattle ?? 0) >= 1600 && (d.wotSurvivalRate ?? 1) <= 0.3,
    lines: [
      "Delar ut stryk och tar emot lika mycket. Överlever sällan, ångrar aldrig.",
      "Kör in mitt i striden och skjuter tills nån går sönder. Ofta han själv, till slut.",
      "Skadan är hög, livslängden inte. Prioriteringar.",
    ],
  },
  {
    id: "wot-turtle",
    when: (d) => !!d.hasWotStats && (d.wotSurvivalRate ?? 0) >= 0.5,
    lines: [
      "Överlever nästan varje strid. Vagnen har mer buskage än pansar vid det här laget.",
      "Sist kvar, som vanligt. Nån måste ju städa upp.",
      "Håller sig vid liv längre än de flesta. Buskkrigare, uttalat.",
    ],
  },
  {
    id: "dual-game",
    when: (d) => d.hasStats && !!d.hasWotStats,
    lines: [
      "Byter mellan crosshair och periskop utan att blinka. Skiftesarbete på västgötska.",
      "Lirar både CS och pansar. Ingen vet vilket han hellre är i.",
      "Har statistik i två spel och tid över till ett tredje. Imponerande, eller oroväckande.",
    ],
  },
  {
    id: "fallback",
    when: () => true,
    // Här hamnar alla utan särdrag, så poolen måste vara den största av alla —
    // i värsta fall är hela klanen omärkvärdig samtidigt och var och en ska
    // ändå få en egen rad.
    lines: [
      "Goa gubben. Statistiken säger inget särskilt, men eftersnacket säger allt.",
      "Inget sticker ut i siffrorna. Han håller jämna plågor hela vägen.",
      "Statistiskt fullständigt normal. Det är också en prestation.",
      "Gör sitt, säger inte mycket, dyker alltid upp på kvällen.",
      "Varken bäst eller sämst. Någon ska ju hålla mitten.",
      "Siffrorna är oförargliga. Precis som han.",
      "Ingen har något att anmärka på. Ingen har något att berömma heller.",
      "Lirar på. Det är ungefär vad som går att säga, och det räcker.",
      "Helt genomsnittlig, med besked. Det krävs disciplin.",
      "Ligger mitt i tabellen i allt. Man vet var man har honom.",
      "Har inga toppar och inga dalar. Bara en lång platå.",
      "Statistiken vägrar säga något roligt om honom. Vi har försökt.",
    ],
  },
];

function fill(line: string, d: Derived): string {
  return line
    .replaceAll("{timmar}", nf.format(Math.round(d.hours)))
    .replaceAll("{dygn}", nf.format(Math.round(d.hours / 24)))
    .replaceAll("{kills}", nf.format(Math.round(d.kills)));
}

const PRIVATE_RULE = QUIP_RULES.find((r) => r.id === "private")!;
const FALLBACK_RULE = QUIP_RULES.find((r) => r.id === "fallback")!;

function quipFrom(rule: QuipRule, index: number, d: Derived): Quip {
  return { ruleId: rule.id, text: fill(rule.lines[index]!, d) };
}

// Reglerna en gubbe faktiskt kan få något ur. En låst profil har bara en sak
// att säga om sig, så den kortsluter resten — men bara om han inte har WoT att
// visa upp i stället. "Profilen är låst" vore fel besked till någon som bara
// aldrig rört CS2.
function matchingRules(d: Derived): QuipRule[] {
  if (PRIVATE_RULE.when(d) && !d.hasWotStats) return [PRIVATE_RULE];
  return QUIP_RULES.filter((r) => r.id !== "private" && r.id !== "fallback" && r.when(d));
}

// Börjar på den hash-valda varianten och stegar runt tills en som ingen annan
// tagit dyker upp. Nyckeln är regel plus variantnummer, inte den färdiga
// texten: annars hade två veteraner kunnat få samma mening med olika siffror i
// och läst som en upprepning.
function takeUnused(rule: QuipRule, d: Derived, seed: string, used: Set<string>): Quip | null {
  const start = hashSeed(`${seed}:${rule.id}`) % rule.lines.length;
  for (let step = 0; step < rule.lines.length; step++) {
    const index = (start + step) % rule.lines.length;
    const key = `${rule.id}#${index}`;
    if (used.has(key)) continue;
    used.add(key);
    return quipFrom(rule, index, d);
  }
  return null;
}

export interface QuipSubject {
  id: string;
  derived: Derived;
}

// Tilldelningen sker över hela laget, inte per gubbe. Väljer man oberoende får
// två gubbar som matchar samma regel samma rad så fort hasharna krockar — med
// tio gubbar och en handfull varianter per regel är det snarare regel än
// undantag.
//
// Ordningen är färst matchande regler först: den som bara matchar en enda regel
// måste få välja innan de mångsidiga äter upp hans enda rad. Lika antal avgörs
// på id så tilldelningen står still mellan körningar.
export function assignQuips(subjects: QuipSubject[]): Map<string, Quip[]> {
  const used = new Set<string>();
  const assigned = new Map<string, Quip[]>();

  const order = subjects
    .map((s) => ({ ...s, rules: matchingRules(s.derived) }))
    .sort((a, b) => a.rules.length - b.rules.length || a.id.localeCompare(b.id));

  for (const { id, derived, rules } of order) {
    const quips: Quip[] = [];

    for (const rule of rules) {
      if (quips.length >= MAX_QUIPS) break;
      const quip = takeUnused(rule, derived, id, used);
      if (quip) quips.push(quip);
    }

    // Fallback bara när inget annat sagt något — annars hade varje kort
    // avslutats med "inget sticker ut" trots att något gjorde det.
    if (quips.length === 0) {
      const quip = takeUnused(FALLBACK_RULE, derived, id, used);
      // Är även den poolen slut får en rad återanvändas. Ett kort utan
      // kommentar vore sämre än en upprepning.
      quips.push(quip ?? quipFrom(FALLBACK_RULE, hashSeed(id) % FALLBACK_RULE.lines.length, derived));
    }

    assigned.set(id, quips);
  }

  return assigned;
}

// Enskild gubbe, utan lag att ta hänsyn till. Används av tester och av den som
// bara vill se vad en viss statistik ger.
export function buildQuips(d: Derived, seed: string): Quip[] {
  return assignQuips([{ id: seed, derived: d }]).get(seed)!;
}
