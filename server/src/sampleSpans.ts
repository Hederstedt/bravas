// Två pollers loggar sitt tillstånd över tid — spelservern och gubbarnas
// närvaro — och båda behöver samma regel för att räkna om avläsningar till
// tid. Regeln är subtil nog att inte vilja ha i två exemplar: ett glapp
// betyder att vi inte tittade, och tiden räknas då inte alls.

// Pulsrad skrivs var femte minut även när inget ändras. Utan den går tiden
// inte att mäta — se kommentaren i db.ts.
export const HEARTBEAT_MS = 5 * 60 * 1000;

// Ett glapp större än så betyder att API:et var nere. Utan taket hade en
// veckas driftstopp bokförts som en vecka i det läge saker råkade ha när
// strömmen gick.
export const MAX_GAP_MS = 15 * 60 * 1000;

export interface Span<T> {
  from: number;
  to: number;
  row: T;
}

// Varje avläsning gäller fram till nästa. Raderna måste komma i tidsordning.
export function spans<T extends { at: number }>(
  rows: readonly T[],
  maxGapMs = MAX_GAP_MS
): Span<T>[] {
  const out: Span<T>[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const start = rows[i]!;
    const end = rows[i + 1]!;
    const length = end.at - start.at;
    if (length <= 0 || length > maxGapMs) continue;
    out.push({ from: start.at, to: end.at, row: start });
  }
  return out;
}

// Hur mycket av en följd som ligger inom ett fönster. Delvis överlappande
// spann klipps, så en omgång som spelas mitt i en session bara räknar den del
// som hör till rätt sida.
export function clampToWindow<T>(span: Span<T>, from: number, to: number): number {
  const start = Math.max(span.from, from);
  const end = Math.min(span.to, to);
  return Math.max(0, end - start);
}
