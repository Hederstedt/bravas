import { textField } from "./textInput.ts";

export const MAX_QUOTE_LENGTH = 280;
export const MAX_SAID_BY_LENGTH = 64;

export interface QuoteInput {
  text: string;
  saidBy: string;
}

export type ParseResult = { ok: true; value: QuoteInput } | { ok: false; error: string };

export function parseQuoteInput(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "text_required" };
  const { text, saidBy } = body as Record<string, unknown>;

  const parsedText = textField(text, MAX_QUOTE_LENGTH, "text");
  if (!parsedText.ok) return parsedText;

  const parsedSaidBy = textField(saidBy, MAX_SAID_BY_LENGTH, "saidBy");
  if (!parsedSaidBy.ok) return parsedSaidBy;

  return { ok: true, value: { text: parsedText.value, saidBy: parsedSaidBy.value } };
}
