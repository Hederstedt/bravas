import { describe, expect, it } from "vitest";
import { parseQuoteInput, MAX_QUOTE_LENGTH, MAX_SAID_BY_LENGTH } from "./quotes.ts";

const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);
const ESC = String.fromCharCode(27);

describe("parseQuoteInput", () => {
  it("accepts an ordinary quote", () => {
    expect(parseQuoteInput({ text: "  Jag hade ju träklubban  ", saidBy: " Gubbe " })).toEqual({
      ok: true,
      value: { text: "Jag hade ju träklubban", saidBy: "Gubbe" },
    });
  });

  it("rejects an empty or whitespace-only quote", () => {
    expect(parseQuoteInput({ text: "   ", saidBy: "Gubbe" }).ok).toBe(false);
    expect(parseQuoteInput({ text: "", saidBy: "Gubbe" }).ok).toBe(false);
  });

  it("rejects a missing attribution", () => {
    expect(parseQuoteInput({ text: "Något roligt", saidBy: "  " }).ok).toBe(false);
  });

  it("rejects anything that is not a string", () => {
    expect(parseQuoteInput({ text: 42, saidBy: "Gubbe" }).ok).toBe(false);
    expect(parseQuoteInput({ text: "Hej", saidBy: { evil: true } }).ok).toBe(false);
    expect(parseQuoteInput(null).ok).toBe(false);
    expect(parseQuoteInput(undefined).ok).toBe(false);
  });

  it("enforces length limits so nobody can paste a novel into the database", () => {
    expect(parseQuoteInput({ text: "x".repeat(MAX_QUOTE_LENGTH), saidBy: "Gubbe" }).ok).toBe(true);
    expect(parseQuoteInput({ text: "x".repeat(MAX_QUOTE_LENGTH + 1), saidBy: "Gubbe" }).ok).toBe(false);
    expect(parseQuoteInput({ text: "Hej", saidBy: "y".repeat(MAX_SAID_BY_LENGTH + 1) }).ok).toBe(false);
  });

  // React escapar vid rendering, men skräptecken ska inte ens nå databasen.
  it("strips control characters instead of storing them", () => {
    const result = parseQuoteInput({ text: `Rush${NUL} B${BEL}`, saidBy: `Gub${ESC}be` });
    expect(result).toEqual({ ok: true, value: { text: "Rush B", saidBy: "Gubbe" } });
  });

  it("collapses newlines and tabs into single spaces", () => {
    const result = parseQuoteInput({ text: "Rush\n\tB", saidBy: "Gubbe" });
    expect(result.ok && result.value.text).toBe("Rush B");
  });

  it("keeps the angle brackets it was given — escaping belongs to the view", () => {
    const result = parseQuoteInput({ text: "<script>alert(1)</script>", saidBy: "Gubbe" });
    expect(result.ok && result.value.text).toBe("<script>alert(1)</script>");
  });
});
