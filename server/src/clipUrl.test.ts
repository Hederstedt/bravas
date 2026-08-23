import { describe, expect, it } from "vitest";
import { parseClipInput, parseClipUrl } from "./clipUrl.ts";

describe("parseClipUrl — YouTube", () => {
  it("känner igen de fyra formerna en länk kan komma i", () => {
    const forms = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ];

    for (const url of forms) {
      expect(parseClipUrl(url)).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
    }
  });

  it("bryr sig inte om m., utan www eller extra parametrar", () => {
    expect(parseClipUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s")).toEqual({
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
    expect(parseClipUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
  });

  // Ett video-id är alltid elva tecken ur ett känt alfabet. Allt annat är
  // antingen inte ett id eller ett försök att smuggla med något.
  it("avvisar id som inte ser ut som ett id", () => {
    expect(parseClipUrl("https://youtu.be/kort")).toBeNull();
    expect(parseClipUrl("https://youtu.be/dQw4w9WgXcQextra")).toBeNull();
    expect(parseClipUrl('https://youtu.be/dQw4w9WgX"Q')).toBeNull();
    expect(parseClipUrl("https://www.youtube.com/watch?v=")).toBeNull();
    expect(parseClipUrl("https://www.youtube.com/")).toBeNull();
  });
});

describe("parseClipUrl — Twitch", () => {
  it("tar både clips-domänen och kanalvägen", () => {
    expect(parseClipUrl("https://clips.twitch.tv/SpicyCrunchyOtterKappa")).toEqual({
      provider: "twitch",
      videoId: "SpicyCrunchyOtterKappa",
    });
    expect(parseClipUrl("https://www.twitch.tv/gubben/clip/SpicyCrunchyOtterKappa")).toEqual({
      provider: "twitch",
      videoId: "SpicyCrunchyOtterKappa",
    });
  });

  it("avvisar en twitch-länk som inte är ett klipp", () => {
    expect(parseClipUrl("https://www.twitch.tv/gubben")).toBeNull();
    expect(parseClipUrl("https://www.twitch.tv/videos/123456")).toBeNull();
  });
});

describe("parseClipUrl — Medal", () => {
  it("tar både den korta och den spelprefixade formen", () => {
    expect(parseClipUrl("https://medal.tv/clip/4954893/vpkPnOp0o")).toEqual({
      provider: "medal",
      videoId: "4954893/vpkPnOp0o",
    });
    expect(
      parseClipUrl("https://medal.tv/games/counter-strike-2/clips/4954893/vpkPnOp0o?invite=abc"),
    ).toEqual({ provider: "medal", videoId: "4954893/vpkPnOp0o" });
  });

  it("avvisar en medal-länk utan både id och nyckel", () => {
    expect(parseClipUrl("https://medal.tv/clip/4954893")).toBeNull();
    expect(parseClipUrl("https://medal.tv/u/gubben")).toBeNull();
  });
});

// Adressen kommer från ett formulär och blir till slut en iframe-källa. Det
// enda som skickas vidare är leverantör och id — själva strängen kastas — men
// tolkningen måste ändå hålla, för det är den som avgör vad som räknas som ett
// id över huvud taget.
describe("parseClipUrl — det som inte får släppas igenom", () => {
  it("släpper inte igenom andra protokoll", () => {
    expect(parseClipUrl("javascript:alert(1)")).toBeNull();
    expect(parseClipUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(parseClipUrl("file:///etc/passwd")).toBeNull();
  });

  // Värdnamnet jämförs helt, aldrig med "innehåller" — annars räcker det att
  // registrera youtube.com.nagonannan.se.
  it("nöjer sig inte med att värdnamnet liknar en känd tjänst", () => {
    expect(parseClipUrl("https://youtube.com.gubbar.se/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseClipUrl("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseClipUrl("https://gubbar.se/?x=https://youtu.be/dQw4w9WgXcQ")).toBeNull();
  });

  // https://youtube.com@gubbar.se ser ut att peka på YouTube men gör det inte —
  // allt före @ är användarnamn, och värden är gubbar.se.
  it("låter sig inte luras av användarnamn före värdnamnet", () => {
    expect(parseClipUrl("https://www.youtube.com@gubbar.se/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("avvisar det som inte är en adress alls", () => {
    expect(parseClipUrl("")).toBeNull();
    expect(parseClipUrl("inte en länk")).toBeNull();
    expect(parseClipUrl(null)).toBeNull();
    expect(parseClipUrl(42)).toBeNull();
    expect(parseClipUrl({ url: "https://youtu.be/dQw4w9WgXcQ" })).toBeNull();
  });
});

describe("parseClipInput", () => {
  it("tar emot en adress och en rubrik", () => {
    expect(parseClipInput({ url: "https://youtu.be/dQw4w9WgXcQ", title: "  Lasse ess  " })).toEqual({
      ok: true,
      value: { provider: "youtube", videoId: "dQw4w9WgXcQ", title: "Lasse ess" },
    });
  });

  it("säger vad som saknas i stället för att bara vägra", () => {
    expect(parseClipInput({ url: "https://gubbar.se/klipp", title: "Lasse" })).toEqual({
      ok: false,
      error: "url_unsupported",
    });
    expect(parseClipInput({ url: "https://youtu.be/dQw4w9WgXcQ", title: "   " })).toEqual({
      ok: false,
      error: "title_required",
    });
    expect(parseClipInput(null)).toEqual({ ok: false, error: "url_unsupported" });
  });

  it("håller rubriken enradig och rensad", () => {
    const parsed = parseClipInput({
      url: "https://youtu.be/dQw4w9WgXcQ",
      title: "Lasse\n\tess‮",
    });

    expect(parsed).toMatchObject({ ok: true, value: { title: "Lasse ess" } });
  });

  it("avvisar en rubrik som är för lång", () => {
    expect(
      parseClipInput({ url: "https://youtu.be/dQw4w9WgXcQ", title: "x".repeat(200) }),
    ).toEqual({ ok: false, error: "title_too_long" });
  });
});
