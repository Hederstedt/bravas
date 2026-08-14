import type { PoolPlayer } from "./season.ts";

// Marknaden behöver bara nyckel, namn och värde — betygen är ointressanta för
// själva affären och slipper JSON-parsas i onödan.
export type MarketPlayer = Pick<PoolPlayer, "key" | "name" | "value">;

// Transfermarknaden: byt-mot-poolen, inte lag-till-lag. En truppspelare säljs
// tillbaka till poolen och en oägd poolspelare köps, atomiskt — truppen är
// alltid exakt fem. En såld spelare blir omedelbart köpbar för andra lag, så
// lag-till-lag finns indirekt utan bud och förhandlingsflöden.

// Försäljning ger 70 % av värdet. Rabatten är invarianten mot pengamaskiner:
// varje köp-sälj-rundtur utan träning förlorar pengar, så kassan kan aldrig
// växa av att någon klickar runt.
export const SELL_RATE = 0.7;

// En transfer per lag och ospelad omgång. Omgångar spelas när någon trycker,
// så det finns inget tidsfönster att stänga — kvoten är det som hindrar total
// trupp-churn mellan två matcher.
export const TRANSFERS_PER_MATCHDAY = 1;

export function sellPrice(value: number): number {
  return Math.floor(value * SELL_RATE);
}

export type TransferCheck =
  | { ok: true; soldFor: number; boughtFor: number; newFunds: number }
  | { ok: false; error: string };

// Meddelandena går rakt ut till managern, så de är på svenska. Databasens
// primärnyckel har sista ordet vid race — det här är förklaringen, inte skyddet.
export function validateTransfer(input: {
  sellKey: string;
  buyKey: string;
  squad: readonly MarketPlayer[];
  pool: readonly MarketPlayer[];
  takenKeys: ReadonlySet<string>;
  funds: number;
}): TransferCheck {
  const { sellKey, buyKey, squad, pool, takenKeys, funds } = input;

  if (sellKey === buyKey) {
    return { ok: false, error: "Samma gubbe kan inte säljas och köpas i samma affär." };
  }

  const selling = squad.find((p) => p.key === sellKey);
  if (!selling) {
    return { ok: false, error: "Gubben du vill sälja är inte i din trupp." };
  }

  const buying = pool.find((p) => p.key === buyKey);
  if (!buying) {
    return { ok: false, error: "Gubben du vill köpa finns inte i säsongens pool." };
  }

  if (takenKeys.has(buyKey)) {
    return { ok: false, error: `${buying.name} är redan skriven på ett lag.` };
  }

  const soldFor = sellPrice(selling.value);
  const newFunds = funds + soldFor - buying.value;
  if (newFunds < 0) {
    return {
      ok: false,
      error: `Kassan räcker inte: ${buying.name} kostar ${buying.value} men laget har ${funds + soldFor} efter försäljningen.`,
    };
  }

  return { ok: true, soldFor, boughtFor: buying.value, newFunds };
}
