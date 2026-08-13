export const MAX_QUOTE_LENGTH = 280;
export const MAX_SAID_BY_LENGTH = 64;

export interface QuoteInput {
  text: string;
  saidBy: string;
}

export type ParseResult = { ok: true; value: QuoteInput } | { ok: false; error: string };

// Ett citat är enradigt: radbrytningar och tabbar är whitespace och blir
// mellanslag, medan övriga kontroll- och formattecken (inklusive bidi-overrides
// som kan få text att visas bakvänt) är rent skräp och plockas bort.
// Escaping mot XSS görs inte här — det är vyns ansvar, och React gör det åt oss.
function clean(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]+/gu, "")
    .trim();
}

function field(
  raw: unknown,
  max: number,
  name: string
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: `${name}_required` };
  const value = clean(raw);
  if (!value) return { ok: false, error: `${name}_required` };
  if (value.length > max) return { ok: false, error: `${name}_too_long` };
  return { ok: true, value };
}

export function parseQuoteInput(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "text_required" };
  const { text, saidBy } = body as Record<string, unknown>;

  const parsedText = field(text, MAX_QUOTE_LENGTH, "text");
  if (!parsedText.ok) return parsedText;

  const parsedSaidBy = field(saidBy, MAX_SAID_BY_LENGTH, "saidBy");
  if (!parsedSaidBy.ok) return parsedSaidBy;

  return { ok: true, value: { text: parsedText.value, saidBy: parsedSaidBy.value } };
}
