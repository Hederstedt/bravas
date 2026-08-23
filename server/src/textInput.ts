// Delad textrensning för det gubbarna skriver in själva — citat och
// klipprubriker. Regeln är subtil nog att inte vilja ha i två exemplar.

// Fälten är enradiga: radbrytningar och tabbar är whitespace och blir
// mellanslag, medan övriga kontroll- och formattecken (inklusive bidi-overrides
// som kan få text att visas bakvänt) är rent skräp och plockas bort.
// Escaping mot XSS görs inte här — det är vyns ansvar, och React gör det åt oss.
export function cleanText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]+/gu, "")
    .trim();
}

export type FieldResult = { ok: true; value: string } | { ok: false; error: string };

export function textField(raw: unknown, max: number, name: string): FieldResult {
  if (typeof raw !== "string") return { ok: false, error: `${name}_required` };
  const value = cleanText(raw);
  if (!value) return { ok: false, error: `${name}_required` };
  if (value.length > max) return { ok: false, error: `${name}_too_long` };
  return { ok: true, value };
}
