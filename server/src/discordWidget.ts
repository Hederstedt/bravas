// Discords widget-JSON är en publik endpoint som serverägaren aktiverar i
// serverinställningarna (Server Settings → Widget → Enable). Den kräver ingen
// autentisering, men den kräver att den är påslagen — är den av svarar Discord
// 403, och det är ett fullt normalt läge här, inte ett fel.
//
// Anropet görs från servern och inte från webbläsaren: då stannar server-ID:t
// i backend, svaret kan cachas för alla besökare på en gång, och sajten
// fortsätter att inte tala med någon tredje part från klienten.

const WIDGET_TIMEOUT_MS = 5_000;

// Widgeten listar bara de som är online, och Discord kapar själv listan vid
// 100. Vi *visar* färre än så — poängen är "vilka hänger här nu", inte en
// fullständig katalog.
//
// Taket satt förut här, i tolkningen, och det var fel plats: pollern som delar
// ut månadspoäng läste samma avkortade lista. Discord sorterar alfabetiskt, så
// på en server med fler än tolv online kunde en gubbe sent i alfabetet aldrig
// få en enda poäng, hur mycket han än hängde inne. Kapningen hör hemma vid
// utgången (publicDiscordStatus), inte i det pollern räknar på.
export const MAX_LISTED = 12;

export type DiscordPresence = "online" | "idle" | "dnd";

export interface DiscordMember {
  name: string;
  status: DiscordPresence;
  // Vad han spelar just nu, när Discord råkar veta det.
  game: string | null;
}

export interface DiscordStatus {
  // Falskt när server-ID saknas, widgeten är avstängd eller Discord inte
  // svarar. Sidan faller då tillbaka på den vanliga Discord-knappen.
  available: boolean;
  online: number;
  members: DiscordMember[];
}

export const DISCORD_UNAVAILABLE: DiscordStatus = {
  available: false,
  online: 0,
  members: [],
};

const PRESENCES = new Set<DiscordPresence>(["online", "idle", "dnd"]);

function toPresence(raw: unknown): DiscordPresence {
  return typeof raw === "string" && PRESENCES.has(raw as DiscordPresence)
    ? (raw as DiscordPresence)
    : "online";
}

// Bara namn, läge och spel plockas ut. Avatarer och id:n lämnas kvar hos
// Discord: avatarerna hade blivit externa bildanrop från vår sida, och id:na
// behöver vi inte till någonting.
export function parseWidget(payload: unknown): DiscordStatus {
  const data = payload as { presence_count?: unknown; members?: unknown };
  const rawMembers = Array.isArray(data?.members) ? data.members : [];

  const members: DiscordMember[] = [];
  for (const raw of rawMembers) {
    const m = raw as { username?: unknown; status?: unknown; game?: unknown };
    if (typeof m?.username !== "string" || !m.username) continue;
    const game = (m.game as { name?: unknown } | undefined)?.name;
    members.push({
      name: m.username,
      status: toPresence(m.status),
      game: typeof game === "string" && game ? game : null,
    });
  }

  // presence_count räknar alla online, även de som inte ryms i listan — så
  // siffran kan vara högre än members.length, och det är meningen.
  const count = typeof data?.presence_count === "number" ? data.presence_count : members.length;

  return { available: true, online: Math.max(0, count), members };
}

export async function fetchDiscordWidget(serverId: string): Promise<DiscordStatus> {
  if (!serverId) return DISCORD_UNAVAILABLE;

  try {
    const res = await fetch(`https://discord.com/api/guilds/${serverId}/widget.json`, {
      // Utan tidsgräns kan en tyst Discord hålla pollern hängande tills nästa
      // varv, och då står ögonblicksbilden still utan att någon vet varför.
      signal: AbortSignal.timeout(WIDGET_TIMEOUT_MS),
    });

    // 403 betyder att widgeten är avstängd — det vanligaste svaret innan någon
    // slagit på den, och inget att larma om.
    if (!res.ok) return DISCORD_UNAVAILABLE;

    return parseWidget(await res.json());
  } catch {
    return DISCORD_UNAVAILABLE;
  }
}
