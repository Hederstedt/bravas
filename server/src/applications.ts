export const MAX_APPLICATION_MESSAGE = 500;

export interface ApplicationInput {
  message: string;
}

export type ParseResult = { ok: true; value: ApplicationInput } | { ok: false; error: string };

// En ansökan är några rader om vem man är, inte en enrading som ett citat, så
// radbrytningarna får leva. Blanksteg av alla slag blir vanliga mellanslag, och
// övriga kontroll- och formattecken (inklusive bidi-overrides som kan få texten
// att visas bakvänt i admin-listan) plockas bort. Escaping mot XSS görs inte
// här — det är vyns ansvar, och React gör det åt oss.
function clean(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "\n" ? c : ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseApplicationInput(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "message_required" };
  const { message } = body as Record<string, unknown>;

  if (typeof message !== "string") return { ok: false, error: "message_required" };
  const value = clean(message);
  if (!value) return { ok: false, error: "message_required" };
  if (value.length > MAX_APPLICATION_MESSAGE) return { ok: false, error: "message_too_long" };

  return { ok: true, value: { message: value } };
}
