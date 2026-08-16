import { describe, expect, it } from "vitest";
import { MAX_APPLICATION_MESSAGE, parseApplicationInput } from "./applications.ts";

describe("parseApplicationInput", () => {
  it("accepts a few lines about who you are", () => {
    const result = parseApplicationInput({ message: "Hej! Jag lirar CS2 med Mag ibland." });
    expect(result).toEqual({ ok: true, value: { message: "Hej! Jag lirar CS2 med Mag ibland." } });
  });

  // Till skillnad från ett citat är en ansökan inte en enrading — den som
  // skriver ett stycke ska få behålla sina radbrytningar.
  it("keeps line breaks but tidies the runs", () => {
    const result = parseApplicationInput({ message: "Rad ett\n\n\n\nRad två" });
    expect(result).toEqual({ ok: true, value: { message: "Rad ett\n\nRad två" } });
  });

  it("collapses tabs and repeated spaces without touching the newlines", () => {
    const result = parseApplicationInput({ message: "Hej\t\t  där\nnere" });
    expect(result).toEqual({ ok: true, value: { message: "Hej där\nnere" } });
  });

  // Bidi-overrides kan få text att visas bakvänt i admin-listan — de säger
  // ingenting om vem som ansöker och har inget här att göra.
  it("strips control and format characters", () => {
    const result = parseApplicationInput({ message: "Gubbe‮gubbe" });
    expect(result).toEqual({ ok: true, value: { message: "Gubbegubbe" } });
  });

  it("refuses an empty message", () => {
    expect(parseApplicationInput({ message: "   " })).toEqual({
      ok: false,
      error: "message_required",
    });
  });

  it("refuses a missing message", () => {
    expect(parseApplicationInput({})).toEqual({ ok: false, error: "message_required" });
    expect(parseApplicationInput(null)).toEqual({ ok: false, error: "message_required" });
    expect(parseApplicationInput({ message: 42 })).toEqual({
      ok: false,
      error: "message_required",
    });
  });

  it("refuses a message longer than the limit", () => {
    const result = parseApplicationInput({ message: "a".repeat(MAX_APPLICATION_MESSAGE + 1) });
    expect(result).toEqual({ ok: false, error: "message_too_long" });
  });

  it("accepts one exactly at the limit", () => {
    const result = parseApplicationInput({ message: "a".repeat(MAX_APPLICATION_MESSAGE) });
    expect(result.ok).toBe(true);
  });
});
