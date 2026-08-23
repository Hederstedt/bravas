import { textField } from "./textInput.ts";

// Adressen gubben klistrar in blir till slut en iframe-källa. Därför sparas
// den aldrig: den tolkas här till en leverantör och ett id, och själva
// strängen kastas. Vyn bygger sedan sin embed-adress ur en fast mall (se
// src/clipEmbed.ts), så det finns ingen väg från något någon skrivit in till
// något som hamnar i ett src-attribut.
export type ClipProvider = "youtube" | "twitch" | "medal";

export interface ClipSource {
  provider: ClipProvider;
  videoId: string;
}

export const MAX_CLIP_TITLE_LENGTH = 120;

export interface ClipInput extends ClipSource {
  title: string;
}

export type ClipParseResult = { ok: true; value: ClipInput } | { ok: false; error: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
// Twitch-slugar är ihopsatta ord med siffror på slutet, ibland med bindestreck.
const TWITCH_SLUG = /^[A-Za-z0-9_-]{2,100}$/;
const MEDAL_ID = /^\d{1,12}$/;
const MEDAL_KEY = /^[A-Za-z0-9_-]{1,64}$/;

// Värdnamnet jämförs helt och hållet, aldrig med "innehåller" eller "slutar
// med" — youtube.com.nagonannan.se är trivialt att registrera. www. är den
// enda prefix som skalas bort.
function host(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function segments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function youtube(url: URL): ClipSource | null {
  const path = segments(url);
  const id =
    host(url) === "youtu.be"
      ? path[0]
      : path[0] === "watch"
        ? (url.searchParams.get("v") ?? undefined)
        : path[0] === "shorts" || path[0] === "embed"
          ? path[1]
          : undefined;

  return id && YOUTUBE_ID.test(id) ? { provider: "youtube", videoId: id } : null;
}

function twitch(url: URL): ClipSource | null {
  const path = segments(url);
  // clips.twitch.tv/<slug>, eller twitch.tv/<kanal>/clip/<slug>. En vanlig
  // kanal- eller video-länk är inget klipp och ska inte gå igenom.
  const slug = host(url) === "clips.twitch.tv" ? path[0] : path[1] === "clip" ? path[2] : undefined;

  return slug && TWITCH_SLUG.test(slug) ? { provider: "twitch", videoId: slug } : null;
}

function medal(url: URL): ClipSource | null {
  const path = segments(url);
  // medal.tv/clip/<id>/<nyckel>, eller medal.tv/games/<spel>/clips/<id>/<nyckel>.
  const at = path.indexOf("clip") >= 0 ? path.indexOf("clip") : path.indexOf("clips");
  if (at < 0) return null;

  const id = path[at + 1];
  const key = path[at + 2];
  if (!id || !key || !MEDAL_ID.test(id) || !MEDAL_KEY.test(key)) return null;

  // Både id och nyckel behövs för att spelaren ska hitta klippet, så de bärs
  // ihop. Varje del är validerad för sig — snedstrecket är det enda som skiljer.
  return { provider: "medal", videoId: `${id}/${key}` };
}

const PROVIDERS: Record<string, (url: URL) => ClipSource | null> = {
  "youtube.com": youtube,
  "m.youtube.com": youtube,
  "youtu.be": youtube,
  "twitch.tv": twitch,
  "m.twitch.tv": twitch,
  "clips.twitch.tv": twitch,
  "medal.tv": medal,
};

export function parseClipUrl(raw: unknown): ClipSource | null {
  if (typeof raw !== "string" || !raw.trim()) return null;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  // javascript: och data: parsar som giltiga adresser. Bara webbadresser får
  // komma vidare.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  return PROVIDERS[host(url)]?.(url) ?? null;
}

export function parseClipInput(body: unknown): ClipParseResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "url_unsupported" };
  const { url, title } = body as Record<string, unknown>;

  const source = parseClipUrl(url);
  if (!source) return { ok: false, error: "url_unsupported" };

  const parsedTitle = textField(title, MAX_CLIP_TITLE_LENGTH, "title");
  if (!parsedTitle.ok) return parsedTitle;

  return { ok: true, value: { ...source, title: parsedTitle.value } };
}
